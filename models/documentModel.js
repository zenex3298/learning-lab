/**
 * models/documentModel.js
 * Mongoose schema and model for Document metadata.
 */

const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  name: String, // user-supplied document name
  filename: String,
  fileType: String,
  s3Key: String,
  textS3Key: String, // reference to the extracted text file in S3
  uploadDate: { type: Date, default: Date.now },
  tags: [String],
  status: { type: String, default: 'uploaded' },
  summary: String,
});

module.exports = mongoose.model('Document', DocumentSchema);
