#!/usr/bin/env node
/**
 * Run all authentication/session robustness tests.
 * Usage: node scripts/run_auth_session_tests.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const jestArgs = [
  'jest',
  'authentication/__tests__',
  '--forceExit',
  '--testTimeout=60000',
  '--runInBand',
  '--verbose',
];

console.log('Running robust auth/session test suite...\n');

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', jestArgs, {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
});

process.exit(result.status ?? 1);
