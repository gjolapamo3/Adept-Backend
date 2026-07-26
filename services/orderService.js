const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');

/**
 * Handles post-payment processing upon successful Monnify webhook validation.
 * @param {Object} paymentData - Decoded and validated payment payload from Monnify
 */
const fulfillOrderPayment = async (paymentData) => {
  const { paymentReference, orderReference, amountPaid, paymentMethod, rawPayload } = paymentData;

  // 1. Record or update the Transaction log
  await Transaction.findOneAndUpdate(
    { paymentReference },
    {
      paymentReference,
      orderReference,
      amountPaid,
      paymentStatus: 'SUCCESS',
      paymentMethod,
      rawWebhookPayload: rawPayload
    },
    { upsert: true, new: true }
  );

  // 2. Find the associated Order
  const order = await Order.findOne({ orderReference }).populate('items.product');

  if (!order) {
    throw new Error(`Order with reference ${orderReference} not found.`);
  }

  // Idempotent safeguard: prevent double stock deduction if already processed
  if (order.status === 'PAID' || order.status === 'PROCESSING' || order.status === 'FULFILLED') {
    return { status: 'ALREADY_PROCESSED', order };
  }

  // 3. Update Order status to PAID
  order.status = 'PAID';
  await order.save();

  // 4. Auto-deduct inventory stock atomically using $inc
  for (const item of order.items) {
    await Product.findByIdAndUpdate(
      item.product._id,
      { $inc: { availableStock: -item.quantity } },
      { new: true }
    );
  }

  return { status: 'SUCCESS', order };
};

module.exports = { fulfillOrderPayment };
