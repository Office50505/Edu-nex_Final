const fs = require('fs');
const path = require('path');
const template = fs.readFileSync(path.join(__dirname, '../templates/certificate.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../templates/certificate.css'), 'utf8');
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]); }
function renderCertificatePage(certificate) {
  const revoked = certificate.status === 'revoked';
  const lessonCount = Number(certificate.totalLessons || 0);
  const issuedAt = new Date(certificate.issuedAt);
  const values = {
    PAGE_TITLE: 'Certificate of Completion | Skillomate', CERTIFICATE_STYLES: styles,
    STATUS_CLASS: revoked ? 'is-revoked' : '', LEARNER_NAME: escapeHtml(certificate.userName || 'Skillomate Learner'),
    COURSE_TITLE: escapeHtml(certificate.courseTitle || 'Skillomate Course'),
    ISSUED_DATE: escapeHtml(Number.isNaN(issuedAt.getTime()) ? 'Date unavailable' : issuedAt.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})),
    LESSON_COUNT: lessonCount > 0 ? `${lessonCount} Lessons` : 'Course Completed', CERTIFICATE_ID: escapeHtml(certificate.certificateId),
    VERIFICATION_STATE: revoked ? 'REVOKED RECORD' : 'VERIFIED RECORD',
    REVOKED_BANNER: revoked ? '<div class="revoked-banner">REVOKED</div>' : '',
  };
  return template.replace(/{{([A-Z_]+)}}/g, (_match, key) => values[key] ?? '');
}
module.exports = { escapeHtml, renderCertificatePage };
