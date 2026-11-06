const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'developer', 'viewer'], required: true },
  isActive: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0, select: false },
}, { timestamps: true });
module.exports = mongoose.model('AdminAccount', schema);
