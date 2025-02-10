/**
 * services/s3Service.js
 * AWS S3 integration for uploading and downloading files.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { PassThrough } = require('stream');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET;

const s3Client = new S3Client({ region: REGION });

// Helper function: convert a readable stream to a Buffer.
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function uploadFileToS3(key, buffer) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
  });
  await s3Client.send(command);
}

async function downloadFileFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const data = await s3Client.send(command);
  // data.Body is a stream – convert it to a Buffer.
  return await streamToBuffer(data.Body);
}

module.exports = {
  uploadFileToS3,
  downloadFileFromS3,
};
