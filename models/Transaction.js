// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  paymentReference: { type: String, required: true, unique: true }, // Monnify transactionReference
  orderReference: { type: String, required: true, ref: 'Order' },
  amountPaid: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  paymentStatus: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'PENDING' },
  paymentMethod: { type: String }, // e.g., "CARD", "ACCOUNT_TRANSFER"
  rawWebhookPayload: { type: Object } // Audit log for Monnify raw responses
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
