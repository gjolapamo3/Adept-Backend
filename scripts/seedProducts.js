const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../src/models/Product');

const supplierEmail = 'catalog@adeptprocessing.ng';

const products = [
  {
    name: 'Urea 46-0-0',
    chemical_formula: 'CO(NH2)2',
    category: 'nitrogen',
    unit_price: 795000,
    available_stock: 10000,
    purity_grade: 'Agricultural Grade',
  },
  {
    name: 'NPK 15-15-15',
    chemical_formula: 'NPK 15-15-15',
    category: 'fertilizer',
    unit_price: 706000,
    available_stock: 4500,
    purity_grade: 'Compound Fertilizer',
  },
  {
    name: 'NPK 20-10-10',
    chemical_formula: 'NPK 20-10-10',
    category: 'fertilizer',
    unit_price: 735000,
    available_stock: 3200,
    purity_grade: 'Compound Fertilizer',
  },
  {
    name: 'Glyphosate 480 SL',
    chemical_formula: 'C3H8NO5P',
    category: 'processing_agent',
    unit_price: 42000,
    available_stock: 800,
    unit_of_measure: 'litres',
    purity_grade: '480 g/L',
  },
];

const seedProducts = async () => {
  const supplier = await User.findOneAndUpdate(
    { email: supplierEmail },
    {
      $setOnInsert: {
        name: 'Adept Catalog Supplier',
        email: supplierEmail,
        password: 'catalog-supplier-not-for-login',
        role: 'supplier',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  for (const product of products) {
    await Product.findOneAndUpdate(
      { name: product.name, supplier: supplier._id },
      { $set: { ...product, supplier: supplier._id, is_active: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  const seededProducts = await Product.find({ supplier: supplier._id }).sort({ name: 1 });
  console.log(`Seeded ${seededProducts.length} catalog products.`);
  return seededProducts;
};

if (require.main === module) {
  // Connect directly (not via connectDatabase) since that already auto-seeds on an empty catalog
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  mongoose.connect(mongoUri)
    .then(() => seedProducts())
    .catch((error) => {
      console.error('Product seeding failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { seedProducts };