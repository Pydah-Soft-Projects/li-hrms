/**
 * Simulation script for S3 vs local file storage changes.
 * Run: node scripts/simulate_file_storage.js
 */
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const {
  mergeConfig,
  buildLocalFileUrl,
  resolveRequestOrigin,
  validateFileStorageConfig,
  sanitizeForClient,
} = require('../shared/utils/fileStorageConfig');
const localStorageProvider = require('../shared/services/localStorageProvider');

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  console.log('\n=== File Storage Simulation ===\n');

  // 1. Config defaults
  const defaultConfig = mergeConfig(null);
  record(
    'Default provider is local without DB setting',
    defaultConfig.provider === 'local',
    `provider=${defaultConfig.provider}`
  );

  // 2. URL building — fix for missing port
  const badLegacyUrl = buildLocalFileUrl(
    { local: { publicBaseUrl: '/api/files', backendPublicUrl: '' } },
    'profiles/legacy.png'
  );
  const fixedUrl = buildLocalFileUrl(
    { local: { publicBaseUrl: '/api/files', backendPublicUrl: 'http://192.168.0.36:5000' } },
    'profiles/fixed.png'
  );
  const requestUrl = buildLocalFileUrl(
    { local: { publicBaseUrl: '/api/files', backendPublicUrl: '' } },
    'profiles/request.png',
    'http://192.168.0.36:5000'
  );
  record(
    'Local URL includes backend port (settings)',
    fixedUrl === 'http://192.168.0.36:5000/api/files/profiles/fixed.png',
    fixedUrl
  );
  record(
    'Local URL includes backend port (request origin)',
    requestUrl === 'http://192.168.0.36:5000/api/files/profiles/request.png',
    requestUrl
  );
  record(
    'Fallback URL is not missing port (localhost:PORT)',
    /localhost:\d+/.test(badLegacyUrl) && !badLegacyUrl.startsWith('http://localhost/api/'),
    badLegacyUrl
  );

  // 3. Request origin simulation
  const mockReq = {
    protocol: 'http',
    get(header) {
      if (header === 'host') return '192.168.0.36:5000';
      return undefined;
    },
  };
  record(
    'resolveRequestOrigin from mock upload request',
    resolveRequestOrigin(mockReq) === 'http://192.168.0.36:5000',
    resolveRequestOrigin(mockReq)
  );

  // 4. Settings validation
  const invalidLocal = validateFileStorageConfig(
    {
      provider: 'local',
      local: { basePath: './uploads', publicBaseUrl: '/api/files', backendPublicUrl: '' },
    },
    null
  );
  const validLocal = validateFileStorageConfig(
    {
      provider: 'local',
      local: {
        basePath: './uploads',
        publicBaseUrl: '/api/files',
        backendPublicUrl: 'http://192.168.0.36:5000',
      },
    },
    null
  );
  record('Reject local config without backend public URL', !invalidLocal.valid);
  record('Accept local config with backend public URL', validLocal.valid);

  // 5. Local upload + read simulation
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'hrms-upload-sim-'));
  try {
    const localConfig = {
      basePath: tempBase,
      publicBaseUrl: '/api/files',
      backendPublicUrl: 'http://192.168.0.36:5000',
    };
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const uploadedUrl = await localStorageProvider.upload(
      localConfig,
      pngHeader,
      'avatar.png',
      'image/png',
      'profiles',
      'http://192.168.0.36:5000'
    );
    record(
      'Local upload returns reachable-style URL',
      uploadedUrl.startsWith('http://192.168.0.36:5000/api/files/profiles/'),
      uploadedUrl
    );

    const relative = uploadedUrl.split('/api/files/')[1];
    const absolute = await localStorageProvider.resolveReadablePath(localConfig, relative);
    record('Uploaded file exists on disk', !!absolute, absolute || 'missing');

    const deleted = await localStorageProvider.deleteFile(localConfig, uploadedUrl);
    record('Local delete removes uploaded file', deleted === true);
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }

  // 6. Sanitize secrets for settings API
  const sanitized = sanitizeForClient({
    provider: 's3',
    s3: {
      accessKeyId: 'AKIA',
      secretAccessKey: 'super-secret',
      bucketName: 'team-bucket',
    },
    local: { basePath: './uploads', publicBaseUrl: '/api/files', backendPublicUrl: '' },
  });
  record(
    'S3 secret masked in client payload',
    sanitized.s3.secretAccessKey === '********' && sanitized.s3.hasSecretAccessKey,
    `secret=${sanitized.s3.secretAccessKey}`
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n=== Simulation Summary ===');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Simulation crashed:', err);
  process.exit(1);
});
