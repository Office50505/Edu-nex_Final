const AdminFeatureSettings = require('../models/AdminFeatureSettings');

function normalize(row) {
  return {
    certificationEnabled: row?.certificationEnabled !== false,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

async function getSettings() {
  const row = await AdminFeatureSettings.findById('features').lean();
  return normalize(row);
}

async function saveSettings(input, admin) {
  const next = {
    certificationEnabled: input?.certificationEnabled !== false,
    updatedBy: String(admin?.id || admin?.username || admin?.name || 'admin'),
  };
  const row = await AdminFeatureSettings.findByIdAndUpdate(
    'features',
    { $set: next },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return normalize(row);
}

async function certificationIsEnabled() {
  return (await getSettings()).certificationEnabled;
}

module.exports = { certificationIsEnabled, getSettings, saveSettings };
