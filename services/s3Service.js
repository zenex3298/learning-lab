/**
 * services/s3Service.js
 * -----------------------------------------------------------------------------
 * Provides AWS S3 integration for file uploads and downloads.
 * -----------------------------------------------------------------------------
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { PassThrough } = require('stream');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET;

const s3Client = new S3Client({ region: REGION });

/**
 * streamToBuffer
 * -----------------------------------------------------------------------------
 * Converts a readable stream into a Buffer.
 *
 * @param {Stream} stream - The readable stream.
 * @returns {Promise<Buffer>} A promise that resolves to the complete Buffer.
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * uploadFileToS3
 * -----------------------------------------------------------------------------
 * Uploads a file buffer to S3 at the specified key.
 *
 * @param {string} key - The S3 object key.
 * @param {Buffer} buffer - The file content.
 */
async function uploadFileToS3(key, buffer) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
  });
  await s3Client.send(command);
}

/**
 * downloadFileFromS3
 * -----------------------------------------------------------------------------
 * Downloads a file from S3 and returns its content as a Buffer.
 *
 * @param {string} key - The S3 object key.
 * @returns {Buffer} The file content.
 */
async function downloadFileFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const data = await s3Client.send(command);
  return await streamToBuffer(data.Body);
}

module.exports = {
  uploadFileToS3,
  downloadFileFromS3,
};
