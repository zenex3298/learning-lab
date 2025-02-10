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
    try {
      console.log("Processing job:", job.id);
      const { docId } = job.data;
      const docRecord = await DocumentModel.findById(docId);
      if (!docRecord) throw new Error('Document not found in DB');
      console.log("Document record found:", docRecord);

      // 1. Download file from S3
      console.log("Downloading file from S3 with key:", docRecord.s3Key);
      const fileBuffer = await downloadFileFromS3(docRecord.s3Key);
      console.log("File downloaded, size:", fileBuffer.length);

      // 2. Extract text
      console.log("Extracting text...");
      const extractedText = await TextExtraction(fileBuffer, docRecord.fileType);
      console.log("Text extracted (first 100 chars):", extractedText.substring(0, 100));

      // 3. Summarize text
      console.log("Summarizing text...");
      const summary = await Summarization(extractedText);
      console.log("Summary generated:", summary);

      // 4. Integrate with LLM (placeholder)
      console.log("Integrating with LLM...");
      await LLMIntegration(extractedText, summary);

      // 5. Update MongoDB record
      docRecord.extractedText = extractedText;
      docRecord.summary = summary;
      docRecord.status = 'processed';
      await docRecord.save();
      console.log("Document record updated successfully for job:", job.id);
    } catch (error) {
      console.error("Error processing job", job.id, error);
      throw error;
    }
  });
}

// Placeholder Text Extraction
async function TextExtraction(fileBuffer, fileType) {
  if (fileType.startsWith('image/')) {
    const { createWorker } = require('tesseract.js');
    const worker = createWorker();
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(fileBuffer);
    await worker.terminate();
    return text;
  } else if (fileType === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  } else {
    // For text-based files, return the buffer as a string.
    return fileBuffer.toString('utf8');
  }
}

// Placeholder Summarization
async function Summarization(fullText) {
  return `Summary placeholder for text: ${fullText.slice(0, 50)}...`;
}

// Placeholder LLM Integration
async function LLMIntegration(extractedText, summary) {
  console.log('LLM updated with new document content and summary.');
}

module.exports = {
  docProcessQueue,
  initQueueWorker,
};
