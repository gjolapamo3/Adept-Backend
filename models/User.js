const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['BUYER', 'SUPPLIER', 'ADMIN'], 
    default: 'BUYER' 
  },
  phone: { type: String, required: true },
  address: {
    street: String,
    state: String,
    country: { type: String, default: 'Nigeria' }
  },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
