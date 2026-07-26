// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderReference: { type: String, required: true, unique: true }, // Custom ID, e.g. APT-ORD-8923
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'FULFILLED', 'CANCELLED'], 
    default: 'PENDING_PAYMENT' 
  },
  deliveryAddress: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
