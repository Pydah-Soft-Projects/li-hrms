/**
 * Copy shift roster from LOCAL MongoDB to ATLAS MongoDB.
 *
 * Source: MONGODB_URI or MONGODB_URI_LOCAL (default: mongodb://localhost:27017/hrms)
 * Target: MONGODB_URI_ATLAS (required)
 *
 * Optional date range (YYYY-MM-DD):
 *   DATE_FROM=2026-02-01 DATE_TO=2026-02-28
 * If omitted, copies all PreScheduledShift documents.
 *
 * Prerequisites on Atlas:
 *   - Shifts and at least one User (e.g. super_admin) should exist with same _ids as local,
 *     so shiftId and scheduledBy references remain valid. If Atlas was restored from local
 *     or seeded the same way, you're good.
 *
 * Run from backend:
 *   node scripts/copy_roster_local_to_atlas.js
 *
 * With env (e.g. in .env or inline):
 *   MONGODB_URI_LOCAL=mongodb://localhost:27017/hrms
 *   MONGODB_URI_ATLAS=mongodb+srv://user:pass@cluster.mongodb.net/hrms
 *
 *   # Optional: copy only a date range
 *   DATE_FROM=2026-02-01 DATE_TO=2026-02-28 node scripts/copy_roster_local_to_atlas.js
 *
 * Dry run (no write to Atlas; use to verify script and connections):
 *   DRY_RUN=1 node scripts/copy_roster_local_to_atlas.js
 *   With Atlas URI in .env, dry run also connects to Atlas and shows existing count.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');

const LOCAL_URI = process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const ATLAS_URI = process.env.MONGODB_URI_ATLAS;
const DATE_FROM = process.env.DATE_FROM; // YYYY-MM-DD
const DATE_TO = process.env.DATE_TO;     // YYYY-MM-DD
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function maskUri(uri) {
  if (!uri) return '(not set)';
  return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
}

async function run() {
  if (!DRY_RUN && !ATLAS_URI) {
    console.error('MONGODB_URI_ATLAS is required. Set it in .env or:');
    console.error('  MONGODB_URI_ATLAS="mongodb+srv://..." node scripts/copy_roster_local_to_atlas.js');
    process.exit(1);
  }

  try {
    // ----- Source: Local -----
    console.log('Connecting to LOCAL (source)...', maskUri(LOCAL_URI));
    await mongoose.connect(LOCAL_URI);
    console.log('Connected to local.\n');

    const filter = {};
    if (DATE_FROM || DATE_TO) {
      filter.date = {};
      if (DATE_FROM) filter.date.$gte = DATE_FROM;
      if (DATE_TO) filter.date.$lte = DATE_TO;
    }
    const roster = await PreScheduledShift.find(filter).lean();
    console.log(`Read ${roster.length} roster entries from local.`);
    if (roster.length === 0) {
      console.log('Nothing to copy. Exiting.');
      await mongoose.disconnect();
      process.exit(0);
    }

    const dates = [...new Set(roster.map((r) => r.date))].sort();
    const empCount = new Set(roster.map((r) => r.employeeNumber)).size;
    console.log(`  Date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`);
    console.log(`  Employees: ${empCount}`);

    if (DRY_RUN) {
      await mongoose.disconnect();
      console.log('Disconnected from local.');
      if (ATLAS_URI) {
        console.log('\nConnecting to ATLAS (read-only check)...', maskUri(ATLAS_URI));
        await mongoose.connect(ATLAS_URI);
        const atlasFilter = {};
        if (DATE_FROM || DATE_TO) {
          atlasFilter.date = {};
          if (DATE_FROM) atlasFilter.date.$gte = DATE_FROM;
          if (DATE_TO) atlasFilter.date.$lte = DATE_TO;
        }
        const atlasCount = await mongoose.connection.db
          .collection('prescheduledshifts')
          .countDocuments(atlasFilter);
        console.log(`  Roster entries on Atlas (same filter): ${atlasCount}`);
        await mongoose.disconnect();
        console.log('Disconnected from Atlas.');
        console.log('\n[DRY RUN] Would upsert', roster.length, 'entries. No changes made.');
      } else {
        console.log('\n[DRY RUN] Set MONGODB_URI_ATLAS in .env to also verify Atlas connection.');
      }
      console.log('\nTo run for real, remove DRY_RUN or run without DRY_RUN=1.');
      process.exit(0);
    }

    await mongoose.disconnect();
    console.log('Disconnected from local.\n');

    // ----- Target: Atlas -----
    console.log('Connecting to ATLAS (target)...', maskUri(ATLAS_URI));
    await mongoose.connect(ATLAS_URI);
    console.log('Connected to Atlas.\n');

    // Prepare documents for upsert (strip _id so we upsert by employeeNumber+date)
    const updates = roster.map((doc) => {
      const { _id, __v, createdAt, updatedAt, ...rest } = doc;
      return {
        updateOne: {
          filter: { employeeNumber: doc.employeeNumber, date: doc.date },
          update: { $set: rest },
          upsert: true,
        },
      };
    });

    const BATCH = 500;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const result = await mongoose.connection.db
        .collection('prescheduledshifts')
        .bulkWrite(batch);
      written += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    }
    console.log(`Upserted ${written} roster entries on Atlas.`);

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
    process.exit(0);
  }
}

run();
