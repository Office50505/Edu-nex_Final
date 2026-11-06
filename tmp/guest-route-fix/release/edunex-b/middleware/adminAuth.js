const { authenticate } = require('../services/adminIdentity');
function guard({ readOnly = false, roles } = {}) {
  return async function adminGuard(req, res, next) {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
      if (!token) return res.status(401).json({ error: 'No admin authorization token provided' });
      const admin = await authenticate(token);
      if (roles && !roles.includes(admin.role)) return res.status(403).json({ error: 'Only admins can view or manage team roles.', code: 'FORBIDDEN' });
      if (admin.role === 'viewer' && !readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return res.status(403).json({ error: 'Viewer accounts have read-only access.', code: 'READ_ONLY' });
      }
      req.admin = admin;
      next();
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Unable to verify workspace access. Please retry.' });
    }
  };
}
module.exports = {
  protectAdmin: guard(), protectAdminRead: guard({ readOnly: true }), protectAdminRoles: guard({ roles: ['admin'] }),
};
