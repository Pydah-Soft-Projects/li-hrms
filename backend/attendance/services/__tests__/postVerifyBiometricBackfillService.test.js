/**
 * Unit tests for post-verify biometric replay (delegates to biometric HTTP service only).
 */

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const {
  runPostVerifyBiometricBackfill,
  computeBackfillRange,
  schedulePostVerifyBiometricBackfill,
  resolveBiometricReplayServiceUrl,
} = require('../postVerifyBiometricBackfillService');

function snapshotEnv(keys) {
  const o = {};
  keys.forEach((k) => {
    o[k] = process.env[k];
  });
  return o;
}

const envKeys = [
  'POST_VERIFY_BIOMETRIC_BACKFILL',
  'HRMS_MICROSERVICE_SECRET_KEY',
  'BIOMETRIC_SERVICE_BASE_URL',
  'BIOMETRIC_SERVICE_URL',
];
const prevEnv = snapshotEnv(envKeys);

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
  console.error.mockRestore();
});

afterEach(() => {
  jest.clearAllMocks();
  envKeys.forEach((k) => {
    if (prevEnv[k] === undefined) delete process.env[k];
    else process.env[k] = prevEnv[k];
  });
});

describe('resolveBiometricReplayServiceUrl', () => {
  test('returns null when unset', () => {
    delete process.env.BIOMETRIC_SERVICE_BASE_URL;
    delete process.env.BIOMETRIC_SERVICE_URL;
    expect(resolveBiometricReplayServiceUrl()).toBeNull();
  });

  test('returns replay URL from BIOMETRIC_SERVICE_BASE_URL', () => {
    process.env.BIOMETRIC_SERVICE_BASE_URL = 'http://biometric:4001/';
    expect(resolveBiometricReplayServiceUrl()).toBe(
      'http://biometric:4001/api/internal/replay-window-to-hrms'
    );
  });
});

describe('computeBackfillRange', () => {
  test('returns start-of-day for DOJ and end-of-day for verified date', () => {
    const doj = new Date('2026-04-01T14:30:00.000Z');
    const verifiedAt = new Date('2026-04-03T09:00:00.000Z');
    const r = computeBackfillRange(doj, verifiedAt);
    expect(r).not.toBeNull();
    expect(r.start.getHours()).toBe(0);
    expect(r.start.getMinutes()).toBe(0);
    expect(r.end.getHours()).toBe(23);
    expect(r.end.getMinutes()).toBe(59);
    expect(r.start.getTime()).toBeLessThanOrEqual(r.end.getTime());
  });

  test('returns null when start after end (invalid)', () => {
    const verified = new Date('2026-01-01T12:00:00.000Z');
    const dojLater = new Date('2026-06-01T12:00:00.000Z');
    expect(computeBackfillRange(dojLater, verified)).toBeNull();
  });

  test('returns null for invalid dates', () => {
    expect(computeBackfillRange(new Date('x'), new Date())).toBeNull();
  });
});

describe('runPostVerifyBiometricBackfill', () => {
  const doj = new Date('2026-04-01T12:00:00.000Z');
  const verifiedAt = new Date('2026-04-02T15:00:00.000Z');

  beforeEach(() => {
    process.env.POST_VERIFY_BIOMETRIC_BACKFILL = 'true';
    process.env.HRMS_MICROSERVICE_SECRET_KEY = 'unit-test-system-key';
    process.env.BIOMETRIC_SERVICE_BASE_URL = 'http://biometric-svc';
    delete process.env.BIOMETRIC_SERVICE_URL;
  });

  test('skips when POST_VERIFY_BIOMETRIC_BACKFILL is false', async () => {
    process.env.POST_VERIFY_BIOMETRIC_BACKFILL = 'false';
    const out = await runPostVerifyBiometricBackfill({
      empNo: '9999',
      doj,
      verifiedAt,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('disabled_by_env');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('skips when BIOMETRIC_SERVICE_BASE_URL and BIOMETRIC_SERVICE_URL unset', async () => {
    delete process.env.BIOMETRIC_SERVICE_BASE_URL;
    delete process.env.BIOMETRIC_SERVICE_URL;
    const out = await runPostVerifyBiometricBackfill({
      empNo: '9999',
      doj,
      verifiedAt,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_biometric_service_url');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('skips when HRMS_MICROSERVICE_SECRET_KEY missing', async () => {
    delete process.env.HRMS_MICROSERVICE_SECRET_KEY;
    const out = await runPostVerifyBiometricBackfill({
      empNo: '9999',
      doj,
      verifiedAt,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_system_key');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('POSTs replay request to biometric internal endpoint', async () => {
    axios.post.mockResolvedValue({
      data: { success: true, skipped: false, logsFound: 2, sent: 2, batches: 1 },
    });

    const out = await runPostVerifyBiometricBackfill({
      empNo: '2146',
      doj,
      verifiedAt,
    });

    expect(out.via).toBe('biometric_service');
    expect(out.sent).toBe(2);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('http://biometric-svc/api/internal/replay-window-to-hrms');
    expect(opts.headers['x-system-key']).toBe('unit-test-system-key');
    expect(body.empNo).toBe('2146');
    expect(typeof body.doj).toBe('string');
    expect(typeof body.verifiedAt).toBe('string');
  });

  test('includes employeeName in body when provided', async () => {
    axios.post.mockResolvedValue({
      data: { success: true, skipped: false, logsFound: 0, sent: 0, batches: 0 },
    });

    await runPostVerifyBiometricBackfill({
      empNo: '2146',
      doj,
      verifiedAt,
      employeeName: 'Test User',
    });

    const [, body] = axios.post.mock.calls[0];
    expect(body.employeeName).toBe('Test User');
  });

  test('returns error payload when biometric HTTP fails after retries', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));

    const out = await runPostVerifyBiometricBackfill({
      empNo: '1',
      doj,
      verifiedAt,
    });

    expect(out.via).toBe('biometric_service');
    expect(out.error).toBeDefined();
    expect(axios.post).toHaveBeenCalledTimes(3);
  });
});

describe('schedulePostVerifyBiometricBackfill', () => {
  const doj = new Date('2026-04-01T12:00:00.000Z');
  const verifiedAt = new Date('2026-04-02T15:00:00.000Z');

  beforeEach(() => {
    process.env.POST_VERIFY_BIOMETRIC_BACKFILL = 'true';
    process.env.HRMS_MICROSERVICE_SECRET_KEY = 'unit-test-system-key';
    process.env.BIOMETRIC_SERVICE_BASE_URL = 'http://biometric-svc';
    axios.post.mockResolvedValue({ data: { logsFound: 0, sent: 0, batches: 0 } });
  });

  test('invokes axios.post after setImmediate (async backfill)', async () => {
    schedulePostVerifyBiometricBackfill({ empNo: '777', doj, verifiedAt });
    expect(axios.post).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, body] = axios.post.mock.calls[0];
    expect(body.empNo).toBe('777');
  });
});
