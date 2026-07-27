// Set Monnify env vars before the server module is loaded so the credential
// check inside getMonnifyAccessToken() passes during tests.
process.env.MONNIFY_API_KEY = 'test-api-key';
process.env.MONNIFY_SECRET_KEY = 'test-secret-key';
process.env.MONNIFY_CONTRACT_CODE = 'test-contract-code';

const request = require('supertest');
const axios = require('axios');

jest.mock('axios');

const app = require('../server'); // if server exports app
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

describe('Adept backend e2e flow', () => {
  it('creates an escrow RFQ through the USSD flow and exposes it in the RFQ list', async () => {
    // Mock Monnify auth token request
    axios.post.mockResolvedValueOnce({
      data: {
        responseBody: {
          accessToken: 'test-access-token',
        },
      },
    });

    // Mock Monnify reserved account creation
    axios.post.mockResolvedValueOnce({
      data: {
        responseBody: {
          reservationReference: 'test-reservation-ref',
          accountReference: 'RFQ-0045',
          accounts: [
            {
              accountNumber: '1234567890',
              bankName: 'Wema Bank',
              bankCode: '035',
              accountName: 'Adept Escrow - USSD Node (+2348012345678)',
            },
          ],
        },
      },
    });

    const ussdResponse = await request(app)
      .post('/api/v1/ussd')
      .send({
        sessionId: 'session-1',
        serviceCode: '*992#',
        phoneNumber: '+2348012345678',
        text: '2*200*1',
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
