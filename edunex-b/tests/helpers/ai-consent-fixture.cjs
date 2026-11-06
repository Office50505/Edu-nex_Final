const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// Exercise the real consent service against a controllable persistence boundary.
function consentFixture({ initial = 'granted' } = {}) {
  let record;
  let unavailable = false;
  const writes = [];
  const User = {
    findById: () => ({ select() { return this; }, async lean() {
      if (unavailable) throw new Error('Database unavailable');
      return { isActive: true, aiConsent: record };
    } }),
    async updateOne(filter, update) {
      if (unavailable) throw new Error('Database unavailable');
      record = update.$set.aiConsent; writes.push(record); return { matchedCount: 1 };
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../services/aiConsent.js'), 'utf8'), {
    require: name => name === '../models/User' ? User : require(name), module: mod, process, Date,
  });
  const service = mod.exports;
  const state = service.consentState();
  record = initial === 'granted' ? { granted: true, policyVersion: state.policyVersion, providerVersion: state.providerVersion, decidedAt: new Date() }
    : initial === 'declined' ? { granted: false, policyVersion: state.policyVersion, providerVersion: state.providerVersion, decidedAt: new Date() }
    : initial === 'outdated' ? { granted: true, policyVersion: 'old', providerVersion: 'old', decidedAt: new Date() } : undefined;
  return { service, writes, setUnavailable(value) { unavailable = value; }, get record() { return record; } };
}
module.exports = { consentFixture };
