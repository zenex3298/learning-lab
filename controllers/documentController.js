/**
 * controllers/documentController.js
 * Contains controller functions for Document-related operations:
 *  - Uploading a document with file, name, and tag(s)
 *  - Adding/updating tags
 *  - Getting processing status
 *  - Searching documents by name and tag(s)
 *  - Deleting a document
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

    // Upload file to S3
    await uploadFileToS3(fileKey, file.buffer);

    // Construct the S3 URI using the bucket name from the environment variables
    const s3Uri = `s3://${process.env.S3_BUCKET}/${fileKey}`;

    // Use provided name or default to original file name
    const name = req.body.name || file.originalname;

    // Parse tags if provided (expects a comma‐separated string or an array)
    let tags = [];
    if (req.body.tags) {
      if (typeof req.body.tags === 'string') {
        tags = req.body.tags.split(',').map(tag => tag.trim());
      } else if (Array.isArray(req.body.tags)) {
        tags = req.body.tags;
      }
    }

    // Create DB record with provided name, file details, and tags
    const newDoc = await DocumentModel.create({
      name: name,
      filename: file.originalname,
      fileType: file.mimetype,
      s3Key: fileKey,
      tags: tags,
    });

    // Add job to queue (processing runs asynchronously)
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

// Search Documents by Name and Tags
async function searchDocuments(req, res) {
  try {
    const { name, tags } = req.query;
    let query = {};

    if (name) {
      // Search in the 'name' field (case-insensitive)
      query.name = { $regex: name, $options: 'i' };
    }
    if (tags) {
      const tagList = typeof tags === 'string'
        ? tags.split(',').map(t => t.trim())
        : tags;
      query.tags = { $all: tagList };
    }
    const docs = await DocumentModel.find(query).lean();
    return res.json({ documents: docs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Search failed.' });
  }
}

// Delete Document
async function deleteDocument(req, res) {
  try {
    const docId = req.params.id;
    const doc = await DocumentModel.findByIdAndDelete(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    // Optionally, delete the file from S3 here
    return res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Deletion failed.' });
  }
}

module.exports = {
  uploadDocument,
  addOrUpdateTags,
  getDocumentStatus,
  searchDocuments,
  deleteDocument,
};
