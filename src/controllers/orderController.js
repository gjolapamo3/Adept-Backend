const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { buildOrderItemsFromCatalog } = require('../../services/orderService');

const createOrder = async (req, res) => {
  try {
    const { items, delivery_details, payment_method } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ buyer: req.user.id, idempotency_key: idempotencyKey });
      if (existingOrder) {
        return res.status(200).json({
          message: 'Duplicate order request ignored.',
          order_id: existingOrder._id,
          order_reference: existingOrder.order_reference,
          total_amount: existingOrder.total_amount
        });
      }
    }

    const productIds = items.map((item) => item.product_id || item.productId || item._id || item.id);
    const catalog = await Product.find({ _id: { $in: productIds } }).lean();

    if (catalog.length !== productIds.length) {
      const missingIds = productIds.filter((id) => !catalog.some((product) => String(product._id) === String(id)));
      return res.status(400).json({ error: `Products not found: ${missingIds.join(', ')}` });
    }

    const { items: normalizedItems, totalAmount } = buildOrderItemsFromCatalog(items, catalog);

    const orderReference = `APT-ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    let newOrder;
    try {
      newOrder = await Order.create({
        buyer: req.user.id,
        order_reference: orderReference,
        idempotency_key: idempotencyKey || undefined,
        items: normalizedItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          unit_of_measure: item.unit_of_measure
        })),
        total_amount: totalAmount,
        delivery_details,
        payment_method,
        status: 'pending'
      });
    } catch (createError) {
      // Concurrent duplicate request raced past the pre-check; return the winner's order instead of erroring.
      if (createError?.code === 11000 && idempotencyKey) {
        const winningOrder = await Order.findOne({ buyer: req.user.id, idempotency_key: idempotencyKey });
        if (winningOrder) {
          return res.status(200).json({
            message: 'Duplicate order request ignored.',
            order_id: winningOrder._id,
            order_reference: winningOrder.order_reference,
            total_amount: winningOrder.total_amount
          });
        }
      }
      throw createError;
    }

    return res.status(201).json({
      message: 'Order created successfully. Pending payment.',
      order_id: newOrder._id,
      order_reference: newOrder.order_reference,
      total_amount: newOrder.total_amount
    });

  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(400).json({ error: error.message || "Failed to create order" });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await Order.findById(id)
      .populate('buyer', 'name email role')
      .populate({
        path: 'items.product_id',
        select: 'name supplier unit_price currency unit_of_measure',
        populate: { path: 'supplier', select: 'name email role' }
      })
      .populate('status_history.changed_by', 'name email role');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const userId = String(req.user.id);
    const userRole = String(req.user.role || '').toLowerCase();
    const isBuyerOwner = String(order.buyer?._id || order.buyer) === userId;
    const isSupplierOwner = order.items.some(
      (item) => String(item.product_id?.supplier?._id || item.product_id?.supplier) === userId
    );

    if (userRole !== 'admin' && !isBuyerOwner && !isSupplierOwner) {
      return res.status(403).json({ error: 'You are not associated with this order' });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error('Error retrieving order:', error);
    return res.status(500).json({ error: 'Failed to retrieve order' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: nextStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    if (!nextStatus || !Order.ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: `status must be one of: ${Order.ORDER_STATUSES.join(', ')}` });
    }

    const order = await Order.findById(id).populate('items.product_id', 'supplier');
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const userId = String(req.user.id);
    const userRole = String(req.user.role || '').toLowerCase();
    const isBuyerOwner = String(order.buyer) === userId;
    const isSupplierOwner = order.items.some((item) => String(item.product_id?.supplier) === userId);

    if (userRole !== 'admin' && !isBuyerOwner && !isSupplierOwner) {
      return res.status(403).json({ error: 'You are not associated with this order' });
    }

    if (!Order.isValidTransition(order.status, nextStatus)) {
      return res.status(400).json({
        error: `Cannot transition order from '${order.status}' to '${nextStatus}'`
      });
    }

    if (!Order.canRoleTransition(userRole, order.status, nextStatus)) {
      return res.status(403).json({
        error: `Role '${userRole}' is not permitted to transition order from '${order.status}' to '${nextStatus}'`
      });
    }

    order.status = nextStatus;
    order.$locals.statusChangedBy = req.user.id;
    await order.save();

    return res.status(200).json({
      message: 'Order status updated successfully',
      order_id: order._id,
      status: order.status,
      status_history: order.status_history
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(400).json({ error: error.message || 'Failed to update order status' });
  }
};

module.exports = { createOrder, getOrderById, updateOrderStatus };
