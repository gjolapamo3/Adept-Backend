const mongoose = require('mongoose');

const validateOrderInput = (req, res, next) => {
  const { items, delivery_details } = req.body;

  if (!req.user?.id || !mongoose.Types.ObjectId.isValid(req.user.id)) {
    return res.status(401).json({ error: 'Invalid authenticated user' });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  req.body.items = items.map((item) => ({
    ...item,
    product_id: item?.product_id || item?.productId || item?._id || item?.id,
    unit_price: item?.unit_price ?? item?.unitPrice ?? item?.pricePerUnit ?? item?.price,
  }));

  if (req.body.items.some((item) => (
    !item
    || !mongoose.Types.ObjectId.isValid(item.product_id)
    || !Number.isFinite(Number(item.quantity))
    || Number(item.quantity) < 1
    || !Number.isFinite(Number(item.unit_price))
  ))) {
    return res.status(400).json({ error: 'Each item requires a valid product_id, quantity, and unit_price' });
  }
  if (!delivery_details || !delivery_details.shipping_address || !delivery_details.contact_phone) {
    return res.status(400).json({ error: 'Shipping address and contact phone are required' });
  }

  next();
};

module.exports = { validateOrderInput };
