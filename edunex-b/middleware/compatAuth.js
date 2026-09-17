const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const isProduction = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || (() => {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'edunex-development-access-secret';
})();

function authError(message = 'Unauthorized', statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return /^bearer$/i.test(scheme) && token ? token : '';
}

function requestValue(req, names) {
  for (const name of names) {
    const value = req.body?.[name] ?? req.query?.[name] ?? req.params?.[name] ?? req.headers[name.toLowerCase()];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return '';
}

function isSessionValid(user, sessionId) {
  return Boolean(sessionId) && String(user.activeSessionId || '') === String(sessionId);
}

async function isSessionValidForUser(user, sessionId) {
  return isSessionValid(user, sessionId);
}

function publicUser(user) {
  return {
    _id: String(user._id),
    id: String(user._id),
    fullName: user.fullName || '',
    email: user.email || null,
    mobileNumber: user.mobileNumber || null,
    subscriptionStatus: user.subscriptionStatus || 'none',
    subscriptionExpiry: user.subscriptionExpiry || null,
    isOnTrial: Boolean(user.isOnTrial),
    avatar: user.avatar || null,
    gender: user.gender || null,
    age: user.age || null,
  };
}

async function loadAuthUser(userId, projection) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw authError('Invalid user id', 400);
  }

  const user = await User.findById(userId)
    .select(projection || '+activeSessionId +activeSessions +deviceToken')
    .lean();

  if (!user || user.isActive === false) {
    throw authError('Invalid session');
  }

  return user;
}

async function authenticateCompatible(req, options = {}) {
  const token = bearerToken(req);

  if (token) {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const user = await loadAuthUser(decoded.userId, options.userProjection);
    if (!await isSessionValidForUser(user, decoded.sessionId)) {
      throw authError('Session expired. Please log in again.');
    }

    return {
      mode: 'jwt',
      user,
      userId: String(user._id),
      sessionId: decoded.sessionId,
    };
  }

  const userId = requestValue(req, options.userIdNames || ['userId', 'id']);
  const sessionId = requestValue(req, options.sessionIdNames || ['sessionId', 'session']);

  if (!userId || !sessionId) {
    throw authError('Authorization required');
  }

  const user = await loadAuthUser(userId, options.userProjection);
  if (!await isSessionValidForUser(user, sessionId)) {
    throw authError('Invalid session');
  }

  return {
    mode: 'legacy-session',
    user,
    userId: String(user._id),
    sessionId,
  };
}

function requireCompatibleAuth(options = {}) {
  return async (req, res, next) => {
    try {
      const auth = await authenticateCompatible(req, options);
      req.compatAuth = auth;
      req.compatUser = auth.user;
      next();
    } catch (error) {
      const statusCode = error.name === 'JsonWebTokenError'
        || error.name === 'TokenExpiredError'
        ? 401
        : error.statusCode || 500;
      res.status(statusCode).json({ error: statusCode === 401 ? 'Invalid session' : error.message });
    }
  };
}

function requireSameUser(req, targetUserId) {
  if (!req.compatAuth || String(req.compatAuth.userId) !== String(targetUserId)) {
    throw authError('This session does not belong to that user', 403);
  }
}

module.exports = {
  authenticateCompatible,
  isSessionValid,
  isSessionValidForUser,
  publicUser,
  requireCompatibleAuth,
  requireSameUser,
};
