const Order = require('../models/Order');

const createOrder = async (req, res) => {
  try {
    const { buyer_id, items, delivery_details, payment_method } = req.body;

    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0
    );

    const orderReference = `APT-ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newOrder = await Order.create({
      buyer: buyer_id,
      order_reference: orderReference,
      items: items.map((item) => ({
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

    return res.status(201).json({
      message: 'Order created successfully. Pending payment.',
      order_id: newOrder._id,
      order_reference: newOrder.order_reference,
      total_amount: newOrder.total_amount
    });

  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

module.exports = { createOrder };
