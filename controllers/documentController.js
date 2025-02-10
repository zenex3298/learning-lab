/**
 * controllers/documentController.js
 * Contains controller functions for Document-related operations:
 *  - Uploading a document
 *  - Adding/updating tags
 *  - Getting processing status
 *  - Searching documents by tags
 */

const DocumentModel = require('../models/documentModel');
const { uploadFileToS3 } = require('../services/s3Service');
const { docProcessQueue } = require('../services/docProcessingQueue');
const { v4: uuidv4 } = require('uuid');

// Upload Document
async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' });
    }
    const file = req.file;
    const fileId = uuidv4();
    const fileKey = `docs/${fileId}_${file.originalname}`;

    // Upload to S3
    await uploadFileToS3(fileKey, file.buffer);

    // Construct the S3 URI using the bucket name from the environment variables
    const s3Uri = `s3://${process.env.S3_BUCKET}/${fileKey}`;

    // Create DB record
    const newDoc = await DocumentModel.create({
      filename: file.originalname,
      fileType: file.mimetype,
      s3Key: fileKey,
    });

    // Add job to queue without awaiting its resolution
    docProcessQueue.add({ docId: newDoc._id });

    const responseMessage = {
      message: 'File uploaded successfully',
      documentId: newDoc._id,
      s3Uri: s3Uri,
    };
    console.log("Upload response:", responseMessage);
    return res.json(responseMessage);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upload failed.' });
  }
}


// Add or Update Tags
async function addOrUpdateTags(req, res) {
  try {
    const { tags } = req.body;
    const docId = req.params.id;
    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    doc.tags = Array.isArray(tags) ? tags : [];
    await doc.save();
    return res.json({ message: 'Tags updated.', document: doc });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Tag update failed.' });
  }
}

// Get Document Status
async function getDocumentStatus(req, res) {
  try {
    const doc = await DocumentModel.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    return res.json({ document: doc });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Status check failed.' });
  }
}

// Search Documents by Tags
async function searchDocuments(req, res) {
  try {
    const { tags } = req.query;
    let query = {};
    if (tags) {
      const tagList = tags.split(',');
      query = { tags: { $all: tagList } };
    }
    const docs = await DocumentModel.find(query).lean();
    return res.json({ documents: docs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Search failed.' });
  }
}

module.exports = {
  uploadDocument,
  addOrUpdateTags,
  getDocumentStatus,
  searchDocuments,
};
