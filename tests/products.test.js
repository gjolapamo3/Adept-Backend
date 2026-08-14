const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { connectDatabase } = require('../config/database');
const { seedProducts } = require('../scripts/seedProducts');
const app = require('../server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await connectDatabase();
  await seedProducts();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

it('returns seeded products with MongoDB IDs', async () => {
  const response = await request(app).get('/api/products');

  expect(response.status).toBe(200);
  expect(response.body.totalProducts).toBe(4);
  expect(response.body.products).toEqual(expect.arrayContaining([
    expect.objectContaining({
      _id: expect.stringMatching(/^[a-f\d]{24}$/i),
      name: 'Urea 46-0-0',
      unit_price: 795000,
    }),
  ]));
});