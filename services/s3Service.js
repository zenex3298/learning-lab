/**
 * services/s3Service.js
 * AWS S3 integration for uploading and downloading files.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET;

const s3Client = new S3Client({ region: REGION });

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
  return data.Body;
}

module.exports = {
  uploadFileToS3,
  downloadFileFromS3,
};
