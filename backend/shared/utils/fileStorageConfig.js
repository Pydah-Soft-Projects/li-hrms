const crypto = require('crypto');
const Settings = require('../../settings/model/Settings');

const SETTING_KEY = 'file_storage_config';
const SECRET_MASK = '********';
const CACHE_TTL_MS = 60_000;

const DEFAULT_CONFIG = {
  provider: 'local',
  s3: {
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    region: 'us-east-1',
    endpoint: '',
    forcePathStyle: false,
  },
  local: {
    basePath: './uploads',
    publicBaseUrl: '/api/files',
    backendPublicUrl: '',
  },
};

let cachedConfig = null;
let cacheExpiresAt = 0;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getEncryptionKey() {
  return (
    process.env.FILE_STORAGE_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'li-hrms-file-storage-dev-key'
  );
}

function encryptSecret(plain) {
  if (!plain) return '';
  const key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(stored) {
  if (!stored) return '';
  if (!String(stored).startsWith('enc:')) return String(stored);
  const [, ivB64, tagB64, dataB64] = String(stored).split(':');
  const key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function s3CredentialsFromEnv() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  if (!accessKeyId || !secretAccessKey || !bucketName) return null;

  return {
    accessKeyId,
    secretAccessKey,
    bucketName,
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_S3_ENDPOINT || '',
    forcePathStyle: String(process.env.AWS_S3_FORCE_PATH_STYLE || 'false').toLowerCase() === 'true',
  };
}

function mergeConfig(stored) {
  if (!isPlainObject(stored)) {
    return {
      provider: DEFAULT_CONFIG.provider,
      s3: { ...DEFAULT_CONFIG.s3 },
      local: { ...DEFAULT_CONFIG.local },
    };
  }

  const provider =
    stored.provider === 's3' || stored.provider === 'local' ? stored.provider : DEFAULT_CONFIG.provider;
  const s3 = {
    ...DEFAULT_CONFIG.s3,
    ...(isPlainObject(stored.s3) ? stored.s3 : {}),
  };
  const local = {
    ...DEFAULT_CONFIG.local,
    ...(isPlainObject(stored.local) ? stored.local : {}),
  };

  if (provider === 's3') {
    const envS3 = s3CredentialsFromEnv();
    if (envS3) {
      s3.accessKeyId = s3.accessKeyId || envS3.accessKeyId;
      s3.secretAccessKey = s3.secretAccessKey || envS3.secretAccessKey;
      s3.bucketName = s3.bucketName || envS3.bucketName;
      s3.region = s3.region || envS3.region;
      s3.endpoint = s3.endpoint || envS3.endpoint;
      s3.forcePathStyle = s3.forcePathStyle ?? envS3.forcePathStyle;
    }
  }

  if (s3.secretAccessKey) {
    s3.secretAccessKey = decryptSecret(s3.secretAccessKey);
  }

  return { provider, s3, local };
}

function sanitizeForClient(config) {
  const merged = mergeConfig(config);
  return {
    provider: merged.provider,
    s3: {
      accessKeyId: merged.s3.accessKeyId || '',
      secretAccessKey: merged.s3.secretAccessKey ? SECRET_MASK : '',
      hasSecretAccessKey: !!merged.s3.secretAccessKey,
      bucketName: merged.s3.bucketName || '',
      region: merged.s3.region || 'us-east-1',
      endpoint: merged.s3.endpoint || '',
      forcePathStyle: !!merged.s3.forcePathStyle,
    },
    local: {
      basePath: merged.local.basePath || './uploads',
      publicBaseUrl: merged.local.publicBaseUrl || '/api/files',
      backendPublicUrl: merged.local.backendPublicUrl || '',
    },
  };
}

function validateFileStorageConfig(input, existingStored) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { valid: false, errors: ['file_storage_config must be an object'], normalized: null };
  }

  const provider = input.provider === 's3' || input.provider === 'local' ? input.provider : '';
  if (!provider) errors.push('provider must be "s3" or "local"');

  const existing = mergeConfig(existingStored);
  const normalized = {
    provider,
    s3: {
      accessKeyId: String(input.s3?.accessKeyId || '').trim(),
      secretAccessKey: '',
      bucketName: String(input.s3?.bucketName || '').trim(),
      region: String(input.s3?.region || 'us-east-1').trim() || 'us-east-1',
      endpoint: String(input.s3?.endpoint || '').trim(),
      forcePathStyle: !!input.s3?.forcePathStyle,
    },
    local: {
      basePath: String(input.local?.basePath || './uploads').trim() || './uploads',
      publicBaseUrl: String(input.local?.publicBaseUrl || '/api/files').trim() || '/api/files',
      backendPublicUrl: String(input.local?.backendPublicUrl || '').trim().replace(/\/$/, ''),
    },
  };

  const incomingSecret = String(input.s3?.secretAccessKey || '').trim();
  if (incomingSecret && incomingSecret !== SECRET_MASK) {
    normalized.s3.secretAccessKey = encryptSecret(incomingSecret);
  } else if (existing.s3.secretAccessKey) {
    normalized.s3.secretAccessKey = existingStored?.s3?.secretAccessKey || encryptSecret(existing.s3.secretAccessKey);
  }

  if (provider === 's3') {
    if (!normalized.s3.accessKeyId) errors.push('S3 access key ID is required');
    if (!normalized.s3.bucketName) errors.push('S3 bucket name is required');
    if (!normalized.s3.secretAccessKey) errors.push('S3 secret access key is required');
  }

  if (provider === 'local') {
    if (!normalized.local.basePath) errors.push('Local storage path is required');
    if (!normalized.local.backendPublicUrl) {
      errors.push('Backend public URL is required for local storage (e.g. http://192.168.0.36:5000)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized,
  };
}

async function loadFileStorageConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  const setting = await Settings.findOne({ key: SETTING_KEY }).lean();
  cachedConfig = mergeConfig(setting?.value);
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedConfig;
}

