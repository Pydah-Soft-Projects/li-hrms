const { loadFileStorageConfig, isLocalFileUrl } = require('../utils/fileStorageConfig');
const localStorageProvider = require('./localStorageProvider');
const s3UploadService = require('./s3UploadService');

async function getProvider() {
  const config = await loadFileStorageConfig();
  return config.provider;
}

async function isConfigured() {
  const config = await loadFileStorageConfig();
  if (config.provider === 'local') {
    return !!config.local?.basePath;
  }
  return s3UploadService.isS3Configured(config.s3);
}

async function upload(fileBuffer, originalName, mimeType, folder = 'uploads', options = {}) {
  const config = await loadFileStorageConfig();
  if (config.provider === 'local') {
    return localStorageProvider.upload(
      config.local,
      fileBuffer,
      originalName,
      mimeType,
      folder,
      options.origin || null
    );
  }
  return s3UploadService.uploadToS3(fileBuffer, originalName, mimeType, folder, config.s3);
}

async function deleteFile(fileUrl) {
  if (!fileUrl) return false;

  const config = await loadFileStorageConfig();
  if (isLocalFileUrl(fileUrl, config)) {
    return localStorageProvider.deleteFile(config.local, fileUrl);
  }

  if (config.provider === 's3') {
    return s3UploadService.deleteFromS3(fileUrl, config.s3);
  }

  return s3UploadService.deleteFromS3(fileUrl).catch(() => false);
}

async function replace(oldFileUrl, fileBuffer, originalName, mimeType, folder = 'uploads', options = {}) {
  const config = await loadFileStorageConfig();
  if (config.provider === 'local') {
    return localStorageProvider.replace(
      config.local,
      oldFileUrl,
      fileBuffer,
      originalName,
      mimeType,
      folder,
      options.origin || null
    );
  }
  return s3UploadService.replaceInS3(oldFileUrl, fileBuffer, originalName, mimeType, folder, config.s3);
}

async function testConnection(overrideConfig = null) {
  const config = overrideConfig || (await loadFileStorageConfig(true));
  if (config.provider === 'local') {
    return localStorageProvider.testConnection(config.local);
  }
  return s3UploadService.testS3Connection(config.s3);
}

async function checkConnection() {
  const config = await loadFileStorageConfig(true);

  if (config.provider === 'local') {
    try {
      const result = await localStorageProvider.testConnection(config.local);
      console.log(`[Storage Check] Local storage is ready (${result.basePath}).`);
      return true;
    } catch (error) {
      console.error('[Storage Check] Local storage check failed:', error.message);
      return false;
    }
  }

  console.log('[Storage Check] S3 provider selected — verifying bucket connection...');
  return s3UploadService.checkConnection(config.s3);
}

module.exports = {
  getProvider,
  isConfigured,
  upload,
  deleteFile,
  replace,
  testConnection,
  checkConnection,
};
