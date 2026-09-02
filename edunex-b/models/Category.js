const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

categorySchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('Category', categorySchema);
