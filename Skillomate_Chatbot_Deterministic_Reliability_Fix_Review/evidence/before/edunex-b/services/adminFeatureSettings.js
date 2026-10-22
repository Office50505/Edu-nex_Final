const AdminFeatureSettings = require('../models/AdminFeatureSettings');

function normalize(row) {
  return {
    certificationEnabled: row?.certificationEnabled !== false,
    progressBarEnabled: row?.progressBarEnabled !== false,
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
    updatedBy: String(admin?.id || admin?.username || admin?.name || 'admin'),
  };
  if (Object.prototype.hasOwnProperty.call(input || {}, 'certificationEnabled')) {
    next.certificationEnabled = input.certificationEnabled !== false;
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, 'progressBarEnabled')) {
    next.progressBarEnabled = input.progressBarEnabled !== false;
  }
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

async function progressBarIsEnabled() {
  return (await getSettings()).progressBarEnabled;
}

module.exports = { certificationIsEnabled, progressBarIsEnabled, getSettings, saveSettings };
