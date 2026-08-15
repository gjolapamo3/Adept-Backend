const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connectDatabase } = require('../config/database');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { fulfillOrderPayment } = require('../services/orderService');

let mongoServer;

jest.setTimeout(60000);

// Transactions require a replica set, unlike the standalone instances used by other test files.
beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongoServer.getUri();
  await connectDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Promise.all([
    Product.deleteMany({}),
    Order.deleteMany({}),
    Transaction.deleteMany({}),
    User.deleteMany({}),
  ]);
});

const createBuyer = async () => User.create({
  name: 'Test Buyer',
  email: `buyer-${Date.now()}-${Math.random()}@example.com`,
  password: 'StrongPass123',
  role: 'buyer',
});

const createProduct = async (overrides = {}) => {
  const supplier = await User.create({
    name: 'Test Supplier',
    email: `supplier-${Date.now()}-${Math.random()}@example.com`,
    password: 'StrongPass123',
    role: 'supplier',
  });

  return Product.create({
    supplier: supplier._id,
    name: 'Urea 46-0-0',
    category: 'fertilizer',
    unit_price: 1000,
    available_stock: 10,
    ...overrides,
  });
};

describe('fulfillOrderPayment (replica-set transaction)', () => {
  it('atomically deducts stock and marks the order paid on a matching payment', async () => {
    const product = await createProduct();
    const buyer = await createBuyer();

    const order = await Order.create({
      order_reference: 'APT-ORD-TEST-1',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 3, unit_price: 1000 }],
      total_amount: 3000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    const result = await fulfillOrderPayment({
      paymentReference: 'TXN-TEST-1',
      orderReference: order.order_reference,
      amountPaid: 3000,
      paymentMethod: 'ACCOUNT_TRANSFER',
      rawPayload: {},
    });

    expect(result.status).toBe('SUCCESS');

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.available_stock).toBe(7);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.status).toBe('paid');

    const transaction = await Transaction.findOne({ paymentReference: 'TXN-TEST-1' });
    expect(transaction.paymentStatus).toBe('SUCCESS');
  });

  it('rolls back the entire transaction when payment amount does not match the order total', async () => {
    const product = await createProduct();
    const buyer = await createBuyer();

    const order = await Order.create({
      order_reference: 'APT-ORD-TEST-2',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 3, unit_price: 1000 }],
      total_amount: 3000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    await expect(fulfillOrderPayment({
      paymentReference: 'TXN-TEST-2',
      orderReference: order.order_reference,
      amountPaid: 2500,
      paymentMethod: 'ACCOUNT_TRANSFER',
      rawPayload: {},
    })).rejects.toThrow('Payment amount does not match order total');

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.available_stock).toBe(10);

    const unchangedOrder = await Order.findById(order._id);
    expect(unchangedOrder.status).toBe('pending');

    const transaction = await Transaction.findOne({ paymentReference: 'TXN-TEST-2' });
    expect(transaction).toBeNull();
  });

  it('rolls back when stock is insufficient at fulfillment time', async () => {
    const product = await createProduct({ available_stock: 1 });
    const buyer = await createBuyer();

    const order = await Order.create({
      order_reference: 'APT-ORD-TEST-3',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 3, unit_price: 1000 }],
      total_amount: 3000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    await expect(fulfillOrderPayment({
      paymentReference: 'TXN-TEST-3',
      orderReference: order.order_reference,
      amountPaid: 3000,
      paymentMethod: 'ACCOUNT_TRANSFER',
      rawPayload: {},
    })).rejects.toThrow(/Insufficient stock/);

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.available_stock).toBe(1);

    const unchangedOrder = await Order.findById(order._id);
    expect(unchangedOrder.status).toBe('pending');
  });

  it('is idempotent when the same payment reference is processed twice', async () => {
    const product = await createProduct();
    const buyer = await createBuyer();

    const order = await Order.create({
      order_reference: 'APT-ORD-TEST-4',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 2, unit_price: 1000 }],
      total_amount: 2000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    const paymentData = {
      paymentReference: 'TXN-TEST-4',
      orderReference: order.order_reference,
      amountPaid: 2000,
      paymentMethod: 'ACCOUNT_TRANSFER',
      rawPayload: {},
    };

    const first = await fulfillOrderPayment(paymentData);
    const second = await fulfillOrderPayment(paymentData);

    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('ALREADY_PROCESSED');

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.available_stock).toBe(8);
  });
});

describe('Order idempotency_key', () => {
  it('rejects a second order with the same idempotency key for the same buyer', async () => {
    const product = await createProduct();
    const buyer = await createBuyer();

    await Order.create({
      order_reference: 'APT-ORD-IDEMP-1',
      buyer: buyer._id,
      idempotency_key: 'client-key-123',
      items: [{ product_id: product._id, quantity: 1, unit_price: 1000 }],
      total_amount: 1000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    await expect(Order.create({
      order_reference: 'APT-ORD-IDEMP-2',
      buyer: buyer._id,
      idempotency_key: 'client-key-123',
      items: [{ product_id: product._id, quantity: 1, unit_price: 1000 }],
      total_amount: 1000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    })).rejects.toThrow(/duplicate key|E11000/);
  });

  it('allows multiple orders without an idempotency key', async () => {
    const product = await createProduct();
    const buyer = await createBuyer();

    const orderA = await Order.create({
      order_reference: 'APT-ORD-NOKEY-1',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 1, unit_price: 1000 }],
      total_amount: 1000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    const orderB = await Order.create({
      order_reference: 'APT-ORD-NOKEY-2',
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 1, unit_price: 1000 }],
      total_amount: 1000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });

    expect(orderA.idempotency_key).toBeUndefined();
    expect(orderB.idempotency_key).toBeUndefined();
  });
});
