const fs = require('fs');
const path = require('path');
const template = fs.readFileSync(path.join(__dirname, '../templates/certificate.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../templates/certificate.css'), 'utf8');
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]); }
function cssVar(name, value) { return `--${name}:${String(value || '').replace(/[;{}]/g, '')}`; }
function renderCertificatePage(certificate, templateConfig = null) {
  const revoked = certificate.status === 'revoked';
  const lessonCount = Number(certificate.totalLessons || 0);
  const issuedAt = new Date(certificate.issuedAt);
  const theme = templateConfig || require('./certificateTemplateSettings').DEFAULT_TEMPLATE;
  const colors = { ...(require('./certificateTemplateSettings').DEFAULT_TEMPLATE.colors), ...(theme.colors || {}) };
  const values = {
    PAGE_TITLE: 'Certificate of Completion | Skillomate', CERTIFICATE_STYLES: styles,
    THEME_STYLE: [cssVar('gold', colors.gold), cssVar('ink', colors.ink), cssVar('paper', colors.paper), cssVar('page-bg', colors.background), cssVar('accent-soft', colors.accentSoft)].join(';'),
    STATUS_CLASS: revoked ? 'is-revoked' : '', LEARNER_NAME: escapeHtml(certificate.userName || 'Skillomate Learner'),
    COURSE_TITLE: escapeHtml(certificate.courseTitle || 'Skillomate Course'),
    ISSUED_DATE: escapeHtml(Number.isNaN(issuedAt.getTime()) ? 'Date unavailable' : issuedAt.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})),
    LESSON_COUNT: lessonCount > 0 ? `${lessonCount} Lessons` : 'Course Completed', CERTIFICATE_ID: escapeHtml(certificate.certificateId),
    VERIFICATION_STATE: revoked ? 'REVOKED RECORD' : 'VERIFIED RECORD',
    BRAND_PROMISE: escapeHtml(theme.brandPromise || 'A BRIGHTER\nYOU TOMORROW').replace(/\n/g, '<br>'),
    CERTIFICATE_TITLE: escapeHtml(theme.title || 'CERTIFICATE'),
    CERTIFICATE_SUBTITLE: escapeHtml(theme.subtitle || 'OF COMPLETION'),
    CERTIFY_COPY: escapeHtml(theme.certifyCopy || 'This is to certify that'),
    COMPLETION_COPY: escapeHtml(theme.completionCopy || 'has successfully completed the'),
    COMMENDATION: escapeHtml(theme.commendation || 'This achievement reflects dedication and commitment to learning.'),
    MOTTO: escapeHtml(theme.motto || 'PRACTICAL SKILLS FOR A BRIGHTER YOU'),
    SIGNATURE: escapeHtml(theme.signature || 'Skillomate'),
    FOOTER_DOMAIN: escapeHtml(theme.footerDomain || 'SKILLOMATE.IN'),
    FOOTER_TAGLINE: escapeHtml(theme.footerTagline || 'LEARN ANYWHERE'),
    DISCLAIMER: escapeHtml(theme.disclaimer || 'This certificate confirms course completion and is not a professional accreditation.'),
    REVOKED_BANNER: revoked ? '<div class="revoked-banner">REVOKED</div>' : '',
  };
  return template.replace(/{{([A-Z_]+)}}/g, (_match, key) => values[key] ?? '');
}
module.exports = { escapeHtml, renderCertificatePage };
