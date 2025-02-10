/**
 * routes/documentRoutes.js
 * Express Router for all /documents endpoints:
 *   - /upload           (POST)
 *   - /:id/tags         (POST)
 *   - /:id/status       (GET)
 *   - / (GET)           => query by tags
 */

const express = require('express');
const multer = require('multer');
const { uploadDocument } = require('../controllers/documentController');
const { addOrUpdateTags } = require('../controllers/documentController');
const { getDocumentStatus } = require('../controllers/documentController');
const { searchDocuments } = require('../controllers/documentController');

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

module.exports = router;
