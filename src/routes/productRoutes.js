const express = require('express');
const router = express.Router();
const { getProducts, createProduct } = require('../controllers/productController');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');

// Public route: Anyone can browse or search the marketplace catalog
router.get('/', getProducts);

// Protected route: Only authenticated suppliers can add new inventory
router.post('/', verifyToken, checkRole('supplier'), createProduct);

module.exports = router;
