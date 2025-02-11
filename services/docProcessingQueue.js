/**
 * services/docProcessingQueue.js
 * Sets up a Bull queue for asynchronous document processing (OCR, summarization, LLM)
 * and stores the extracted text (transcript) as a separate text file in the S3 bucket under the "txt" subfolder.
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

const docProcessQueue = new Bull('docProcessQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});

async function extractTextWithAWS(fileType, s3Bucket, s3Key) {
  // For images: use Textract.
  if (fileType.startsWith('image/')) {
    const command = new DetectDocumentTextCommand({
      Document: {
        S3Object: { Bucket: s3Bucket, Name: s3Key }
      }
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
  // For audio/video: use Transcribe.
  else if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    const jobName = `transcribe-${uuidv4()}`;
    const mediaUri = `s3://${s3Bucket}/${s3Key}`;
    // Determine media format from file extension:
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
    let jobCompleted = false;
    let transcript = "";
    while (!jobCompleted) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const jobData = await transcribeClient.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      const status = jobData.TranscriptionJob.TranscriptionJobStatus;
      if (status === "COMPLETED") {
        jobCompleted = true;
        const transcriptFileUri = jobData.TranscriptionJob.Transcript.TranscriptFileUri;
        // Extract the transcript file's S3 key from the URI.
        // Example URI: https://s3.us-east-1.amazonaws.com/<bucket>/<key>
        const parts = transcriptFileUri.split(`/${s3Bucket}/`);
        if (parts.length < 2) {
          throw new Error("Unable to extract transcript file key from URI");
        }
        const transcriptKey = parts[1];
        // Use your S3 client to download the transcript file.
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

async function TextExtraction(fileBuffer, fileType, s3Bucket, s3Key) {
  const lowerKey = s3Key.toLowerCase();
  // If fileType is ambiguous, check extension.
  if (fileType === 'application/octet-stream') {
    if (lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav')) {
      return await extractTextWithAWS('audio/', s3Bucket, s3Key);
    }
    if (lowerKey.endsWith('.mp4') || lowerKey.endsWith('.mov')) {
      return await extractTextWithAWS('video/', s3Bucket, s3Key);
    }
  }
  // If fileType explicitly indicates audio or video.
  if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    return await extractTextWithAWS(fileType, s3Bucket, s3Key);
  }
  // For other types, use local methods.
  else if (fileType === 'application/pdf') {
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
  } else {
    return fileBuffer.toString('utf8');
  }
}

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
      const extractedText = await TextExtraction(fileBuffer, docRecord.fileType, process.env.S3_BUCKET, docRecord.s3Key);
      console.log("Text extracted (first 100 chars):", extractedText.substring(0, 100));

      // 2.5 Upload the extracted text as a separate file in S3 under "txt" subfolder.
      // Use the same base name as the original, append '_transcript.txt'
      const originalKey = docRecord.s3Key; // e.g., "docs/<uuid>_sample_audio.mp3"
      const filenamePart = originalKey.split('/')[1]; // e.g., "<uuid>_sample_audio.mp3"
      const baseName = filenamePart.replace(/\.[^/.]+$/, ""); // remove extension
      const transcriptKey = `text/${baseName}_transcript.txt`;  // updated prefix to "text/"
      await uploadFileToS3(transcriptKey, Buffer.from(extractedText, 'utf8'));
      console.log("Extracted transcript stored at S3 key:", transcriptKey);

      // 3. Summarize text (placeholder)
      console.log("Summarizing text...");
      const summary = await Summarization(extractedText);
      console.log("Summary generated:", summary);

      // 4. Integrate with LLM (placeholder)
      console.log("Integrating with LLM...");
      await LLMIntegration(extractedText, summary);

      // 5. Update MongoDB record: store reference to transcript file, summary, update status.
      docRecord.textS3Key = transcriptKey;
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
