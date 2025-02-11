/**
 * routes/documentRoutes.js
 * -----------------------------------------------------------------------------
 * Express Router for handling document-related endpoints:
 *   - POST /upload           -> Upload a document.
 *   - POST /:id/tags         -> Add or update document tags.
 *   - GET /:id/status        -> Retrieve document processing status.
 *   - GET /                 -> Search documents by name and tags.
 *   - DELETE /:id            -> Delete a document.
 * -----------------------------------------------------------------------------
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

// Configure Multer for in-memory file storage with 1GB file size limit.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB limit.
});

// Route definitions.
router.post('/upload', upload.single('file'), uploadDocument);
router.post('/:id/tags', addOrUpdateTags);
router.get('/:id/status', getDocumentStatus);
router.get('/', searchDocuments);
router.delete('/:id', deleteDocument);

module.exports = router;
