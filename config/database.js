const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

const removeLegacyOrderReferenceIndex = async () => {
  try {
    const indexes = await Order.collection.listIndexes().toArray();
    const legacyIndex = indexes.find((index) => (
      index.name === 'orderReference_1' && index.key?.orderReference === 1
    ));

    if (legacyIndex) {
      await Order.collection.dropIndex(legacyIndex.name);
      console.log('Removed legacy orderReference index');
    }
  } catch (error) {
    if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }
};

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI or MONGO_URI is not configured');
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');

  await removeLegacyOrderReferenceIndex();
  await seedCatalogIfEmpty();
};

// Lazily required to avoid a require-cycle with config/database.js
const seedCatalogIfEmpty = async () => {
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    console.log('Product catalog is empty, running seeder...');
    const { seedProducts } = require('../scripts/seedProducts');
    await seedProducts();
  }
};

module.exports = { connectDatabase };