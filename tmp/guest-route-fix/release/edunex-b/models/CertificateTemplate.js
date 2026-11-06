const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'active' },
    name: { type: String, trim: true, default: 'Skillomate Premium' },
    brandName: { type: String, trim: true, default: 'Skillomate' },
    brandPromise: { type: String, trim: true, default: 'A BRIGHTER\nYOU TOMORROW' },
    title: { type: String, trim: true, default: 'CERTIFICATE' },
    subtitle: { type: String, trim: true, default: 'OF COMPLETION' },
    certifyCopy: { type: String, trim: true, default: 'This is to certify that' },
    completionCopy: { type: String, trim: true, default: 'has successfully completed the' },
    commendation: { type: String, trim: true, default: 'This achievement reflects dedication and commitment to learning.' },
    motto: { type: String, trim: true, default: 'PRACTICAL SKILLS FOR A BRIGHTER YOU' },
    signature: { type: String, trim: true, default: 'Skillomate' },
    footerDomain: { type: String, trim: true, default: 'SKILLOMATE.IN' },
    footerTagline: { type: String, trim: true, default: 'LEARN ANYWHERE' },
    disclaimer: { type: String, trim: true, default: 'This certificate confirms course completion and is not a professional accreditation.' },
    colors: {
      gold: { type: String, trim: true, default: '#bd7a00' },
      ink: { type: String, trim: true, default: '#111111' },
      paper: { type: String, trim: true, default: '#fffef9' },
      background: { type: String, trim: true, default: '#ece9e0' },
      accentSoft: { type: String, trim: true, default: '#fff8df' },
    },
    updatedBy: { type: String, trim: true, default: 'admin' },
  },
  { collection: 'certificateTemplates', timestamps: true }
);

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
