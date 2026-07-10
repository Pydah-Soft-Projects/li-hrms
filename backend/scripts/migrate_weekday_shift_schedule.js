/**
 * Bulk migration: promote legacy weekday shift pattern from dynamicFields
 * (e.g. weekday_shift_pattern) to canonical employee.weekdayShiftSchedule /
 * employeeapplication.weekdayShiftSchedule, then strip legacy keys.
 *
 * Usage:
 *   node backend/scripts/migrate_weekday_shift_schedule.js
 *   node backend/scripts/migrate_weekday_shift_schedule.js --dry-run
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const {
  resolveWeekdayShiftSchedule,
  stripLegacyWeekdayFromDynamicFields,
  hasConfiguredWeekdaySchedule,
} = require('../shared/utils/weekdayShiftScheduleUtils');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi';
const dryRun = process.argv.includes('--dry-run');

async function migrateCollection(Model, label) {
  const docs = await Model.find({
    $or: [
      { 'dynamicFields.weekday_shift_pattern': { $exists: true } },
      { 'dynamicFields.weekdayShiftPattern': { $exists: true } },
      { 'dynamicFields.weekday_shift_schedule': { $exists: true } },
    ],
  }).lean();

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    scanned++;
    const resolved = resolveWeekdayShiftSchedule(doc);
    const nextDynamic = stripLegacyWeekdayFromDynamicFields(doc.dynamicFields || {});

    const alreadyCanonical = hasConfiguredWeekdaySchedule(doc.weekdayShiftSchedule);
    const hasLegacyKeys = JSON.stringify(doc.dynamicFields || {}) !== JSON.stringify(nextDynamic);

    if (!resolved && !hasLegacyKeys) {
      skipped++;
      continue;
    }

    const update = {};
    if (resolved && !alreadyCanonical) {
      update.weekdayShiftSchedule = resolved;
    } else if (resolved && alreadyCanonical && !hasConfiguredWeekdaySchedule(doc.weekdayShiftSchedule)) {
      update.weekdayShiftSchedule = resolved;
    }
    if (hasLegacyKeys) {
      update.dynamicFields = nextDynamic;
    }

    if (Object.keys(update).length === 0) {
      skipped++;
      continue;
    }

    migrated++;
    console.log(
      `[${label}] ${doc.emp_no || doc._id}: ` +
        `${update.weekdayShiftSchedule ? 'set weekdayShiftSchedule' : ''}` +
        `${update.dynamicFields ? ' strip legacy dynamicFields' : ''}`
    );

    if (!dryRun) {
      await Model.updateOne({ _id: doc._id }, { $set: update });
    }
  }

  // Also migrate docs that already have legacy-looking keys anywhere in dynamicFields
  const extraDocs = await Model.find({ dynamicFields: { $type: 'object' } }).lean();
  for (const doc of extraDocs) {
    const dyn = doc.dynamicFields || {};
    const legacyKey = Object.keys(dyn).find(
      (k) => k.toLowerCase().includes('weekday') && k.toLowerCase().includes('shift')
    );
    if (!legacyKey) continue;
    if (docs.some((d) => String(d._id) === String(doc._id))) continue;

    scanned++;
    const resolved = resolveWeekdayShiftSchedule(doc);
    const nextDynamic = stripLegacyWeekdayFromDynamicFields(dyn);
    const update = {};
    if (resolved) update.weekdayShiftSchedule = resolved;
    if (JSON.stringify(dyn) !== JSON.stringify(nextDynamic)) update.dynamicFields = nextDynamic;
    if (Object.keys(update).length === 0) {
      skipped++;
      continue;
    }

    migrated++;
    console.log(`[${label}] ${doc.emp_no || doc._id}: extra legacy key "${legacyKey}"`);
    if (!dryRun) {
      await Model.updateOne({ _id: doc._id }, { $set: update });
    }
  }

  return { scanned, migrated, skipped };
}

async function run() {
  console.log(dryRun ? 'DRY RUN — no writes' : 'LIVE RUN — writing changes');
  await mongoose.connect(MONGO_URI);
  console.log('Connected:', MONGO_URI);

  const employeeStats = await migrateCollection(Employee, 'Employee');
  const applicationStats = await migrateCollection(EmployeeApplication, 'EmployeeApplication');

  console.log('\nSummary');
  console.log('Employees:', employeeStats);
  console.log('Applications:', applicationStats);
  console.log(dryRun ? '\nRe-run without --dry-run to apply.' : '\nMigration complete.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
