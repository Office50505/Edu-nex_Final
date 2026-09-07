const jwt = require('jsonwebtoken');

const isProduction = process.env.NODE_ENV === 'production';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || (() => {
  if (isProduction) {
    throw new Error('ADMIN_TOKEN_SECRET must be set in production');
  }
  return 'edunex-development-admin-secret';
})();

function protectAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No admin authorization token provided' });
    }

    const decoded = jwt.verify(token, ADMIN_TOKEN_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  } catch (_) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
}

module.exports = { protectAdmin };
