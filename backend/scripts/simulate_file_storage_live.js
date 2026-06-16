/**
 * Live simulation against the Express app (supertest, no external server needed).
 * Run: node scripts/simulate_file_storage_live.js
 */
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const request = require('supertest');

async function run() {
  console.log('\n=== Live File Storage API Simulation ===\n');
  const results = [];
  const record = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const app = require('../server');
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'hrms-live-files-'));

  try {
    const health = await request(app).get('/health');
    record('GET /health', health.status === 200, `status=${health.status}`);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const relative = `profiles/live-sim-${Date.now()}.png`;
    const absolute = path.join(tempBase, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, png);

    const originalLoad = require('../shared/utils/fileStorageConfig').loadFileStorageConfig;
    const configModule = require('../shared/utils/fileStorageConfig');
    const previous = await originalLoad(true);
    configModule.invalidateFileStorageCache();

    const mockedConfig = {
      provider: 'local',
      s3: previous.s3,
      local: {
        basePath: tempBase,
        publicBaseUrl: '/api/files',
        backendPublicUrl: 'http://192.168.0.36:5000',
      },
    };

    const originalFn = configModule.loadFileStorageConfig;
    configModule.loadFileStorageConfig = async () => mockedConfig;

    const fileRes = await request(app)
      .get(`/api/files/${relative}`)
      .set('Host', '192.168.0.36:5000');

    record(
      'GET /api/files/* serves local upload',
      fileRes.status === 200 && fileRes.headers['content-type'] === 'image/png',
      `status=${fileRes.status}, type=${fileRes.headers['content-type']}`
    );

    const url = configModule.buildLocalFileUrl(
      mockedConfig,
      relative,
      'http://192.168.0.36:5000'
    );
    record(
      'Built URL uses IP:port',
      url.startsWith('http://192.168.0.36:5000/api/files/'),
      url
    );

    configModule.loadFileStorageConfig = originalFn;
    configModule.invalidateFileStorageCache();
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== Live Summary === Passed: ${results.length - failed}/${results.length}`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
