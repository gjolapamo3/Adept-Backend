const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication token is required.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'development-secret');
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication token is invalid or expired.' });
  }
};

module.exports = { verifyToken };
