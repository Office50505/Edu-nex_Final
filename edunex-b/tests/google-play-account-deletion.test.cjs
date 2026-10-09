const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

test('account deletion removes verified and candidate Google work after revoking access, preserving other users', async () => {
  const events = [];
  let inbox = [{ user: 'user-a' }, { candidateUser: 'user-a' }, { user: 'user-b' }];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/accountDeletionService'), 'utf8'), {
    module, process: { env: { JWT_SECRET: 'local-test-secret' } }, console,
    require: name => {
      if (name === 'node:crypto') return crypto;
      if (name === './profileImageStorage') return { deleteProfileImage: async () => assert.fail('No image configured') };
      if (name === '../models/User') return {
        findById: () => ({ select: async () => ({ _id: 'user-a' }) }),
        updateOne: async (query, update) => { events.push(['revoke', update.$set.isActive]); },
        deleteOne: async () => { events.push(['delete-user']); return { deletedCount: 1 }; },
      };
      if (name === '../models/Subscription') return {
        find: () => ({ select: () => ({ lean: async () => [] }) }),
        deleteMany: async () => ({ deletedCount: 0 }),
      };
      if (name === '../models/GooglePlayReconciliation') return { deleteMany: async query => {
        assert.deepEqual(JSON.parse(JSON.stringify(query)), { $or: [{ user: 'user-a' }, { candidateUser: 'user-a' }] });
        events.push(['delete-google-work']);
        const before = inbox.length;
        inbox = inbox.filter(item => item.user !== 'user-a' && item.candidateUser !== 'user-a');
        return { deletedCount: before - inbox.length };
      } };
      if (name.startsWith('../models/')) return {
        findById: async () => null,
        deleteMany: async () => ({ deletedCount: 0 }),
        updateMany: async () => ({ modifiedCount: 0 }),
      };
      throw new Error(`Unexpected deletion dependency: ${name}`);
    },
  });
  const result = await module.exports.deleteUserAccount('user-a', { skipBillingCancellation: true });
  assert.equal(result.googlePlayReconciliation, 2);
  assert.deepEqual(inbox, [{ user: 'user-b' }]);
  assert.deepEqual(events, [['revoke', false], ['delete-google-work'], ['delete-user']]);
});
