/**
 * models/documentModel.js
 * Mongoose schema and model for Document metadata.
 */

const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  filename: String,
  fileType: String,
  s3Key: String,
  uploadDate: { type: Date, default: Date.now },
  tags: [String],
  status: { type: String, default: 'uploaded' },
  extractedText: String,
  summary: String,
});

module.exports = mongoose.model('Document', DocumentSchema);
