const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ProblemReport = require('../models/ProblemReport');
const User = require('../models/User');
const { protectAdmin } = require('../middleware/adminAuth');

const router = express.Router();
const categories = new Set(['technical', 'video', 'payment', 'ai', 'account', 'other']);
const statuses = new Set(['new', 'in_progress', 'resolved', 'closed']);
const themes = new Set(['light', 'noir', 'system', 'unknown']);
const devices = new Set(['mobile', 'tablet', 'desktop', 'unknown']);
const accessTokenSecret = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return 'edunex-development-access-secret';
})();

function clean(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function referenceFor(report) {
  const date = new Date(report.createdAt || Date.now()).toISOString().slice(0, 10).replaceAll('-', '');
  return `RPT-${date}-${String(report._id).slice(-8).toUpperCase()}`;
}

async function optionalUser(req, _res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();
    const decoded = jwt.verify(token, accessTokenSecret);
    const user = await User.findById(decoded.userId).select('fullName name email mobileNumber activeSessionId').lean();
    if (user && user.activeSessionId === decoded.sessionId) req.reportUser = user;
  } catch (_) {
    // A report can still be filed anonymously if a saved session has expired.
  }
  next();
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/problem-reports', optionalUser, async (req, res) => {
  try {
    const category = clean(req.body?.category, 40).toLowerCase();
    const message = clean(req.body?.message, 3000);
    const theme = clean(req.body?.theme, 20).toLowerCase();
    const deviceType = clean(req.body?.deviceType, 20).toLowerCase();
    const width = Math.max(0, Math.min(10000, Number(req.body?.viewport?.width) || 0));
    const height = Math.max(0, Math.min(10000, Number(req.body?.viewport?.height) || 0));

    if (!categories.has(category)) return res.status(400).json({ error: 'Choose a valid problem category.' });
    if (message.length < 10) return res.status(400).json({ error: 'Please describe the problem in at least 10 characters.' });

    const user = req.reportUser;
    const report = await ProblemReport.create({
      userId: user?._id || null,
      reporterName: clean(user?.fullName || user?.name, 160),
      reporterEmail: clean(user?.email, 160).toLowerCase(),
      reporterMobileNumber: clean(user?.mobileNumber, 32),
      category,
      message,
      pageUrl: clean(req.body?.pageUrl, 2048),
      pageTitle: clean(req.body?.pageTitle, 240),
      route: clean(req.body?.route, 800),
      courseId: clean(req.body?.courseId, 120),
      lessonId: clean(req.body?.lessonId, 120),
      theme: themes.has(theme) ? theme : 'unknown',
      viewport: { width, height },
      deviceType: devices.has(deviceType) ? deviceType : 'unknown',
      userAgent: clean(req.body?.userAgent, 600),
    });

    return res.status(201).json({
      message: 'Report submitted successfully.',
      reportId: referenceFor(report),
      status: report.status,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(error.errors).map(item => item.message).join(', ') });
    }
    return res.status(503).json({ error: 'Unable to save your report right now. Please try again.' });
  }
});

router.get('/admin/problem-reports', protectAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const status = clean(req.query.status, 40).toLowerCase();
    const category = clean(req.query.category, 40).toLowerCase();
    const filter = {};
    if (status && statuses.has(status)) filter.status = status;
    if (category && categories.has(category)) filter.category = category;

    const [reports, total, statusCounts] = await Promise.all([
      ProblemReport.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'fullName email mobileNumber').lean(),
      ProblemReport.countDocuments(filter),
      ProblemReport.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    return res.json({
      reports: reports.map(report => ({
        ...report,
        reporterName: report.reporterName || report.userId?.fullName || '',
        reporterEmail: report.reporterEmail || report.userId?.email || '',
        reporterMobileNumber: report.reporterMobileNumber || report.userId?.mobileNumber || '',
        reference: referenceFor(report),
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: Object.fromEntries(statusCounts.map(item => [item._id, item.count])),
    });
  } catch (_) {
    return res.status(503).json({ error: 'Unable to load problem reports.' });
  }
});

router.patch('/admin/problem-reports/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid report id.' });
    const status = clean(req.body?.status, 40).toLowerCase();
    const adminNote = clean(req.body?.adminNote, 2000);
    if (!statuses.has(status)) return res.status(400).json({ error: 'Choose a valid report status.' });

    const update = {
      status,
      adminNote,
      updatedBy: clean(req.admin?.email || req.admin?.username || 'admin', 160),
      resolvedAt: status === 'resolved' || status === 'closed' ? new Date() : null,
    };
    const report = await ProblemReport.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate('userId', 'fullName email mobileNumber').lean();
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    return res.json({ report: {
      ...report,
      reporterName: report.reporterName || report.userId?.fullName || '',
      reporterEmail: report.reporterEmail || report.userId?.email || '',
      reporterMobileNumber: report.reporterMobileNumber || report.userId?.mobileNumber || '',
      reference: referenceFor(report),
    }, message: 'Report updated.' });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: 'Unable to update the report.' });
  }
});

module.exports = router;
