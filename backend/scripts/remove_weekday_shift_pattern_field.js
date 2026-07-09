/**
 * One-time cleanup: remove the stale 'weekday_shift_pattern' field from the
 * reporting_authority group in EmployeeApplicationFormSettings.
 * This field was added by a previous (incomplete) implementation and conflicts
 * with the proper top-level weekdayShiftSchedule config.
 */
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected:', MONGO_URI);

  const col = mongoose.connection.db.collection('employeeapplicationformsettings');

  // Check what's there first
  const doc = await col.findOne({ isActive: true });
  if (!doc) { console.log('No active settings doc found'); process.exit(0); }

  const groups = doc.groups || [];
  for (const g of groups) {
    if (g.id === 'reporting_authority') {
      const before = (g.fields || []).map(f => f.id);
      console.log('reporting_authority fields before:', before);
    }
  }

  // Remove the stale field using $pull with arrayFilters
  const result = await col.updateOne(
    { isActive: true },
    {
      $pull: {
        'groups.$[grp].fields': { id: 'weekday_shift_pattern' },
      },
    },
    {
      arrayFilters: [{ 'grp.id': 'reporting_authority' }],
    }
  );

  console.log('Modified count:', result.modifiedCount);

  // Verify
  const after = await col.findOne({ isActive: true });
  for (const g of (after.groups || [])) {
    if (g.id === 'reporting_authority') {
      console.log('reporting_authority fields after:', (g.fields || []).map(f => f.id));
    }
  }

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => { console.error(err); process.exit(1); });
