/**
 * services/docProcessingQueue.js
 * -----------------------------------------------------------------------------
 * Sets up a Bull queue for asynchronous document processing.
 *
 * Processes include:
 *   - Text extraction via AWS Textract (for images) or Transcribe (for audio/video).
 *   - Handling various file types (PDF, CSV, Excel, Word, plain text).
 *   - Uploading extracted text to S3.
 *   - Generating summaries and integrating with an LLM.
 * -----------------------------------------------------------------------------
 */
const Bull = require('bull');
const DocumentModel = require('../models/documentModel');
const { downloadFileFromS3, uploadFileToS3 } = require('./s3Service');
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const textractClient = new TextractClient({ region: process.env.AWS_REGION });
const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION });

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const docProcessQueue = new Bull('docProcessQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});


/**
 * extractTextWithAWS
 * -----------------------------------------------------------------------------
 * Uses AWS Textract for images and AWS Transcribe for audio/video files.
 *
 * @param {string} fileType - MIME type of the file.
 * @param {string} s3Bucket - S3 bucket name.
 * @param {string} s3Key - S3 key for the file.
 * @returns {string} Extracted text.
 */
async function extractTextWithAWS(fileType, s3Bucket, s3Key) {
  // For image files: use Textract.
  if (fileType.startsWith('image/')) {
    const command = new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: s3Bucket, Name: s3Key } },
    });
    const response = await textractClient.send(command);
    let extractedText = '';
    if (response.Blocks) {
      response.Blocks.forEach(block => {
        if (block.BlockType === 'LINE' && block.Text) {
          extractedText += block.Text + '\n';
        }
      });
    }
    return extractedText;
  }
  // For audio/video files: use Transcribe.
  else if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    const jobName = `transcribe-${uuidv4()}`;
    const mediaUri = `s3://${s3Bucket}/${s3Key}`;
    const lowerKey = s3Key.toLowerCase();
    let mediaFormat = 'mp3';
    if (lowerKey.endsWith('.wav')) mediaFormat = 'wav';
    else if (lowerKey.endsWith('.mp4')) mediaFormat = 'mp4';
    else if (lowerKey.endsWith('.mov')) mediaFormat = 'mov';
    const params = {
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      MediaFormat: mediaFormat,
      Media: { MediaFileUri: mediaUri },
      OutputBucketName: s3Bucket,
    };
    await transcribeClient.send(new StartTranscriptionJobCommand(params));
    
    // Poll until the transcription job is complete.
    let jobCompleted = false;
    let transcript = "";
    while (!jobCompleted) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const jobData = await transcribeClient.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      const status = jobData.TranscriptionJob.TranscriptionJobStatus;
      if (status === "COMPLETED") {
        jobCompleted = true;
        const transcriptFileUri = jobData.TranscriptionJob.Transcript.TranscriptFileUri;
        const parts = transcriptFileUri.split(`/${s3Bucket}/`);
        if (parts.length < 2) {
          throw new Error("Unable to extract transcript file key from URI");
        }
        const transcriptKey = parts[1];
        const transcriptBuffer = await downloadFileFromS3(transcriptKey);
        const transcriptJson = JSON.parse(transcriptBuffer.toString('utf8'));
        transcript = transcriptJson.results.transcripts[0].transcript;
      } else if (status === "FAILED") {
        throw new Error("Transcription job failed");
      }
    }
    return transcript;
  } else {
    return "";
  }
}

/**
 * TextExtraction
 * -----------------------------------------------------------------------------
 * Determines the correct text extraction method based on file type.
 *
 * @param {Buffer} fileBuffer - The file content as a Buffer.
 * @param {string} fileType - MIME type of the file.
 * @param {string} s3Bucket - S3 bucket name.
 * @param {string} s3Key - S3 key for the file.
 * @returns {string} The extracted text.
 */
async function TextExtraction(fileBuffer, fileType, s3Bucket, s3Key) {
  const lowerKey = s3Key.toLowerCase();
  console.log("TextExtraction: fileType =", fileType, "lowerKey =", lowerKey);

  // For images: explicitly call Textract.
  if (fileType.startsWith('image/')) {
    console.log("File type indicates image. Using Textract.");
    return await extractTextWithAWS(fileType, s3Bucket, s3Key);
  }
  
  // If fileType is ambiguous.
  if (fileType === 'application/octet-stream') {
    if (lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav')) {
      console.log("Ambiguous type: Treating as audio.");
      return await extractTextWithAWS('audio/', s3Bucket, s3Key);
    }
    if (lowerKey.endsWith('.mp4') || lowerKey.endsWith('.mov')) {
      console.log("Ambiguous type: Treating as video.");
      return await extractTextWithAWS('video/', s3Bucket, s3Key);
    }
  }
  
  // If fileType explicitly indicates audio or video.
  if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    console.log("File type indicates audio/video.");
    return await extractTextWithAWS(fileType, s3Bucket, s3Key);
  }
  // For PDFs.
  else if (fileType === 'application/pdf') {
    console.log("File type PDF detected.");
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  }
  // For CSV files.
  else if (fileType === 'text/csv') {
    console.log("File type CSV detected.");
    return fileBuffer.toString('utf8');
  }
  // For Excel files.
  else if (
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    console.log("File type Excel detected.");
    const xlsx = require('xlsx');
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      text += xlsx.utils.sheet_to_csv(sheet);
    });
    return text;
  }
  // For Word documents.
  else if (
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    console.log("File type Word detected.");
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  }
  // Default: treat as plain text.
  else {
    console.log("Default branch: Treating as plain text.");
    return fileBuffer.toString('utf8');
  }
}


/**
 * initQueueWorker
 * -----------------------------------------------------------------------------
 * Initializes the Bull queue worker to process document jobs.
 */
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

      // Only extract and upload transcript if file is audio or video.
      if (docRecord.fileType.startsWith('audio/') || docRecord.fileType.startsWith('video/')) {
        console.log("Extracting transcript for audio/video file...");
        const extractedText = await TextExtraction(
          fileBuffer,
          docRecord.fileType,
          process.env.S3_BUCKET,
          docRecord.s3Key
        );
        console.log("Transcript extracted (first 100 chars):", extractedText.substring(0, 100));

        const originalKey = docRecord.s3Key;
        const filenamePart = originalKey.split('/')[1];
        const baseName = filenamePart.replace(/\.[^/.]+$/, "");
        const transcriptKey = `text/${baseName}_transcript.txt`;
        await uploadFileToS3(transcriptKey, Buffer.from(extractedText, 'utf8'));
        console.log("Extracted transcript stored at S3 key:", transcriptKey);
        docRecord.textS3Key = transcriptKey;
      } else {
        console.log("Skipping transcript extraction for non-audio/video file.");
      }

      // Update MongoDB record: mark as processed.
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


module.exports = {
  docProcessQueue,
  initQueueWorker,
};
