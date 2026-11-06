const nodemailer = require('nodemailer');

const SUPPORT_EMAIL_TO = process.env.SUPPORT_EMAIL_TO || 'support@skillomate.in';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || SUPPORT_EMAIL_TO;

let transporter;

function isSupportMailerConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isSupportMailerConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendContactEnquiryEmail(enquiry, contactUser = null) {
  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, skipped: true, reason: 'smtp-not-configured' };
  }

  const name = [enquiry.firstName, enquiry.lastName].filter(Boolean).join(' ').trim();
  const subjectName = name || enquiry.email || 'Website visitor';
  const userDetails = contactUser
    ? [
        `User ID: ${contactUser._id || ''}`,
        `User name: ${contactUser.fullName || ''}`,
        `User mobile: ${contactUser.mobileNumber || ''}`,
        `User email: ${contactUser.email || ''}`,
      ].filter((line) => !line.endsWith(': ')).join('\n')
    : 'No signed-in user attached.';

  const text = [
    `New Skillomate contact enquiry`,
    ``,
    `Name: ${name || '-'}`,
    `Email: ${enquiry.email}`,
    `Enquiry ID: ${enquiry._id}`,
    `Submitted: ${enquiry.createdAt ? new Date(enquiry.createdAt).toISOString() : new Date().toISOString()}`,
    ``,
    `Message:`,
    enquiry.message,
    ``,
    `Linked account:`,
    userDetails,
  ].join('\n');

  const html = `
    <h2>New Skillomate contact enquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(name || '-')}</p>
    <p><strong>Email:</strong> ${escapeHtml(enquiry.email)}</p>
    <p><strong>Enquiry ID:</strong> ${escapeHtml(enquiry._id)}</p>
    <p><strong>Submitted:</strong> ${escapeHtml(enquiry.createdAt ? new Date(enquiry.createdAt).toISOString() : new Date().toISOString())}</p>
    <h3>Message</h3>
    <p>${escapeHtml(enquiry.message).replace(/\n/g, '<br>')}</p>
    <h3>Linked account</h3>
    <pre>${escapeHtml(userDetails)}</pre>
  `;

  await mailer.sendMail({
    from: SMTP_FROM,
    to: SUPPORT_EMAIL_TO,
    replyTo: enquiry.email,
    subject: `Skillomate support enquiry from ${subjectName}`,
    text,
    html,
  });

  return { sent: true };
}

module.exports = {
  isSupportMailerConfigured,
  sendContactEnquiryEmail,
};
