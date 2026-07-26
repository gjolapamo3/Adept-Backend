const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import your Express app & models
const app = require('../src/app'); 
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

let mongoServer;
let supplierToken, buyerToken;
let productId, orderId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Adept-Backend E2E Pipeline', () => {

  // --- STEP 3: AUTH & TOKENS ---
  test('Step 3: Register Supplier & Buyer Users', async () => {
    // 1. Create Supplier
    const supplierRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'supplier@adept.com', password: 'Password123!', role: 'supplier' });
    supplierToken = supplierRes.body.token;

    // 2. Create Buyer
    const buyerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'buyer@adept.com', password: 'Password123!', role: 'buyer' });
    buyerToken = buyerRes.body.token;

    expect(supplierToken).toBeDefined();
    expect(buyerToken).toBeDefined();
  });

  // --- STEP 4 & 1: MARKETPLACE CATALOG ---
  test('Step 4: Supplier Creates Product Listing (100 Tons Ammonia)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${supplierToken}`)
      .send({
        name: 'Industrial Ammonia',
        category: 'ammonia',
        unit_price: 450000,
        available_stock: 100
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.product.available_stock).toBe(100);
    productId = res.body.product._id;
  });

  // --- STEP 2: PLACE PENDING ORDER ---
  test('Step 2a: Buyer Places Order for 25 Tons', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        items: [{ product_id: productId, quantity: 25, unit_price: 450000 }],
        delivery_details: { shipping_address: 'Plot 12 Industrial Estate, Lagos', contact_phone: '+2348000000000' }
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.order_id).toBeDefined();
    orderId = res.body.order_id;
  });

  // --- STEP 2: ATOMIC WEBHOOK EXECUTION ---
  test('Step 2b: Payment Webhook Fires & Atomically Deducts Stock', async () => {
    const webhookRes = await request(app)
      .post('/api/webhooks/payment')
      .send({
        event: 'payment.success',
        status: 'successful',
        order_id: orderId,
        transaction_reference: 'TX_REF_999'
      });

    expect(webhookRes.statusCode).toBe(200);

    // Verify stock dropped from 100 to 75
    const updatedProduct = await Product.findById(productId);
    expect(updatedProduct.available_stock).toBe(75);

    // Verify order status updated to paid
    const updatedOrder = await Order.findById(orderId);
    expect(updatedOrder.status).toBe('paid');
  });

});
