const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'User identity/role missing.' });
    }

    const userRole = String(req.user.role).toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map((role) => String(role).toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]` 
      });
    }

    next();
  };
};

module.exports = { checkRole };
