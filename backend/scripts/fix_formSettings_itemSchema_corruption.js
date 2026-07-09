/**
 * One-time migration script: repair EmployeeApplicationFormSettings documents where
 * a field's itemSchema.fields was stored as a JSON string instead of an array of objects.
 *
 * Usage (from the backend folder):
 *   node scripts/fix_formSettings_itemSchema_corruption.js
 *
 * Safe to run multiple times — it only modifies documents where corruption is detected.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI);

  // Work directly on the raw collection to avoid Mongoose validation errors
  const col = mongoose.connection.db.collection('employeeapplicationformsettings');

  const docs = await col.find({ isActive: true }).toArray();
  console.log(`Found ${docs.length} active form-settings document(s)`);

  let totalFixed = 0;

  for (const doc of docs) {
    let docModified = false;
    const groups = Array.isArray(doc.groups) ? doc.groups : [];

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const fields = Array.isArray(group.fields) ? group.fields : [];

      for (let fi = 0; fi < fields.length; fi++) {
        const field = fields[fi];
        if (!field || !field.itemSchema) continue;

        const raw = field.itemSchema.fields;

        // If it's already a proper array, nothing to do
        if (Array.isArray(raw)) continue;

        // If it's a string (the corruption), try to parse it
        if (typeof raw === 'string') {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            // Not valid JSON — clear it to an empty array rather than leave it broken
            parsed = [];
          }

          if (!Array.isArray(parsed)) parsed = [];

          console.log(
            `  Repairing group[${gi}].fields[${fi}] (id=${field.id || '?'}): ` +
            `itemSchema.fields was a string (${String(raw).length} chars), ` +
            `parsed to ${parsed.length} item(s)`
          );

          // Mutate in-place on the JS object; we'll $set the whole groups array below
          doc.groups[gi].fields[fi].itemSchema.fields = parsed;
          docModified = true;
        }
      }
    }

    if (docModified) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { groups: doc.groups } }
      );
      console.log(`  Saved repaired document _id=${doc._id}`);
      totalFixed++;
    }
  }

  if (totalFixed === 0) {
    console.log('No corruption found — nothing to fix.');
  } else {
    console.log(`\nDone. Repaired ${totalFixed} document(s).`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
