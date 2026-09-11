const mongoose = require('mongoose');
module.exports = mongoose.model('CertificationPolicy', new mongoose.Schema({
  _id: String,
  questions: { type: [{ prompt: String, options: [String], answer: Number }], default: [] },
}, { timestamps: true }));
