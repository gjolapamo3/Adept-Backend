const Order = require('../models/Order');

const createOrder = async (req, res) => {
  try {
    const { buyer_id, items, delivery_details, payment_method } = req.body;

    // Calculate total price based on payload items
    const total_amount = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price, 
      0
    );

    // Create the pending order record
    const newOrder = await Order.create({
      buyer: buyer_id,
      items,
      delivery_details,
      payment_method,
      total_amount,
      status: 'pending' // Initial status before payment webhook fires
    });

    return res.status(201).json({
      message: "Order created successfully. Pending payment.",
      order_id: newOrder._id,
      total_amount: newOrder.total_amount
    });

  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

module.exports = { createOrder };
