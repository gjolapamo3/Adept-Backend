const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true }, // e.g., "Industrial Anhydrous Ammonia"
  category: { type: String, required: true }, // e.g., "Fertilizer", "Chemical"
  chemicalGrade: { type: String }, // e.g., "Technical Grade", "Agricultural Grade"
  pricePerUnit: { type: Number, required: true }, // Price in NGN
  unit: { type: String, required: true, enum: ['TONNE', 'KG', 'LITRE', 'BAG'] },
  availableStock: { type: Number, required: true, min: 0 },
  location: { type: String, required: true }, // Warehouse/State location
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
