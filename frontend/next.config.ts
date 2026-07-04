const nextConfig = {
  // Fix 404s in dev when Turbopack incorrectly infers the monorepo root due to multiple lockfiles.
  // This repo has multiple `package-lock.json` files; without this, Next may resolve routes from the wrong root.
  turbopack: {
    root: __dirname,
  },
};

const shouldEnablePWA = process.env.DISABLE_PWA !== '1' && process.env.NODE_ENV !== 'test';

let config = nextConfig;

if (shouldEnablePWA) {
  try {
    const withPWA = require('next-pwa')({
      dest: 'public',
      register: true,
      skipWaiting: true,
    });

    config = withPWA(nextConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('next-pwa initialization failed, continuing without PWA support:', message);
  }
}

module.exports = config;
