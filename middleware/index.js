const crypto = require('crypto');

// Monnify official production outbound IP addresses
const MONNIFY_WHITELISTED_IPS = [
  '35.242.133.146',
  '35.233.227.185'
];

const verifyMonnifyWebhook = (req, res, next) => {
  try {
    // Bypass strict signature enforcement outside production (mirrors verifyMonnifyIP in server.js)
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    // 1. IP Whitelist Verification
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0]
      .trim();

    if (process.env.NODE_ENV === 'production' && !MONNIFY_WHITELISTED_IPS.includes(clientIp)) {
      console.warn(`[Security Alert] Webhook rejected from unauthorized IP: ${clientIp}`);
      return res.status(403).json({ status: 'error', message: 'Forbidden: IP origin unauthorized' });
    }

    // 2. Signature Header Check
    const monnifySignature = req.headers['monnify-signature'];
    if (!monnifySignature) {
      console.warn('[Security Alert] Webhook missing monnify-signature header');
      return res.status(400).json({ status: 'error', message: 'Missing signature header' });
    }

    // 3. HMAC SHA-512 Hash Calculation
    const secretKey = process.env.MONNIFY_SECRET_KEY;
    if (!secretKey) {
      console.error('[Config Error] MONNIFY_SECRET_KEY is not set in Render environment variables');
      return res.status(500).json({ status: 'error', message: 'Server configuration error' });
    }

    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const calculatedSignature = crypto
      .createHmac('sha512', secretKey)
      .update(payload)
      .digest('hex');

    // 4. Constant-time String Comparison
    const sigBuffer = Buffer.from(monnifySignature, 'utf8');
    const calcBuffer = Buffer.from(calculatedSignature, 'utf8');

    if (sigBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(sigBuffer, calcBuffer)) {
      console.warn('[Security Alert] HMAC SHA-512 signature hash mismatch');
      return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid signature' });
    }

    // Validation successful!
    next();
  } catch (error) {
    console.error('Monnify Webhook verification error:', error);
    return res.status(500).json({ status: 'error', message: 'Webhook security verification failed' });
  }
};

module.exports = verifyMonnifyWebhook;
