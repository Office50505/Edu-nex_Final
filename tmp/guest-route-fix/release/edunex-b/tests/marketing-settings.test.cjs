const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const plain = value => JSON.parse(JSON.stringify(value));

function marketingService(env = {}) {
  let saved;
  const writes = [];
  const module = { exports: {} };
  const Settings = {
    findById: () => ({ lean: async () => saved }),
    findByIdAndUpdate: async (_id, update) => { saved = { ...update.$set, updatedAt: new Date('2026-09-22T00:00:00Z') }; writes.push(update.$set); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/marketingSettings.js'), 'utf8'), {
    module,
    process: { env },
    require: name => name.includes('MarketingSettings') ? Settings : {},
  });
  return { ...module.exports, writes };
}

test('marketing settings stay off until enabled and expose only public pixel config', async () => {
  const service = marketingService({ META_PIXEL_ID: '123456789012345' });
  assert.deepEqual(plain(await service.publicConfig()), { metaPixel: { enabled: false, pixelId: '' } });
  const saved = await service.save({ metaPixelEnabled: true, metaPixelId: '123456789012345' }, { id: 'admin' });
  assert.equal(saved.metaPixelEnabled, true);
  assert.equal(saved.metaPixelId, '123456789012345');
  assert.equal(service.writes[0].updatedBy, 'admin');
  assert.deepEqual(plain(await service.publicConfig()), { metaPixel: { enabled: true, pixelId: '123456789012345' } });
});

test('enabled Meta Pixel requires a numeric pixel id', async () => {
  const service = marketingService();
  await assert.rejects(service.save({ metaPixelEnabled: true, metaPixelId: '' }, {}), /Pixel ID/);
  await assert.rejects(service.save({ metaPixelEnabled: true, metaPixelId: '1234' }, {}), /valid numeric/);
  assert.equal(service.writes.length, 0);
});

test('marketing settings routes protect admin mutations but keep public config open', () => {
  const routes = [];
  const admin = () => {};
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/marketingSettings.js'), 'utf8'), {
    module,
    require: name => name === 'express'
      ? { Router: () => ({ get: (...route) => routes.push(['get', ...route]), put: (...route) => routes.push(['put', ...route]) }) }
      : name.includes('adminAuth') ? { protectAdmin: admin } : {},
  });
  assert.deepEqual(routes.map(route => route[1]), ['/marketing-config', '/admin/marketing-settings', '/admin/marketing-settings']);
  assert.notEqual(routes[0][2], admin);
  assert.equal(routes[1][2], admin);
  assert.equal(routes[2][2], admin);
});
