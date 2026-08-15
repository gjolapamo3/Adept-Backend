const rejectGenericStatusUpdate = (req, res, next) => {
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    return res.status(400).json({
      error: 'Status updates are forbidden on generic order update routes. Use /orders/:id/status.'
    });
  }

  return next();
};

module.exports = { rejectGenericStatusUpdate };
