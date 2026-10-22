const CertificateTemplate = require('../models/CertificateTemplate');

const DEFAULT_TEMPLATE = Object.freeze({
  _id: 'active',
  name: 'Skillomate Premium',
  brandName: 'Skillomate',
  brandPromise: 'A BRIGHTER\nYOU TOMORROW',
  title: 'CERTIFICATE',
  subtitle: 'OF COMPLETION',
  certifyCopy: 'This is to certify that',
  completionCopy: 'has successfully completed the',
  commendation: 'This achievement reflects dedication and commitment to learning.',
  motto: 'PRACTICAL SKILLS FOR A BRIGHTER YOU',
  signature: 'Skillomate',
  footerDomain: 'SKILLOMATE.IN',
  footerTagline: 'LEARN ANYWHERE',
  disclaimer: 'This certificate confirms course completion and is not a professional accreditation.',
  colors: {
    gold: '#bd7a00',
    ink: '#111111',
    paper: '#fffef9',
    background: '#ece9e0',
    accentSoft: '#fff8df',
  },
});

const TEXT_LIMITS = {
  name: 80,
  brandName: 80,
  brandPromise: 80,
  title: 40,
  subtitle: 60,
  certifyCopy: 120,
  completionCopy: 160,
  commendation: 180,
  motto: 90,
  signature: 80,
  footerDomain: 60,
  footerTagline: 80,
  disclaimer: 220,
};

function asPlainObject(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

function publicTemplate(doc) {
  const source = { ...DEFAULT_TEMPLATE, ...(asPlainObject(doc) || {}) };
  return {
    _id: 'active',
    name: source.name || DEFAULT_TEMPLATE.name,
    brandName: source.brandName || DEFAULT_TEMPLATE.brandName,
    brandPromise: source.brandPromise || DEFAULT_TEMPLATE.brandPromise,
    title: source.title || DEFAULT_TEMPLATE.title,
    subtitle: source.subtitle || DEFAULT_TEMPLATE.subtitle,
    certifyCopy: source.certifyCopy || DEFAULT_TEMPLATE.certifyCopy,
    completionCopy: source.completionCopy || DEFAULT_TEMPLATE.completionCopy,
    commendation: source.commendation || DEFAULT_TEMPLATE.commendation,
    motto: source.motto || DEFAULT_TEMPLATE.motto,
    signature: source.signature || DEFAULT_TEMPLATE.signature,
    footerDomain: source.footerDomain || DEFAULT_TEMPLATE.footerDomain,
    footerTagline: source.footerTagline || DEFAULT_TEMPLATE.footerTagline,
    disclaimer: source.disclaimer || DEFAULT_TEMPLATE.disclaimer,
    colors: { ...DEFAULT_TEMPLATE.colors, ...(source.colors || {}) },
    updatedAt: source.updatedAt || null,
    updatedBy: source.updatedBy || 'admin',
  };
}

function normalizeText(input, key) {
  const fallback = DEFAULT_TEMPLATE[key];
  const limit = TEXT_LIMITS[key];
  const value = String(input ?? fallback).replace(/\r/g, '').trim();
  if (!value) return fallback;
  return value.slice(0, limit);
}

function normalizeColor(input, fallback) {
  const value = String(input || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalize(input = {}) {
  const colors = input.colors || {};
  const result = { _id: 'active' };
  Object.keys(TEXT_LIMITS).forEach((key) => { result[key] = normalizeText(input[key], key); });
  result.colors = Object.fromEntries(Object.entries(DEFAULT_TEMPLATE.colors).map(([key, fallback]) => [key, normalizeColor(colors[key], fallback)]));
  return result;
}

async function getActiveTemplate() {
  const doc = await CertificateTemplate.findById('active').lean();
  return publicTemplate(doc);
}

async function saveTemplate(input, admin) {
  const template = normalize(input);
  template.updatedBy = String(admin?.id || admin?._id || admin?.username || 'admin');
  const doc = await CertificateTemplate.findOneAndUpdate({ _id: 'active' }, { $set: template }, { upsert: true, new: true, runValidators: true }).lean();
  return publicTemplate(doc);
}

function previewCertificate(overrides = {}) {
  return {
    certificateId: 'SAMPLE-CERT-2026',
    userName: overrides.userName || 'Aarav Sharma',
    courseTitle: overrides.courseTitle || 'AI Influencer Master Course',
    totalLessons: Number(overrides.totalLessons || 34),
    issuedAt: overrides.issuedAt || new Date('2026-09-23T10:00:00.000Z'),
    status: overrides.status || 'active',
  };
}

module.exports = { DEFAULT_TEMPLATE, getActiveTemplate, normalize, previewCertificate, publicTemplate, saveTemplate };
