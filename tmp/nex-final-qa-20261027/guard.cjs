function guardHandler(gate, environment, pathFor, handler, unavailable) {
  return async function manualQaScopedHandler(req, res, next) {
    try { gate.assertRequest(req, environment, pathFor(req)); }
    catch (error) { return res.status(403).json(unavailable(error.code, req.body?.message || req.body?.question)); }
    return handler(req, res, next);
  };
}
module.exports = { guardHandler };
