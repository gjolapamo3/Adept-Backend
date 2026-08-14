const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  supplier: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { type: String, required: true, trim: true },
  chemical_formula: { type: String, trim: true }, // e.g., "NH3" for Ammonia
  category: { 
    type: String, 
    required: true, 
    enum: ['nitrogen', 'ammonia', 'fertilizer', 'industrial_chemical', 'processing_agent'] 
  },
  unit_price: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  available_stock: { type: Number, required: true, min: 0 },
  unit_of_measure: { type: String, default: 'metric_tons' },
  purity_grade: { type: String }, // e.g., "Technical Grade", "99.5%"
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

// Indexing for high-performance searching and filtering
productSchema.index({ name: 'text', category: 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
