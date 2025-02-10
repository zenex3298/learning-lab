#!/bin/bash
# Create directories
mkdir -p routes controllers models services

# Create server.js
cat > server.js << 'EOF'
/**
 * server.js
 * Entry point that initializes Express, connects to MongoDB,
 * and sets up the routes & queue worker.
 */

const express = require('express');
const mongoose = require('mongoose');
const { initQueueWorker } = require('./services/docProcessingQueue');
const documentRoutes = require('./routes/documentRoutes');

async function initLearningLabModule() {
  // 1. Connect to MongoDB
  await mongoose.connect('mongodb://localhost:27017/learninglab', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // 2. Initialize Express
  const app = express();
  app.use(express.json());

  // 3. Attach Routes
  app.use('/documents', documentRoutes);

  // 4. Initialize Queue Worker (Bull queue in docProcessingQueue.js)
  initQueueWorker();

  // 5. Start Server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Learning Lab Module running on port ${PORT}`);
  });
}

module.exports = { initLearningLabModule };

// Optionally, start the module immediately:
initLearningLabModule();
EOF

# Create routes/documentRoutes.js
cat > routes/documentRoutes.js << 'EOF'
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
EOF

# Create controllers/documentController.js
cat > controllers/documentController.js << 'EOF'
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

    // Create DB Record
    const newDoc = await DocumentModel.create({
      filename: file.originalname,
      fileType: file.mimetype,
      s3Key: fileKey,
    });

    // Add Job to Queue
    await docProcessQueue.add({ docId: newDoc._id });

    return res.json({ message: 'File uploaded successfully', documentId: newDoc._id });
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
EOF

# Create models/documentModel.js
cat > models/documentModel.js << 'EOF'
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
EOF

# Create services/s3Service.js
cat > services/s3Service.js << 'EOF'
/**
 * services/s3Service.js
 * AWS S3 integration for uploading and downloading files.
 */

const AWS = require('aws-sdk');

// Configure region (and credentials via env variables)
AWS.config.update({ region: 'us-east-1' });
const s3 = new AWS.S3();

// Replace with your actual bucket name
const BUCKET_NAME = 'YOUR_S3_BUCKET_NAME';

async function uploadFileToS3(key, buffer) {
  await s3
    .putObject({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
    })
    .promise();
}

async function downloadFileFromS3(key) {
  const data = await s3
    .getObject({
      Bucket: BUCKET_NAME,
      Key: key,
    })
    .promise();
  return data.Body;
}

module.exports = {
  uploadFileToS3,
  downloadFileFromS3,
};
EOF

# Create services/docProcessingQueue.js
cat > services/docProcessingQueue.js << 'EOF'
/**
 * services/docProcessingQueue.js
 * Sets up a Bull queue for asynchronous document processing (OCR, summarization, LLM).
 */

const Bull = require('bull');
const DocumentModel = require('../models/documentModel');
const { downloadFileFromS3 } = require('./s3Service');

// Create the Queue
const docProcessQueue = new Bull('docProcessQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});

// Main Worker Initialization
function initQueueWorker() {
  docProcessQueue.process(async (job) => {
    const { docId } = job.data;
    const docRecord = await DocumentModel.findById(docId);
    if (!docRecord) throw new Error('Document not found in DB');

    // 1. Download file from S3
    const fileBuffer = await downloadFileFromS3(docRecord.s3Key);

    // 2. Extract text
    const extractedText = await fakeTextExtraction(fileBuffer, docRecord.fileType);

    // 3. Summarize text
    const summary = await fakeSummarization(extractedText);

    // 4. Integrate with LLM (placeholder)
    await fakeLLMIntegration(extractedText, summary);

    // 5. Update MongoDB record
    docRecord.extractedText = extractedText;
    docRecord.summary = summary;
    docRecord.status = 'processed';
    await docRecord.save();
  });
}

// Placeholder Text Extraction
async function fakeTextExtraction(fileBuffer, fileType) {
  return `Extracted text placeholder from fileType: ${fileType}`;
}

// Placeholder Summarization
async function fakeSummarization(fullText) {
  return `Summary placeholder for text: ${fullText.slice(0, 50)}...`;
}

// Placeholder LLM Integration
async function fakeLLMIntegration(extractedText, summary) {
  console.log('LLM updated with new document content and summary.');
}

module.exports = {
  docProcessQueue,
  initQueueWorker,
};
EOF

echo "Project structure created."
