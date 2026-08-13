const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit_price: { type: Number, required: true },
  unit_of_measure: { type: String, default: 'metric_tons' }
});

const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'paid', 'processing', 'in-transit', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  delivery_details: {
    shipping_address: { type: String, required: true },
    contact_phone: { type: String, required: true },
    delivery_notes: String
  },
  payment_reference: { type: String },
  payment_method: { type: String, default: 'bank_transfer' }
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
