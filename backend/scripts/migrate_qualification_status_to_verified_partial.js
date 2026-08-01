/**
 * One-time migration for overall employee certificate / qualification status:
 *
 * - `verified` / `certified` (and close variants) stay → `verified`
 * - Every other value (partial, taken, not_submitted, custom, empty) → `partial_verified`
 * - Shared `qualification_statuses` setting is replaced with only:
 *     Verified + Partially verified
 *
 * Also updates EmployeeApplication.qualificationStatus the same way.
 *
 * Usage (from backend/):
 *   node scripts/migrate_qualification_status_to_verified_partial.js
 *   node scripts/migrate_qualification_status_to_verified_partial.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const Settings = require('../settings/model/Settings');

const DRY_RUN = process.argv.includes('--dry-run');

const VERIFIED = 'verified';
const PARTIAL = 'partial_verified';

const KEEP_SETTING = [
  { value: VERIFIED, label: 'Verified' },
  { value: PARTIAL, label: 'Partially verified' },
];

/** Map any stored overall status to verified or partial_verified. */
function normalizeOverallStatus(raw) {
  const v = raw == null ? '' : String(raw).trim();
  if (!v) return PARTIAL;

  const lower = v.toLowerCase();
  if (
    lower === 'verified' ||
    lower === 'certified' ||
    lower === 'fully verified' ||
    lower === 'fully_verified'
  ) {
    return VERIFIED;
  }

  // Everything else (partial*, taken, not_submitted, custom labels, etc.)
  return PARTIAL;
}

function tally(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

async function migrateCollection(Model, label) {
  const docs = await Model.find({}).select('_id emp_no qualificationStatus').lean();
  const fromTo = new Map();
  let wouldChange = 0;
  const ops = [];

  for (const doc of docs) {
    const beforeRaw = doc.qualificationStatus == null ? '' : String(doc.qualificationStatus);
    const before = beforeRaw.trim();
    const after = normalizeOverallStatus(beforeRaw);
    const beforeKey = before === '' ? '(empty)' : before;
    tally(fromTo, `${beforeKey} → ${after}`);

    if (before === after) continue;

    wouldChange += 1;
    if (!DRY_RUN) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { qualificationStatus: after } },
        },
      });
    }
  }

  if (!DRY_RUN && ops.length) {
    const BATCH = 500;
    for (let i = 0; i < ops.length; i += BATCH) {
      await Model.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }
  }

  console.log(`\n${label}`);
  console.log(`  scanned=${docs.length} ${DRY_RUN ? 'wouldUpdate' : 'updated'}=${wouldChange}`);
  const sorted = [...fromTo.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted) {
    console.log(`  ${n}×  ${k}`);
  }

  return { scanned: docs.length, updated: wouldChange };
}

async function migrateSetting() {
  const existing = await Settings.findOne({ key: 'qualification_statuses' }).lean();
  const before = existing?.value;
  console.log('\nSettings qualification_statuses');
  console.log('  before:', JSON.stringify(before, null, 2));
  console.log('  after:', JSON.stringify(KEEP_SETTING, null, 2));

  if (DRY_RUN) {
    return { updated: 1 };
  }

  await Settings.findOneAndUpdate(
    { key: 'qualification_statuses' },
    {
      $set: {
        value: KEEP_SETTING,
        category: 'employee',
        description: 'Overall certificate status options for employees (Verified + Partially verified only)',
      },
    },
    { upsert: true, new: true }
  );
  return { updated: 1 };
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  console.log(DRY_RUN ? '=== DRY RUN (no writes) ===' : '=== APPLYING MIGRATION ===');
  await mongoose.connect(uri);

  const employees = await migrateCollection(Employee, 'Employees');
  const applications = await migrateCollection(EmployeeApplication, 'Employee applications');
  const setting = await migrateSetting();

  console.log(
    `\nDone. ${DRY_RUN ? 'Would update' : 'Updated'}: employees=${employees.updated}, applications=${applications.updated}, settings=${setting.updated}`
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
