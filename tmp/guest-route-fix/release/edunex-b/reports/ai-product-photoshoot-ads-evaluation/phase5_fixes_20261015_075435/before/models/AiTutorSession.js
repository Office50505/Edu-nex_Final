const mongoose = require('mongoose');

const aiTutorSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  conversationId: { type: String, default: '' },
  activeCourseId: { type: String, default: '' },
  currentTopic: { type: String, default: '' },
  currentIntent: { type: String, default: '' },
  lastWorkflow: { type: String, default: '' },
  lastTemplateId: { type: String, default: '' },
  productContext: {
    product: { type: String, maxlength: 100 },
    part: { type: String, maxlength: 100 },
    colour: { type: String, maxlength: 100 },
    person: { type: String, maxlength: 100 },
    price: { type: String, maxlength: 40 },
    channel: { type: String, maxlength: 180 },
    adAngle: { type: String, maxlength: 180 },
    attributes: { type: [String], default: undefined },
    requestedOutputs: { type: [String], default: undefined },
    lessonNumber: { type: Number, min: 1, max: 8 },
  },
  messages: { type: Array, default: [] },
  lastUpdatedAt: { type: Date, default: Date.now },
});

aiTutorSessionSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('AiTutorSession', aiTutorSessionSchema);
