const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { buildLocalFileUrl } = require('../utils/fileStorageConfig');

function newFileId() {
  return crypto.randomUUID();
}

function resolveBasePath(basePath) {
  return path.resolve(basePath || './uploads');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function upload(localConfig, fileBuffer, originalName, mimeType, folder = 'uploads', requestOrigin = null) {
  const basePath = resolveBasePath(localConfig.basePath);
  const safeFolder = String(folder || 'uploads').replace(/\\/g, '/').replace(/\.\./g, '');
  const targetDir = path.join(basePath, safeFolder);
  await ensureDir(targetDir);

  const ext = path.extname(originalName || '');
  const fileName = `${newFileId()}${ext}`;
  const relativePath = path.posix.join(safeFolder, fileName);
  const absolutePath = path.join(basePath, relativePath);

  await fs.writeFile(absolutePath, fileBuffer);
  return buildLocalFileUrl({ local: localConfig }, relativePath.replace(/\\/g, '/'), requestOrigin);
}

async function deleteFile(localConfig, fileUrl) {
  const basePath = resolveBasePath(localConfig.basePath);
  const { localUrlToRelativePath } = require('../utils/fileStorageConfig');
  const relativePath = localUrlToRelativePath(fileUrl, { local: localConfig });
  if (!relativePath) return false;

  const absolutePath = path.join(basePath, relativePath);
  const normalizedBase = basePath + path.sep;
  if (!absolutePath.startsWith(normalizedBase) && absolutePath !== basePath) {
    throw new Error('Invalid file path');
  }

  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function replace(localConfig, oldFileUrl, fileBuffer, originalName, mimeType, folder, requestOrigin = null) {
  if (oldFileUrl) {
    await deleteFile(localConfig, oldFileUrl).catch(() => false);
  }
  return upload(localConfig, fileBuffer, originalName, mimeType, folder, requestOrigin);
}

async function testConnection(localConfig) {
  const basePath = resolveBasePath(localConfig.basePath);
  await ensureDir(basePath);
  const probe = path.join(basePath, `.write-test-${Date.now()}`);
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
  return { ok: true, basePath };
}

async function resolveReadablePath(localConfig, relativePath) {
  const basePath = resolveBasePath(localConfig.basePath);
  const safeRelative = String(relativePath || '').replace(/\\/g, '/').replace(/\.\./g, '');
  const absolutePath = path.join(basePath, safeRelative);
  const normalizedBase = basePath + path.sep;
  if (!absolutePath.startsWith(normalizedBase) && absolutePath !== basePath) {
    return null;
  }
  try {
    await fs.access(absolutePath);
    return absolutePath;
  } catch {
    return null;
  }
}

module.exports = {
  upload,
  deleteFile,
  replace,
  testConnection,
  resolveReadablePath,
  resolveBasePath,
};
