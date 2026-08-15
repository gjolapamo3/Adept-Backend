const express = require('express');
const router = express.Router();
const { createOrder, getOrderById, updateOrderStatus } = require('../controllers/orderController');
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

router.get(
  '/:id',
  verifyToken,
  checkRole('buyer', 'supplier', 'admin'),
  getOrderById
);

// Protected Route: Buyer, supplier, or admin can update status, subject to role/FSM checks in the controller
router.patch(
  '/:id/status',
  verifyToken,
  checkRole('buyer', 'supplier', 'admin'),
  updateOrderStatus
);

module.exports = router;
