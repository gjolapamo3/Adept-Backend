const mongoose = require('mongoose');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');

const buildOrderItemsFromCatalog = (items, catalog) => {
  const productMap = new Map(catalog.map((product) => [String(product._id), product]));

  const normalizedItems = items.map((item) => {
    const productId = String(item.product_id || item.productId || item._id || item.id);
    const product = productMap.get(productId);

    if (!product || product.is_active === false) {
      throw new Error(`Product not available for order: ${productId}`);
    }

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity for product: ${productId}`);
    }

    if (Number(product.available_stock) < quantity) {
      throw new Error(`Insufficient stock for product: ${productId}`);
    }

    return {
      product_id: productId,
      quantity,
      unit_price: Number(product.unit_price),
      unit_of_measure: product.unit_of_measure || item.unit_of_measure || 'metric_tons'
    };
  });

  const totalAmount = normalizedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)),
    0
  );

  return { items: normalizedItems, totalAmount };
};

const validatePaymentAmount = (amountPaid, order) => {
  const expectedTotal = Number(order.total_amount);
  const paidAmount = Number(amountPaid);

  if (!Number.isFinite(paidAmount)) {
    throw new Error('Payment amount is invalid');
  }

  if (paidAmount !== expectedTotal) {
    throw new Error('Payment amount does not match order total');
  }

  return true;
};

const isMonnifyStatusConfirmed = (providerStatus, providerAmount, expectedAmount, providerCurrency = 'NGN') => {
  const normalizedStatus = String(providerStatus || '').toUpperCase();
  const normalizedCurrency = String(providerCurrency || 'NGN').toUpperCase();
  const amount = Number(providerAmount);
  const expected = Number(expectedAmount);

  if (!['PAID', 'SUCCESS', 'SUCCESSFUL'].includes(normalizedStatus)) {
    return false;
  }

  if (!Number.isFinite(amount) || !Number.isFinite(expected) || amount !== expected) {
    return false;
  }

  if (normalizedCurrency !== 'NGN') {
    return false;
  }

  return true;
};

/**
 * Handles post-payment processing upon successful Monnify webhook validation.
 * @param {Object} paymentData - Decoded and validated payment payload from Monnify
 */
const fulfillOrderPayment = async (paymentData) => {
  const { paymentReference, orderReference, amountPaid, paymentMethod, rawPayload } = paymentData;

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const existingTransaction = await Transaction.findOne({ paymentReference }).session(session);
      if (existingTransaction && existingTransaction.paymentStatus === 'SUCCESS') {
        result = { status: 'ALREADY_PROCESSED', order: null };
        return;
      }

      const order = await Order.findOne({ order_reference: orderReference }).populate('items.product_id').session(session);
      if (!order) {
        throw new Error(`Order with reference ${orderReference} not found.`);
      }

      validatePaymentAmount(amountPaid, order);

      if (['paid', 'processing', 'delivered', 'funds_released', 'resolved', 'cancelled'].includes(order.status)) {
        result = { status: 'ALREADY_PROCESSED', order };
        return;
      }

      for (const item of order.items) {
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.product_id._id, available_stock: { $gte: item.quantity } },
          { $inc: { available_stock: -item.quantity } },
          { returnDocument: 'after', session }
        );

        if (!updatedProduct) {
          throw new Error(`Insufficient stock for product ID: ${item.product_id._id}`);
        }
      }

      order.status = 'paid';
      order.payment_reference = paymentReference;
      order.payment_method = paymentMethod || order.payment_method;
      await order.save({ session });

      await Transaction.findOneAndUpdate(
        { paymentReference },
        {
          paymentReference,
          orderReference,
          amountPaid,
          currency: 'NGN',
          paymentStatus: 'SUCCESS',
          paymentMethod,
          rawWebhookPayload: rawPayload
        },
        { upsert: true, returnDocument: 'after', session }
      );

      result = { status: 'SUCCESS', order };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  buildOrderItemsFromCatalog,
  validatePaymentAmount,
  isMonnifyStatusConfirmed,
  fulfillOrderPayment
};
