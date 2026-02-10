/**
 * Migration: Migrate Users to divisionMapping-only scope model
 *
 * Converts allowedDivisions, departments, department → divisionMapping
 * Then removes the deprecated fields from User documents.
 *
 * Usage: node scripts/migrate_users_to_division_mapping.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../users/model/User');
const Department = require('../departments/model/Department');

async function migrate() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const users = await User.find({}).lean();

    console.log(`Found ${users.length} users to migrate.`);

    let migrated = 0;
    for (const user of users) {
      const existingMapping = Array.isArray(user.divisionMapping) ? user.divisionMapping : [];
      const mapByDivision = new Map(); // divisionId -> Set of departmentIds

      // 1. Merge existing divisionMapping into map
      for (const m of existingMapping) {
        const divId = m.division?._id || m.division;
        if (divId) {
          const depts = m.departments || [];
          const ids = new Set(depts.map((d) => (d?._id || d).toString()));
          if (!mapByDivision.has(divId.toString())) {
            mapByDivision.set(divId.toString(), ids);
          } else {
            depts.forEach((d) => mapByDivision.get(divId.toString()).add((d?._id || d).toString()));
          }
        }
      }

      // 2. allowedDivisions -> division + all departments (empty array = all depts in division)
      const allowedDivs = user.allowedDivisions || [];
      for (const divId of allowedDivs) {
        const key = (divId?._id || divId).toString();
        if (!mapByDivision.has(key)) {
          mapByDivision.set(key, new Set()); // empty = all departments in that division
        }
      }

      // 3. departments -> resolve each dept's divisions, add to map
      const deptIds = [];
      if (user.departments && user.departments.length > 0) {
        deptIds.push(...user.departments.map((d) => d?._id || d));
      }
      if (user.department) {
        deptIds.push(user.department?._id || user.department);
      }

      if (deptIds.length > 0) {
        const depts = await Department.find({ _id: { $in: deptIds } })
          .select('_id divisions')
          .lean();

        for (const dept of depts) {
          const deptId = dept._id.toString();
          const divs = dept.divisions || [];

          if (divs.length === 0) {
            // Department has no divisions - skip or use a fallback?
            // For safety, skip (migration will not add scope for orphan depts)
            continue;
          }

          for (const div of divs) {
            const divId = (div?._id || div).toString();
            if (!mapByDivision.has(divId)) {
              mapByDivision.set(divId, new Set());
            }
            mapByDivision.get(divId).add(deptId);
          }
        }
      }

      // 4. Build final divisionMapping
      const divisionMapping = [];
      for (const [divIdStr, deptIdSet] of mapByDivision) {
        divisionMapping.push({
          division: new mongoose.Types.ObjectId(divIdStr),
          departments: Array.from(deptIdSet).map((id) => new mongoose.Types.ObjectId(id)),
        });
      }

      // 5. Update user
      await User.updateOne(
        { _id: user._id },
        {
          $set: { divisionMapping },
          $unset: {
            allowedDivisions: '',
            departments: '',
            department: '',
            departmentType: '',
          },
        }
      );

      migrated++;
      console.log(`  Migrated user ${user.email} (${user._id}) -> ${divisionMapping.length} mapping entries`);
    }

    console.log(`\nMigration complete. ${migrated} users updated.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
