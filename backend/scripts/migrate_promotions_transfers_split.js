/**
 * One-time migration: expand legacy PROMOTIONS_TRANSFERS grants into
 * separate PROMOTIONS + TRANSFERS (:read / :write) on:
 *   - User.featureControl
 *   - Role.activeModules
 *   - Settings feature_control_* .value.activeModules
 *
 * Usage (from backend/):
 *   node scripts/migrate_promotions_transfers_split.js
 *   node scripts/migrate_promotions_transfers_split.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../users/model/User');
const Role = require('../users/model/Role');
const Settings = require('../settings/model/Settings');

const LEGACY = 'PROMOTIONS_TRANSFERS';
const DRY_RUN = process.argv.includes('--dry-run');

function expandLegacy(list) {
  if (!Array.isArray(list)) return { changed: false, next: list };

  const hasPlain = list.includes(LEGACY);
  const hasRead = list.includes(`${LEGACY}:read`);
  const hasWrite = list.includes(`${LEGACY}:write`);

  if (!hasPlain && !hasRead && !hasWrite) {
    return { changed: false, next: list };
  }

  const next = new Set(
    list.filter((p) => p !== LEGACY && p !== `${LEGACY}:read` && p !== `${LEGACY}:write`)
  );

  if (hasPlain || hasWrite) {
    next.add('PROMOTIONS:read');
    next.add('PROMOTIONS:write');
    next.add('TRANSFERS:read');
    next.add('TRANSFERS:write');
  } else if (hasRead) {
    next.add('PROMOTIONS:read');
    next.add('TRANSFERS:read');
  }

  return { changed: true, next: Array.from(next) };
}

async function migrateUsers() {
  const users = await User.find({
    featureControl: { $in: [LEGACY, `${LEGACY}:read`, `${LEGACY}:write`] },
  }).select('_id name email featureControl');

  let updated = 0;
  for (const user of users) {
    const { changed, next } = expandLegacy(user.featureControl || []);
    if (!changed) continue;
    console.log(
      `  User ${user.email || user.name || user._id}: ${JSON.stringify(user.featureControl)} → ${JSON.stringify(next)}`
    );
    if (!DRY_RUN) {
      user.featureControl = next;
      await user.save();
    }
    updated += 1;
  }
  return { scanned: users.length, updated };
}

async function migrateRoles() {
  const roles = await Role.find({
    activeModules: { $in: [LEGACY, `${LEGACY}:read`, `${LEGACY}:write`] },
  }).select('_id name activeModules');

  let updated = 0;
  for (const role of roles) {
    const { changed, next } = expandLegacy(role.activeModules || []);
    if (!changed) continue;
    console.log(
      `  Role ${role.name || role._id}: ${JSON.stringify(role.activeModules)} → ${JSON.stringify(next)}`
    );
    if (!DRY_RUN) {
      role.activeModules = next;
      await role.save();
    }
    updated += 1;
  }
  return { scanned: roles.length, updated };
}

async function migrateSettings() {
  const settings = await Settings.find({
    key: { $regex: /^feature_control_/ },
  }).select('_id key value');

  let scanned = 0;
  let updated = 0;
  for (const setting of settings) {
    const activeModules = setting.value?.activeModules;
    if (!Array.isArray(activeModules)) continue;
    scanned += 1;

    const { changed, next } = expandLegacy(activeModules);
    if (!changed) continue;

    console.log(
      `  Setting ${setting.key}: ${JSON.stringify(activeModules)} → ${JSON.stringify(next)}`
    );
    if (!DRY_RUN) {
      setting.value = { ...setting.value, activeModules: next };
      setting.markModified('value');
      await setting.save();
    }
    updated += 1;
  }
  return { scanned, updated };
}

async function run() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  console.log(DRY_RUN ? '=== DRY RUN (no writes) ===' : '=== APPLYING MIGRATION ===');
  console.log(`Connecting: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
  await mongoose.connect(uri);

  console.log('\nUsers…');
  const users = await migrateUsers();
  console.log(`  matched=${users.scanned} updated=${users.updated}`);

  console.log('\nCustom roles…');
  const roles = await migrateRoles();
  console.log(`  matched=${roles.scanned} updated=${roles.updated}`);

  console.log('\nFeature-control settings…');
  const settings = await migrateSettings();
  console.log(`  checked=${settings.scanned} updated=${settings.updated}`);

  const total = users.updated + roles.updated + settings.updated;
  console.log(`\nDone. ${DRY_RUN ? 'Would update' : 'Updated'} ${total} document(s).`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
