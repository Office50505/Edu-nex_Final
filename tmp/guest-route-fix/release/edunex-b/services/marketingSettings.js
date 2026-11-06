const Settings = require('../models/MarketingSettings');

function envEnabled() {
  return String(process.env.META_PIXEL_ENABLED || '').toLowerCase() === 'true';
}

function normalizePixelId(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 30);
}

function validatePixelId(pixelId) {
  return !pixelId || /^[0-9]{5,30}$/.test(pixelId);
}

function fromDoc(doc) {
  const pixelId = normalizePixelId(doc?.metaPixelId || process.env.META_PIXEL_ID || '');
  const enabled = Boolean(doc ? doc.metaPixelEnabled : envEnabled()) && Boolean(pixelId);
  return {
    metaPixelEnabled: enabled,
    metaPixelId: pixelId,
    configured: Boolean(pixelId),
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || '',
  };
}

async function summary() {
  const saved = await Settings.findById('marketing').lean();
  return fromDoc(saved);
}

async function publicConfig() {
  const settings = await summary();
  return { metaPixel: { enabled: settings.metaPixelEnabled, pixelId: settings.metaPixelEnabled ? settings.metaPixelId : '' } };
}

async function save(input = {}, admin) {
  const metaPixelEnabled = input.metaPixelEnabled === true;
  const metaPixelId = normalizePixelId(input.metaPixelId);
  if (metaPixelEnabled && !metaPixelId) {
    throw Object.assign(new Error('Enter a Meta Pixel ID before enabling tracking.'), { status: 400 });
  }
  if (!validatePixelId(metaPixelId)) {
    throw Object.assign(new Error('Enter a valid numeric Meta Pixel ID.'), { status: 400 });
  }
  await Settings.findByIdAndUpdate('marketing', {
    $set: {
      metaPixelEnabled,
      metaPixelId,
      updatedBy: String(admin?.id || admin?._id || 'admin'),
    },
  }, { upsert: true, runValidators: true });
  return summary();
}

module.exports = { publicConfig, summary, save, normalizePixelId };
