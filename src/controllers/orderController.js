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
      items: items.map((item) => ({
        product: item.product_id,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price)
      })),
      totalAmount,
      orderReference,
      deliveryAddress: delivery_details.shipping_address,
      status: 'PENDING_PAYMENT'
    });

    return res.status(201).json({
      message: 'Order created successfully. Pending payment.',
      order_id: newOrder._id,
      order_reference: newOrder.orderReference,
      total_amount: newOrder.totalAmount
    });

  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

module.exports = { createOrder };
