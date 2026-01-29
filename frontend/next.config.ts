import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fix 404s in dev when Turbopack incorrectly infers the monorepo root due to multiple lockfiles.
  // This repo has multiple `package-lock.json` files; without this, Next may resolve routes from the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
