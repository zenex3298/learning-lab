/**
 * routes/documentRoutes.js
 * Express Router for all /documents endpoints:
 *   - /upload           (POST)          -> Upload document with file, name, and tag(s)
 *   - /:id/tags         (POST)          -> Add or update tags
 *   - /:id/status       (GET)           -> Get processing status
 *   - /                 (GET)           -> Search documents by name and tag(s)
 *   - /:id              (DELETE)        -> Delete document
 */

const express = require('express');
const multer = require('multer');
const {
  uploadDocument,
  addOrUpdateTags,
  getDocumentStatus,
  searchDocuments,
  deleteDocument,
} = require('../controllers/documentController');

const router = express.Router();

// Configure Multer (in-memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

// Routes
router.post('/upload', upload.single('file'), uploadDocument);
router.post('/:id/tags', addOrUpdateTags);
router.get('/:id/status', getDocumentStatus);
router.get('/', searchDocuments);
router.delete('/:id', deleteDocument);

module.exports = router;
