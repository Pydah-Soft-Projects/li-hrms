const AWS = require('aws-sdk');
const crypto = require('crypto');
const path = require('path');
const { loadFileStorageConfig } = require('../utils/fileStorageConfig');

function createS3Client(s3Config) {
  const options = {
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
    region: s3Config.region || 'us-east-1',
  };

  if (s3Config.endpoint) {
    options.endpoint = s3Config.endpoint;
    options.s3ForcePathStyle = s3Config.forcePathStyle !== false;
  }

  return new AWS.S3(options);
}

async function getActiveS3Config() {
  const config = await loadFileStorageConfig();
  return config.s3;
}

const uploadToS3 = async (fileBuffer, originalName, mimeType, folder = 'certificates', s3ConfigOverride = null) => {
  try {
    const s3Config = s3ConfigOverride || (await getActiveS3Config());
    const s3 = createS3Client(s3Config);
    const bucketName = s3Config.bucketName;

    const fileExtension = path.extname(originalName);
    const fileName = `${folder}/${crypto.randomUUID()}${fileExtension}`;

    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    };

    console.log(`[S3 Upload] Uploading file: ${fileName}`);
    const result = await s3.upload(params).promise();
    console.log(`[S3 Upload] Success: ${result.Location}`);

    return result.Location;
  } catch (error) {
    console.error('[S3 Upload] Error:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

const deleteFromS3 = async (fileUrl, s3ConfigOverride = null) => {
  try {
    if (!fileUrl) return false;

    const s3Config = s3ConfigOverride || (await getActiveS3Config());
    const bucketName = s3Config.bucketName;

    if (!fileUrl.includes(bucketName) && !fileUrl.includes('amazonaws.com')) {
      console.warn('[S3 Delete] URL does not match configured bucket:', fileUrl);
      return false;
    }

    const url = new URL(fileUrl);
    const key = decodeURIComponent(url.pathname.replace(/^\//, ''));

    const s3 = createS3Client(s3Config);
    const params = {
      Bucket: bucketName,
      Key: key,
    };

    console.log(`[S3 Delete] Deleting file: ${key}`);
    await s3.deleteObject(params).promise();
    console.log(`[S3 Delete] Success: ${key}`);

    return true;
  } catch (error) {
    console.error('[S3 Delete] Error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

const replaceInS3 = async (oldFileUrl, newFileBuffer, originalName, mimeType, folder = 'certificates', s3ConfigOverride = null) => {
  try {
    if (oldFileUrl) {
      await deleteFromS3(oldFileUrl, s3ConfigOverride);
    }
    return await uploadToS3(newFileBuffer, originalName, mimeType, folder, s3ConfigOverride);
  } catch (error) {
    console.error('[S3 Replace] Error:', error);
    throw new Error(`Failed to replace file in S3: ${error.message}`);
  }
};

const isS3Configured = async (s3ConfigOverride = null) => {
  const s3Config = s3ConfigOverride || (await loadFileStorageConfig()).s3;
  return !!(s3Config.accessKeyId && s3Config.secretAccessKey && s3Config.bucketName);
};

const checkConnection = async (s3ConfigOverride = null) => {
  try {
    const s3Config = s3ConfigOverride || (await loadFileStorageConfig(true)).s3;
    if (!(s3Config.accessKeyId && s3Config.secretAccessKey && s3Config.bucketName)) {
      console.warn('[S3 Check] S3 provider selected but credentials are incomplete.');
      return false;
    }

    const s3 = createS3Client(s3Config);
    console.log(`[S3 Check] Verifying connection to bucket: ${s3Config.bucketName}...`);
    await s3.headBucket({ Bucket: s3Config.bucketName }).promise();
    console.log('[S3 Check] S3 connection successful.');
    return true;
  } catch (error) {
    console.error('[S3 Check] Connection failed:', error.message);
    return false;
  }
};

const testS3Connection = async (s3Config) => {
  const s3 = createS3Client(s3Config);
  await s3.headBucket({ Bucket: s3Config.bucketName }).promise();
  return { ok: true, bucket: s3Config.bucketName };
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  replaceInS3,
  isS3Configured,
  checkConnection,
  testS3Connection,
  createS3Client,
};
