// Validates the incoming buyer JSON payload
const validateOrderInput = (req, res, next) => {
  const { buyer_id, items, delivery_details } = req.body;

  if (!buyer_id) {
    return res.status(400).json({ error: "Missing buyer_id" });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order must contain at least one item" });
  }
  if (!delivery_details || !delivery_details.shipping_address) {
    return res.status(400).json({ error: "Shipping address is required" });
  }

  next(); // Payload is valid, move to controller
};

module.exports = { validateOrderInput };
