const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../models/AdminFeatureSettings');
const settings = require('../services/adminFeatureSettings');

test('capture defaults to blocked and persists explicit boolean changes without overwriting other settings', async () => {
  const originalFind = model.findById;
  const originalUpdate = model.findByIdAndUpdate;
  let row = null;
  model.findById = () => ({ lean: async () => row });
  model.findByIdAndUpdate = (_id, update) => ({ lean: async () => {
    row = { ...row, ...update.$set };
    return row;
  } });
  try {
    assert.equal((await settings.getSettings()).screenCaptureAllowed, false);
    await settings.saveSettings({ certificationEnabled: false }, { id: 'admin' });
    const enabled = await settings.saveSettings({ screenCaptureAllowed: true }, { id: 'admin' });
    assert.equal(enabled.screenCaptureAllowed, true);
    assert.equal(enabled.certificationEnabled, false);
    assert.equal(enabled.updatedBy, 'admin');
    await settings.saveSettings({ progressBarEnabled: false }, {});
    assert.equal((await settings.getSettings()).screenCaptureAllowed, true);
    await assert.rejects(settings.saveSettings({ screenCaptureAllowed: 'true' }, {}), { statusCode: 400 });
    assert.equal((await settings.saveSettings({ screenCaptureAllowed: false }, {})).screenCaptureAllowed, false);
  } finally {
    model.findById = originalFind;
    model.findByIdAndUpdate = originalUpdate;
  }
});
