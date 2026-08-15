const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { connectDatabase } = require('../config/database');
const app = require('../server'); // if server exports app
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
  await connectDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Adept backend e2e flow', () => {
  it('registers a user and returns a JWT token', async () => {
    const email = `auth-test-${Date.now()}@example.com`;

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Auth Test User',
        email,
        password: 'StrongPass123',
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: 'Auth Test User',
      email,
      role: 'buyer',
    });
    expect(typeof response.body.token).toBe('string');
    expect(response.body.token.length).toBeGreaterThan(20);
  });

  it('returns populated product, supplier, and status timeline data for an associated buyer', async () => {
    const buyer = await User.create({
      name: 'Tracking Buyer',
      email: `tracking-buyer-${Date.now()}@example.com`,
      password: 'StrongPass123',
      role: 'buyer',
    });
    const supplier = await User.create({
      name: 'Tracking Supplier',
      email: `tracking-supplier-${Date.now()}@example.com`,
      password: 'StrongPass123',
      role: 'supplier',
    });
    const product = await Product.create({
      supplier: supplier._id,
      name: 'Tracking Fertilizer',
      category: 'fertilizer',
      unit_price: 2500,
      available_stock: 10,
    });
    const order = await Order.create({
      order_reference: `APT-TRACK-${Date.now()}`,
      buyer: buyer._id,
      items: [{ product_id: product._id, quantity: 2, unit_price: 2500 }],
      total_amount: 5000,
      delivery_details: { shipping_address: 'Lagos', contact_phone: '+2348000000000' },
    });
    const token = require('jsonwebtoken').sign(
      { id: buyer._id, role: buyer.role },
      process.env.JWT_SECRET
    );

    const response = await request(app)
      .get(`/api/orders/${order._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.buyer).toMatchObject({ name: 'Tracking Buyer', role: 'buyer' });
    expect(response.body.items[0].product_id).toMatchObject({ name: 'Tracking Fertilizer' });
    expect(response.body.items[0].product_id.supplier).toMatchObject({
      name: 'Tracking Supplier',
      role: 'supplier',
    });
    expect(response.body.status_history[0]).toMatchObject({
      status: 'pending',
      changed_by: { name: 'Tracking Buyer' },
    });
  });

  it('serves a live dashboard page that polls the backend data endpoint', async () => {
    const response = await request(app).get('/dashboard/live');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('/api/v1/dashboard/live');
    expect(response.text).toContain('/api/v1/marketplace/events');
    expect(response.text).toContain('new EventSource(streamEndpoint)');
    expect(response.text).toContain('id="manual-refresh"');
    expect(response.text).toContain('id="poll-interval"');
    expect(response.text).toContain('id="rfq-status-filter"');
    expect(response.text).toContain('id="transaction-search"');
    expect(response.text).toContain('id="metric-total-rfqs"');
    expect(response.text).toContain('id="rfq-rows"');
    expect(response.text).toContain('id="transaction-rows"');
  });

  it('registers required webhook and transaction routes', async () => {
    const monnifyWebhookResponse = await request(app)
      .post('/api/v1/monnify/webhook')
      .send({ eventType: 'PING' });

    expect(monnifyWebhookResponse.status).toBe(200);

    const ussdWebhookResponse = await request(app)
      .post('/api/v1/ussd/webhook')
      .send({
        sessionId: 'session-route-check',
        serviceCode: '*992#',
        phoneNumber: '+2348000000000',
        text: ''
      });

    expect(ussdWebhookResponse.status).toBe(200);
    expect(typeof ussdWebhookResponse.text).toBe('string');

    const transactionsResponse = await request(app).get('/api/v1/transactions');
    expect(transactionsResponse.status).toBe(200);
    expect(transactionsResponse.body.success).toBe(true);
    expect(Array.isArray(transactionsResponse.body.data)).toBe(true);
  });

  it('seeds mock Monnify and USSD telemetry, then exposes transaction lookups', async () => {
    const monnifyPayload = {
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        paymentStatus: 'PAID',
        transactionReference: 'TXN-TEST-0001',
        paymentReference: 'ORDER-TEST-0001',
        amountPaid: 500000,
        paymentMethod: 'ACCOUNT_TRANSFER'
      }
    };

    const monnifyResponse = await request(app)
      .post('/api/v1/monnify/webhook')
      .send(monnifyPayload);

    expect(monnifyResponse.status).toBe(200);
    expect(monnifyResponse.body.status).toBe('success');

    const ussdResponse = await request(app)
      .post('/api/v1/ussd/webhook')
      .send({
        sessionId: 'session-telemetry-1',
        serviceCode: '*992#',
        phoneNumber: '+2348012345678',
        text: '2*200*1'
      });

    expect(ussdResponse.status).toBe(200);
    expect(ussdResponse.text).toContain('CONTRACT ISSUED!');

    const transactionListResponse = await request(app).get('/api/v1/transactions');
    expect(transactionListResponse.status).toBe(200);
    expect(transactionListResponse.body.data.some((txn) => txn.paymentReference === 'TXN-TEST-0001')).toBe(true);

    const singleTransactionResponse = await request(app).get('/api/v1/transactions/TXN-TEST-0001');
    expect(singleTransactionResponse.status).toBe(200);
    expect(singleTransactionResponse.body.success).toBe(true);
    expect(singleTransactionResponse.body.data.orderReference).toBe('ORDER-TEST-0001');
  });

  it('updates dashboard metrics and rows across polling intervals', async () => {
    const before = await request(app).get('/api/v1/dashboard/live');
    expect(before.status).toBe(200);

    const beforeMetrics = before.body.metrics;
    const beforeRows = before.body.rows;

    await request(app)
      .post('/api/v1/ussd/webhook')
      .send({
        sessionId: 'session-polling-1',
        serviceCode: '*992#',
        phoneNumber: '+2348099990000',
        text: '2*150*1'
      });

    const after = await request(app).get('/api/v1/dashboard/live');
    expect(after.status).toBe(200);

    expect(after.body.metrics.totalRfqs).toBeGreaterThan(beforeMetrics.totalRfqs);
    expect(after.body.metrics.openForEscrow).toBeGreaterThanOrEqual(beforeMetrics.openForEscrow);
    expect(after.body.rows.length).toBeGreaterThan(beforeRows.length);
    expect(after.body.rows.some((row) => row.coop.includes('+2348099990000'))).toBe(true);
  });

  it('creates an escrow RFQ through the USSD flow and exposes it in the RFQ list', async () => {
    const ussdResponse = await request(app)
      .post('/api/v1/ussd')
      .send({
        sessionId: 'session-1',
        serviceCode: '*992#',
        phoneNumber: '+2348012345678',
        text: '2*200*1'
      });

    expect(ussdResponse.status).toBe(200);
    expect(ussdResponse.text).toContain('CONTRACT ISSUED!');
    expect(ussdResponse.text).toContain('Acc No:');

    const rfqListResponse = await request(app).get('/api/v1/rfqs');

    expect(rfqListResponse.status).toBe(200);
    expect(rfqListResponse.body.success).toBe(true);
    expect(Array.isArray(rfqListResponse.body.data)).toBe(true);
    expect(rfqListResponse.body.data.some((rfq) => rfq.phone === '+2348012345678')).toBe(true);
  });
});
