/**
 * services/docProcessingQueue.js
 * Sets up a Bull queue for asynchronous document processing (OCR, summarization, LLM)
 * and stores the extracted text as a separate text file in the S3 bucket under the "text" subfolder.
 */

const Bull = require('bull');
const DocumentModel = require('../models/documentModel');
const { downloadFileFromS3, uploadFileToS3 } = require('./s3Service');

// Create the Queue
const docProcessQueue = new Bull('docProcessQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});

function initQueueWorker() {
  console.log("Initializing Queue Worker...");

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

      // 2. Extract text from file based on file type
      console.log("Extracting text...");
      const extractedText = await TextExtraction(fileBuffer, docRecord.fileType);
      console.log("Text extracted (first 100 chars):", extractedText.substring(0, 100));

      // 2.5. Upload the extracted text as a separate file in S3 under the "text" subfolder.
      // Maintain the same file naming structure as the original (remove extension, add ".txt")
      const originalKey = docRecord.s3Key; // e.g., "docs/<uuid>_sample.pdf"
      const filenamePart = originalKey.split('/')[1]; // e.g., "<uuid>_sample.pdf"
      const baseName = filenamePart.replace(/\.[^/.]+$/, ""); // e.g., "<uuid>_sample"
      const textKey = `text/${baseName}.txt`;
      await uploadFileToS3(textKey, Buffer.from(extractedText, 'utf8'));
      console.log("Extracted text file stored at S3 key:", textKey);

      // 3. Summarize text (placeholder function)
      console.log("Summarizing text...");
      const summary = await Summarization(extractedText);
      console.log("Summary generated:", summary);

      // 4. Integrate with LLM (placeholder function)
      console.log("Integrating with LLM...");
      await LLMIntegration(extractedText, summary);

      // 5. Update MongoDB record: store the text file reference instead of the full extracted text
      docRecord.textS3Key = textKey;
      docRecord.summary = summary;
      docRecord.status = 'processed';
      await docRecord.save();
      console.log("Document record updated successfully for job:", job.id);
    } catch (error) {
      console.error("Error processing job", job.id, error);
      throw error;
    }
  });

  console.log("Queue Worker is set up and listening for jobs.");
}

// Text Extraction Function: Handles various file types and returns text content.
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
  } else if (fileType === 'text/csv') {
    return fileBuffer.toString('utf8');
  } else if (
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
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
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (fileType.startsWith('video/')) {
    return "Video transcription not implemented.";
  } else {
    return fileBuffer.toString('utf8');
  }
}

// Placeholder Summarization Function
async function Summarization(fullText) {
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
