const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'edunex-development-access-secret';
})();

function isUserSessionActive(user, sessionId) {
  return Boolean(sessionId) && String(user.activeSessionId || '') === String(sessionId);
}

/**
 * JWT authentication middleware.
 * Verifies token validity and session consistency.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function protect(req, res, next) {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify and decode token
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

    // Fetch user and verify session
    const user = await User.findById(decoded.userId)
      .select('+activeSessionId +activeSessions')
      .lean();

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'User not found' });
    }

    const active = isUserSessionActive(user, decoded.sessionId);

    if (!active) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    req.user = user;
    req.authSessionId = decoded.sessionId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { protect };
