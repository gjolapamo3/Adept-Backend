const express = require('express');
const router = express.Router();
const { createOrder } = require('../controllers/orderController');
const { validateOrderInput } = require('../middleware/validateOrder');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/checkRole');

// Protected Route: Must be logged in AND have role 'buyer'
router.post(
  '/', 
  verifyToken, 
  checkRole('buyer'), 
  validateOrderInput, 
  createOrder
);

module.exports = router;
