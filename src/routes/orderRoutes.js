const express = require('express');
const router = express.Router();
const { createOrder } = require('../controllers/orderController');
const { validateOrderInput } = require('../middleware/validateOrder');

// POST /api/orders
router.post('/', validateOrderInput, createOrder);

module.exports = router;