function invalidateFileStorageCache() {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

function getPublicOrigin(storedConfig = null) {
  const fromSettings = storedConfig?.local?.backendPublicUrl;
  if (fromSettings) {
    return String(fromSettings).replace(/\/api\/?$/, '').replace(/\/$/, '');
  }

  const explicit = process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || '';
  if (explicit) return explicit.replace(/\/api\/?$/, '').replace(/\/$/, '');

  const port = process.env.PORT || 5000;
  const host = process.env.BACKEND_HOST || 'localhost';
  return `http://${host}:${port}`;
}

function resolveRequestOrigin(req) {
  if (!req) return null;

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
  }

  const host = req.get('host');
  if (!host) return null;

  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`.replace(/\/$/, '');
}

function buildLocalFileUrl(config, relativePath, requestOrigin = null) {
  const base = (config.local?.publicBaseUrl || '/api/files').replace(/\/$/, '');
  const cleanPath = String(relativePath || '').replace(/^\/+/, '');
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}/${cleanPath}`;
  }

  const origin = requestOrigin || getPublicOrigin(config);
  return `${origin}${base.startsWith('/') ? base : `/${base}`}/${cleanPath}`;
}

function isLocalFileUrl(url, config) {
  if (!url || typeof url !== 'string') return false;
  const base = (config?.local?.publicBaseUrl || '/api/files').replace(/\/$/, '');
  if (url.startsWith('/api/files/') || url.includes('/api/files/')) return true;
  if (base.startsWith('http') && url.startsWith(base)) return true;
  return false;
}

function localUrlToRelativePath(url, config) {
  const base = (config?.local?.publicBaseUrl || '/api/files').replace(/\/$/, '');
  if (url.startsWith(base + '/')) return url.slice(base.length + 1);
  const marker = '/api/files/';
  const idx = url.indexOf(marker);
  if (idx >= 0) return url.slice(idx + marker.length);
  return null;
}

module.exports = {
  SETTING_KEY,
  SECRET_MASK,
  DEFAULT_CONFIG,
  sanitizeForClient,
  validateFileStorageConfig,
  loadFileStorageConfig,
  invalidateFileStorageCache,
  buildLocalFileUrl,
  getPublicOrigin,
  resolveRequestOrigin,
  isLocalFileUrl,
  localUrlToRelativePath,
  mergeConfig,
  encryptSecret,
  decryptSecret,
};
