const shared = require('../chai-junction-memory-test/gate.cjs');
module.exports = { ...shared, createGate: (options = {}) => shared.createGate({ directory: __dirname, ...options }) };
