const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { connectDatabase } = require('../config/database');
const app = require('../server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'auth-test-secret';
  await connectDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('authentication', () => {
  it('registers and logs in a user', async () => {
    const email = `auth-${Date.now()}@example.com`;
    const password = 'StrongPass123';

    const registration = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Auth Test User', email, password });

    expect(registration.status).toBe(201);
    expect(registration.body.token).toEqual(expect.any(String));
    expect(registration.body.user).toEqual({
      _id: expect.any(String),
      name: 'Auth Test User',
      email,
      role: 'buyer',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.user).toEqual(registration.body.user);
  });
});
