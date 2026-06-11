const {
  DEFAULT_CONFIG,
  SECRET_MASK,
  encryptSecret,
  mergeConfig,
  sanitizeForClient,
  validateFileStorageConfig,
  buildLocalFileUrl,
  resolveRequestOrigin,
  getPublicOrigin,
  isLocalFileUrl,
  localUrlToRelativePath,
} = require('../fileStorageConfig');

describe('fileStorageConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('mergeConfig', () => {
    it('defaults to local when no setting is stored', () => {
      const config = mergeConfig(null);
      expect(config.provider).toBe('local');
      expect(config.local.basePath).toBe('./uploads');
    });

    it('uses stored provider and does not auto-select S3 from env alone', () => {
      process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';
      process.env.AWS_S3_BUCKET_NAME = 'bucket';
      const config = mergeConfig(null);
      expect(config.provider).toBe('local');
    });

    it('fills S3 credentials from env when provider is s3', () => {
      process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';
      process.env.AWS_S3_BUCKET_NAME = 'bucket';
      process.env.AWS_REGION = 'ap-south-1';
      const config = mergeConfig({
        provider: 's3',
        s3: { accessKeyId: '', bucketName: '', region: 'ap-south-1' },
        local: DEFAULT_CONFIG.local,
      });
      expect(config.provider).toBe('s3');
      expect(config.s3.accessKeyId).toBe('AKIA_TEST');
      expect(config.s3.bucketName).toBe('bucket');
    });
  });

  describe('buildLocalFileUrl', () => {
    it('uses request origin with backend port', () => {
      const url = buildLocalFileUrl(
        { local: { publicBaseUrl: '/api/files', backendPublicUrl: '' } },
        'profiles/test.png',
        'http://192.168.0.36:5000'
      );
      expect(url).toBe('http://192.168.0.36:5000/api/files/profiles/test.png');
    });

    it('uses backendPublicUrl from settings when request origin is absent', () => {
      const url = buildLocalFileUrl(
        {
          local: {
            publicBaseUrl: '/api/files',
            backendPublicUrl: 'http://192.168.0.36:5000',
          },
        },
        'profiles/test.png'
      );
      expect(url).toBe('http://192.168.0.36:5000/api/files/profiles/test.png');
    });

    it('does not produce localhost without port from FRONTEND_URL', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000';
      process.env.PORT = '5000';
      delete process.env.BACKEND_PUBLIC_URL;
      const url = buildLocalFileUrl(
        { local: { publicBaseUrl: '/api/files', backendPublicUrl: '' } },
        'profiles/test.png'
      );
      expect(url).toBe('http://localhost:5000/api/files/profiles/test.png');
      expect(url).not.toBe('http://localhost/api/files/profiles/test.png');
    });

    it('supports full publicBaseUrl override', () => {
      const url = buildLocalFileUrl(
        {
          local: {
            publicBaseUrl: 'http://10.0.0.5:5000/api/files',
            backendPublicUrl: '',
          },
        },
        'evidence/2026/01/file.pdf'
      );
      expect(url).toBe('http://10.0.0.5:5000/api/files/evidence/2026/01/file.pdf');
    });
  });

  describe('resolveRequestOrigin', () => {
    it('reads protocol and host from express-like request', () => {
      const origin = resolveRequestOrigin({
        protocol: 'http',
        get(name) {
          if (name === 'host') return '192.168.0.36:5000';
          return undefined;
        },
      });
      expect(origin).toBe('http://192.168.0.36:5000');
    });

    it('prefers forwarded headers behind proxy', () => {
      const origin = resolveRequestOrigin({
        protocol: 'http',
        get(name) {
          if (name === 'x-forwarded-proto') return 'https';
          if (name === 'x-forwarded-host') return 'hrms.example.com';
          if (name === 'host') return '127.0.0.1:5000';
          return undefined;
        },
      });
      expect(origin).toBe('https://hrms.example.com');
    });
  });

  describe('validateFileStorageConfig', () => {
    it('requires backend public URL for local provider', () => {
      const result = validateFileStorageConfig(
        {
          provider: 'local',
          local: { basePath: './uploads', publicBaseUrl: '/api/files', backendPublicUrl: '' },
        },
        null
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Backend public URL/i);
    });

    it('accepts valid local config', () => {
      const result = validateFileStorageConfig(
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
      expect(result.valid).toBe(true);
      expect(result.normalized.local.backendPublicUrl).toBe('http://192.168.0.36:5000');
    });

    it('keeps masked S3 secret on update', () => {
      const existing = {
        provider: 's3',
        s3: {
          accessKeyId: 'AKIA',
          secretAccessKey: encryptSecret('stored-secret'),
          bucketName: 'bucket',
          region: 'us-east-1',
        },
      };
      const result = validateFileStorageConfig(
        {
          provider: 's3',
          s3: {
            accessKeyId: 'AKIA',
            secretAccessKey: SECRET_MASK,
            bucketName: 'bucket',
            region: 'us-east-1',
          },
        },
        existing
      );
      expect(result.valid).toBe(true);
      expect(result.normalized.s3.secretAccessKey).toBe(existing.s3.secretAccessKey);
    });
  });

  describe('local URL helpers', () => {
    it('detects local file URLs', () => {
      expect(
        isLocalFileUrl('http://192.168.0.36:5000/api/files/profiles/a.png', {
          local: { publicBaseUrl: '/api/files' },
        })
      ).toBe(true);
    });

    it('extracts relative path from local file URL', () => {
      const path = localUrlToRelativePath(
        'http://192.168.0.36:5000/api/files/profiles/a.png',
        { local: { publicBaseUrl: '/api/files' } }
      );
      expect(path).toBe('profiles/a.png');
    });
  });

  describe('sanitizeForClient', () => {
    it('masks S3 secret in API responses', () => {
      const sanitized = sanitizeForClient({
        provider: 's3',
        s3: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'plain-secret',
          bucketName: 'bucket',
        },
        local: DEFAULT_CONFIG.local,
      });
      expect(sanitized.s3.secretAccessKey).toBe(SECRET_MASK);
      expect(sanitized.s3.hasSecretAccessKey).toBe(true);
    });
  });

  describe('getPublicOrigin', () => {
    it('uses BACKEND_PUBLIC_URL env when set', () => {
      process.env.BACKEND_PUBLIC_URL = 'http://192.168.0.36:5000';
      expect(getPublicOrigin()).toBe('http://192.168.0.36:5000');
    });
  });
});
