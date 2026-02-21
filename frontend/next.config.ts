const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  // Fix 404s in dev when Turbopack incorrectly infers the monorepo root due to multiple lockfiles.
  // This repo has multiple `package-lock.json` files; without this, Next may resolve routes from the wrong root.
  turbopack: {
    root: __dirname,
  },
};

module.exports = withPWA(nextConfig);
