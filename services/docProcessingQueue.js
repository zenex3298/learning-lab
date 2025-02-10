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

// Updated Text Extraction Function to handle various file types
async function TextExtraction(fileBuffer, fileType) {
  if (fileType.startsWith('image/')) {
    // Use Tesseract.js for OCR on images
    const { createWorker } = require('tesseract.js');
    const worker = createWorker();
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(fileBuffer);
    await worker.terminate();
    return text;
  } else if (fileType === 'application/pdf') {
    // Use pdf-parse for PDF documents
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  } else if (fileType === 'text/csv') {
    // CSV files are plain text
    return fileBuffer.toString('utf8');
  } else if (
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    // Use xlsx to convert Excel files to CSV text
    const xlsx = require('xlsx');
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      text += xlsx.utils.sheet_to_csv(sheet);
    });
    return text;
  } else if (
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    // Use mammoth to extract text from DOC/DOCX files
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (fileType.startsWith('video/')) {
    // Placeholder: Video transcription is not implemented
    return "Video transcription not implemented.";
  } else {
    // Fallback: treat as plain text
    return fileBuffer.toString('utf8');
  }
}

// Placeholder Summarization Function
async function Summarization(fullText) {
  // In production, replace this with a call to a summarization service or model
  return `Summary placeholder for text: ${fullText.slice(0, 50)}...`;
}

// Placeholder LLM Integration Function
async function LLMIntegration(extractedText, summary) {
  console.log('LLM updated with new document content and summary.');
}

module.exports = {
  docProcessQueue,
  initQueueWorker,
};
