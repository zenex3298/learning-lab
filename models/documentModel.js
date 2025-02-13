/**
 * models/documentModel.js
 * -----------------------------------------------------------------------------
 * Mongoose schema and model for Document metadata.
 * -----------------------------------------------------------------------------
 */

const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Added to store user info
  name: { type: String, required: true },         // User-supplied or default document name.
  filename: { type: String, required: true },     // Original file name.
  fileType: { type: String, required: true },     // MIME type of the file.
  s3Key: { type: String, required: true },        // S3 key where the file is stored.
  textS3Key: { type: String },                    // S3 key for the extracted text file.
  uploadDate: { type: Date, default: Date.now },  // Timestamp of upload.
  tags: [String],                                 // Array of tags for categorization.
  status: { type: String, default: 'uploaded' },  // Processing status of the document.
  summary: { type: String },                      // Summary of the document after processing.
});

module.exports = mongoose.model('Document', DocumentSchema);
