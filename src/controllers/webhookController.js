const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

const handlePaymentWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { event, transaction_reference, order_id, status } = req.body;

    // 1. Verify payment status from payload
    if (event !== 'payment.success' || status !== 'successful') {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: 'Event ignored or payment failed.' });
    }

    // 2. Fetch order within session
    const order = await Order.findById(order_id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Prevent duplicate processing
    if (order.status === 'paid' || order.status === 'processing') {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: 'Order already processed.' });
    }

    // 3. Atomically update inventory for each item
    for (const item of order.items) {
      const updatedProduct = await Product.findOneAndUpdate(
        { 
          _id: item.product_id, 
          available_stock: { $gte: item.quantity } // Guard against negative stock
        },
        { $inc: { available_stock: -item.quantity } },
        { new: true, session }
      );

      if (!updatedProduct) {
        throw new Error(`Insufficient stock for product ID: ${item.product_id}`);
      }
    }

    // 4. Update order status & save transaction ref
    order.status = 'paid';
    order.payment_reference = transaction_reference;
    await order.save({ session });

    // Commit all DB changes together
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: 'Payment confirmed & inventory updated.' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Webhook execution failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { handlePaymentWebhook };
