/**
 * ADEPT PROCESSING NIG LTD - Central Engine Backend
 * Node.js / Express Server for USSD (*992#), Escrow Webhooks, & Order Processing
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { fulfillOrderPayment } = require('./services/orderService');

const app = express();

// Enable proxy trust (essential when deployed behind load balancers like Render, Nginx, or AWS ALB)
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ==========================================
// 1. Rate Limiting Middleware
// ==========================================

// Global Limiter: Protects general API routes (100 requests per 15 minutes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many requests. Please try again later.'
  }
});

// USSD Limiter: Prevents rapid session spamming (30 requests per minute)
const ussdLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Returns plain-text END signal matching mobile network gateway expectations
  handler: (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(429).send('END System busy. Please try again in a moment.');
  }
});

// Apply global rate limiting to all API routes
app.use('/api/', globalLimiter);

// ==========================================
// 2. Monnify IP Whitelisting Middleware
// ==========================================

// Monnify official production IP address
const MONNIFY_ALLOWED_IPS = [
  '35.242.133.146',
  '::ffff:35.242.133.146' // IPv6-mapped IPv4 equivalent
];

const verifyMonnifyIP = (req, res, next) => {
  // Bypass IP restrictions during local development or unit testing
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Extract real client IP through reverse proxy headers
  const clientIp = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;

  if (MONNIFY_ALLOWED_IPS.includes(clientIp)) {
    return next();
  }

  console.warn(`[SECURITY REJECTION] Monnify Webhook blocked from IP: ${clientIp}`);
  return res.status(403).json({
    status: 403,
    error: 'Forbidden: Request origin not allowed.'
  });
};

// Environment Variables (Load via dotenv in production)
const PORT = process.env.PORT || 5000;
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY;
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE;
const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';

// In-Memory Database (Replace with PostgreSQL/Supabase Client)
const db = {
  rfqs: [
    {
      id: 'RFQ-0042',
      coop: 'Kano Apex Farmers Co-op',
      product: 'Urea 46% N',
      qty: 500,
      total: 397500000,
      status: 'OPEN_FOR_ESCROW',
      phone: '2348030000001',
      accountNumber: '9928374012',
    },
  ],
};

// Authenticate with Monnify and return an access token.
async function getMonnifyAccessToken() {
  try {
    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_BASE_URL) {
      throw new Error('Missing Monnify credentials or base URL in environment variables');
    }

    const authHeader = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString('base64');

    const response = await axios.post(
      `${MONNIFY_BASE_URL}/api/v1/auth/login`,
      {},
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    const responseData = response?.data;
    const accessToken = responseData?.responseBody?.accessToken;

    if (!accessToken) {
      const code = responseData?.responseCode ?? 'UNKNOWN';
      const message = responseData?.responseMessage ?? 'Missing responseBody/accessToken';
      throw new Error(`Monnify auth failed (${code}): ${message}`);
    }

    return accessToken;
  } catch (error) {
    console.error('Monnify Auth Error:', error?.response?.data || error?.message || error);
    return null;
  }
}

// Generate Dynamic NIBSS Virtual Account for Escrow
async function generateEscrowVirtualAccount(accountDetails) {
  const token = await getMonnifyAccessToken();
  if (!token) {
    throw new Error('Failed to obtain Monnify access token.');
  }

  const response = await axios.post(
    `${MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts`,
    accountDetails,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const resBody = response?.data?.responseBody || {};
  const accounts = Array.isArray(resBody.accounts) ? resBody.accounts : [];

  // Primary account from accounts[] (Monnify v2)
  const primary = accounts[0] || {};

  // Fallback chain in case accounts[] is missing/empty
  const accountNumber = primary.accountNumber || resBody.accountNumber || null;
  const bankName = primary.bankName || resBody.bankName || null;
  const bankCode = primary.bankCode || resBody.bankCode || null;
  const accountName = primary.accountName || resBody.accountName || null;

  return {
    reservationReference: resBody.reservationReference || null,
    accountReference: resBody.accountReference || null,
    accountName,
    accountNumber,
    bankName,
    bankCode,
    allAccounts: accounts.map((acc) => ({
      accountNumber: acc?.accountNumber || null,
      bankName: acc?.bankName || null,
      bankCode: acc?.bankCode || null,
      accountName: acc?.accountName || null,
    })),
  };
}

// =============================================================================
// 3. AFRICA'S TALKING USSD GATEWAY ENDPOINT (*992#)
// =============================================================================
app.post('/api/v1/ussd', ussdLimiter, async (req, res) => {
  const { phoneNumber, text } = req.body;
  let response = '';

  const inputArray = text ? text.split('*') : [];
  const currentStep = inputArray.length;

  if (text === '') {
    response = `CON Welcome to Adept Processing (*992#)
1. Check Factory Stock
2. Order Custom NPK Blend
3. Check Escrow Status`;
  } else if (text === '1') {
    response = `END LIVE FACTORY STOCK:
- Dangote Urea 46% N: 10,000 MT (N795k/MT)
- NPK 15:15:15: 4,500 MT (N706k/MT)
- NPK 20:10:10: 3,200 MT (N735k/MT)`;
  } else if (text === '2') {
    response = `CON CUSTOM BLEND (NPK 20:10:10)
Enter required Tonnage in MT:
(e.g., enter 200 for 200 MT)`;
  } else if (text === '3') {
    const openRFQ = db.rfqs.find((r) => r.phone === phoneNumber) || db.rfqs[0];
    response = `END ACTIVE ESCROW STATUS:
Ref: ${openRFQ.id}
Status: ${openRFQ.status}
Virtual Acc: ${openRFQ.accountNumber} (Wema Bank)`;
  } else if (currentStep === 2 && inputArray[0] === '2') {
    const qty = parseInt(inputArray[1], 10);
    if (!Number.isNaN(qty) && qty > 0) {
      const estimatedTotal = qty * 735000;
      response = `CON CONFIRM USSD ORDER:
Custom NPK 20:10:10 x ${qty} MT
Total Value: N${estimatedTotal.toLocaleString()}

1. Confirm & Issue Contract
2. Cancel`;
    } else {
      response = 'END Invalid Quantity. Please dial *992# again.';
    }
  } else if (currentStep === 3 && inputArray[0] === '2') {
    const confirmation = inputArray[2];
    if (confirmation === '1') {
      const qty = parseInt(inputArray[1], 10);
      const newRfqId = `RFQ-00${db.rfqs.length + 44}`;
      const totalAmount = qty * 735000;

      try {
        const vAcc = await generateEscrowVirtualAccount({
          accountReference: newRfqId,
          accountName: `Adept Escrow - USSD Node (${phoneNumber})`,
          currencyCode: 'NGN',
          contractCode: MONNIFY_CONTRACT_CODE,
          customerEmail: `ussd_${newRfqId.toLowerCase()}@adeptprocessing.ng`,
          customerName: `USSD Node (${phoneNumber})`,
          getAllAvailableBanks: false,
          preferredBanks: ['035'],
        });

        if (!vAcc?.accountNumber) {
          console.error('Virtual Account Generation Failed:', vAcc?.bankName || 'Unknown error');
          response = 'END Unable to create escrow account at the moment. Please try again later.';
        } else {
          const newRFQ = {
            id: newRfqId,
            coop: `USSD Order (${phoneNumber})`,
            product: 'Custom NPK 20:10:10',
            qty,
            total: totalAmount,
            status: 'OPEN_FOR_ESCROW',
            phone: phoneNumber,
            accountNumber: vAcc.accountNumber,
          };

          db.rfqs.push(newRFQ);

          response = `END CONTRACT ISSUED!
ID: ${newRfqId}
Pay N${totalAmount.toLocaleString()} to:
Bank: ${vAcc.bankName}
Acc No: ${vAcc.accountNumber}
Funds will lock in Escrow.`;
        }
      } catch (error) {
        console.error('USSD Order Processing Error:', error?.message || error);
        response = 'END An error occurred processing your order. Please try again later.';
      }
    } else {
      response = 'END Order Cancelled.';
    }
  } else {
    response = 'END Invalid Selection. Try again.';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// =============================================================================
// 4. MONNIFY / PAYSTACK BANK ESCROW WEBHOOK
// =============================================================================
app.post('/api/v1/payments/monnify-webhook', verifyMonnifyIP, async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (eventType === 'SUCCESSFUL_TRANSACTION' && eventData.paymentStatus === 'PAID') {
      const paymentData = {
        paymentReference: eventData.transactionReference,
        orderReference: eventData.paymentReference,
        amountPaid: eventData.amountPaid,
        paymentMethod: eventData.paymentMethod,
        rawPayload: req.body,
      };

      const result = await fulfillOrderPayment(paymentData);
      console.log(`[ORDER EXECUTION] Order ${eventData.paymentReference} state updated:`, result.status);
    }

    return res.status(200).json({ status: 'success', message: 'Webhook processed' });
  } catch (error) {
    console.error('[ORDER EXECUTION ERROR]:', error.message);
    return res.status(200).json({ status: 'error', message: error.message });
  }
});

// =============================================================================
// 5. REST API FOR WEB DASHBOARD & MOBILE FIELD APP
// =============================================================================
app.get('/api/v1/rfqs', (req, res) => {
  res.json({ success: true, data: db.rfqs });
});

app.post('/api/v1/rfqs/create', async (req, res) => {
  const { coop, product, qty, pricePerTon, phone } = req.body;
  const newRfqId = `RFQ-00${db.rfqs.length + 44}`;
  const total = qty * pricePerTon;

  try {
    const vAcc = await generateEscrowVirtualAccount({
      accountReference: newRfqId,
      accountName: `Adept Escrow - ${coop}`,
      currencyCode: 'NGN',
      contractCode: MONNIFY_CONTRACT_CODE,
      customerEmail: `rfq_${newRfqId.toLowerCase()}@adeptprocessing.ng`,
      customerName: coop,
      getAllAvailableBanks: false,
      preferredBanks: ['035'],
    });

    if (!vAcc?.accountNumber) {
      return res.status(502).json({
        success: false,
        message: 'Unable to create escrow virtual account',
        data: null,
      });
    }

    const newRFQ = {
      id: newRfqId,
      coop,
      product,
      qty,
      total,
      status: 'OPEN_FOR_ESCROW',
      phone,
      accountNumber: vAcc.accountNumber,
    };

    db.rfqs.push(newRFQ);
    res.json({ success: true, data: newRFQ });
  } catch (error) {
    console.error('RFQ Creation Error:', error?.message || error);
    return res.status(502).json({
      success: false,
      message: error?.message || 'Failed to create RFQ with escrow account',
      data: null,
    });
  }
});

// Lightweight process health endpoint for platform probes.
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start Server (skip during tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Adept Processing Nig LTD Backend Engine Running on Port ${PORT}`);
  });
}

module.exports = app;
