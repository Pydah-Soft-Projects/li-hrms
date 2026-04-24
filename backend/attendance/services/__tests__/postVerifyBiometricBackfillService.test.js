/**
 * Unit tests for post-verify biometric replay (internal sync).
 */

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('../biometricReportService', () => ({
  findBiometricLogsForEmployeeBackfill: jest.fn(),
  resolveBiometricMongoUri: jest.fn(() => 'mongodb://test-biometric'),
}));

const axios = require('axios');
const biometricReportService = require('../biometricReportService');
const {
  runPostVerifyBiometricBackfill,
  computeBackfillRange,
  schedulePostVerifyBiometricBackfill,
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
  'BACKEND_INTERNAL_URL',
  'MONGODB_BIOMETRIC_URI',
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
    process.env.BACKEND_INTERNAL_URL = 'http://127.0.0.1:59999';
    biometricReportService.resolveBiometricMongoUri.mockReturnValue('mongodb://test-biometric');
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

  test('skips when no biometric URI', async () => {
    biometricReportService.resolveBiometricMongoUri.mockReturnValue('');
    const out = await runPostVerifyBiometricBackfill({
      empNo: '9999',
      doj,
      verifiedAt,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_biometric_uri');
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

  test('no axios calls when biometric returns no rows', async () => {
    biometricReportService.findBiometricLogsForEmployeeBackfill.mockResolvedValue([]);
    const out = await runPostVerifyBiometricBackfill({
      empNo: '2146',
      doj,
      verifiedAt,
    });
    expect(out.logsFound).toBe(0);
    expect(out.batches).toBe(0);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('POSTs normalized payload to internal sync with system key', async () => {
    const ts = new Date('2026-04-02T08:00:00.000Z');
    biometricReportService.findBiometricLogsForEmployeeBackfill.mockResolvedValue([
      {
        employeeId: '2146',
        timestamp: ts,
        logType: 'check-in',
        deviceId: 'DEV1',
        deviceName: 'Main Gate',
        rawType: 0,
      },
      {
        employeeId: '2146',
        timestamp: new Date('2026-04-02T17:00:00.000Z'),
        logType: 'CHECK-OUT',
        deviceId: 'DEV1',
        deviceName: 'Main Gate',
        rawType: 1,
      },
    ]);
    axios.post.mockResolvedValue({ data: { processed: 2, success: true } });

    const out = await runPostVerifyBiometricBackfill({
      empNo: '2146',
      doj,
      verifiedAt,
    });

    expect(out.skipped).toBe(false);
    expect(out.sent).toBe(2);
    expect(out.batches).toBe(1);
    expect(axios.post).toHaveBeenCalledTimes(1);

    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:59999/api/internal/attendance/sync');
    expect(opts.headers['x-system-key']).toBe('unit-test-system-key');
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].employeeId).toBe('2146');
    expect(body[0].logType).toBe('CHECK-IN');
    expect(body[0].deviceId).toBe('DEV1');
    expect(body[1].logType).toBe('CHECK-OUT');
    expect(body[0].timestamp).toMatch(/Z$/);
  });

  test('drops rows with invalid logType and still sends valid ones', async () => {
    biometricReportService.findBiometricLogsForEmployeeBackfill.mockResolvedValue([
      { employeeId: '1', timestamp: new Date('2026-04-02T08:00:00.000Z'), logType: 'CHECK-IN', deviceId: 'D', deviceName: 'N' },
      { employeeId: '1', timestamp: new Date('2026-04-02T09:00:00.000Z'), logType: 'UNKNOWN', deviceId: 'D', deviceName: 'N' },
    ]);
    axios.post.mockResolvedValue({ data: { processed: 1 } });

    const out = await runPostVerifyBiometricBackfill({
      empNo: '1',
      doj,
      verifiedAt,
    });
    expect(out.sent).toBe(1);
    expect(axios.post.mock.calls[0][1]).toHaveLength(1);
    expect(axios.post.mock.calls[0][1][0].logType).toBe('CHECK-IN');
  });

  test('splits into multiple batches when over BATCH_SIZE', async () => {
    const many = [];
    for (let i = 0; i < 250; i += 1) {
      many.push({
        employeeId: '55',
        timestamp: new Date(`2026-04-02T${String(8 + (i % 8)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`),
        logType: 'CHECK-IN',
        deviceId: 'D',
        deviceName: 'N',
      });
    }
    biometricReportService.findBiometricLogsForEmployeeBackfill.mockResolvedValue(many);
    axios.post.mockResolvedValue({ data: { processed: 200 } });

    const out = await runPostVerifyBiometricBackfill({
      empNo: '55',
      doj,
      verifiedAt,
    });

    expect(out.sent).toBe(250);
    expect(out.batches).toBe(2);
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][1]).toHaveLength(200);
    expect(axios.post.mock.calls[1][1]).toHaveLength(50);
  });
});

describe('schedulePostVerifyBiometricBackfill', () => {
  const doj = new Date('2026-04-01T12:00:00.000Z');
  const verifiedAt = new Date('2026-04-02T15:00:00.000Z');

  beforeEach(() => {
    process.env.POST_VERIFY_BIOMETRIC_BACKFILL = 'true';
    process.env.HRMS_MICROSERVICE_SECRET_KEY = 'unit-test-system-key';
    process.env.BACKEND_INTERNAL_URL = 'http://127.0.0.1:59999';
    biometricReportService.resolveBiometricMongoUri.mockReturnValue('mongodb://test-biometric');
    biometricReportService.findBiometricLogsForEmployeeBackfill.mockResolvedValue([]);
  });

  test('invokes finder after setImmediate (async backfill)', async () => {
    schedulePostVerifyBiometricBackfill({ empNo: '777', doj, verifiedAt });
    expect(biometricReportService.findBiometricLogsForEmployeeBackfill).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(biometricReportService.findBiometricLogsForEmployeeBackfill).toHaveBeenCalledWith(
      '777',
      expect.any(Date),
      expect.any(Date)
    );
  });
});
