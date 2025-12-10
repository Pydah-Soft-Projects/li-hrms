/**
 * Migration Script for Employee Data
 * Migrates existing employee data to support dynamicFields structure
 * 
 * Run with: node scripts/migrateEmployeeData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';

/**
 * Migrate existing employees to support dynamicFields
 * - Initializes dynamicFields: {} for employees without it
 * - Optionally migrates old qualifications string to dynamicFields.qualifications array
 */
async function migrateEmployeeData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Get all employees
    const employees = await Employee.find({});
    console.log(`Found ${employees.length} employees to migrate\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const employee of employees) {
      try {
        let needsUpdate = false;
        const updates = {};

        // Initialize dynamicFields if it doesn't exist
        if (!employee.dynamicFields || typeof employee.dynamicFields !== 'object') {
          updates.dynamicFields = {};
          needsUpdate = true;
        }

        // Migrate qualifications from string to array format (if not already migrated)
        if (employee.qualifications && typeof employee.qualifications === 'string' && employee.qualifications.trim()) {
          // Check if already migrated
          if (!employee.dynamicFields?.qualifications || !Array.isArray(employee.dynamicFields.qualifications)) {
            updates.dynamicFields = {
              ...(employee.dynamicFields || {}),
              qualifications: [
                {
                  degree: employee.qualifications,
                  // Keep old string format as degree field
                },
              ],
            };
            needsUpdate = true;
            console.log(`  Migrating qualifications for ${employee.emp_no}: "${employee.qualifications}" -> array format`);
          }
        }

        // Update if needed
        if (needsUpdate) {
          await Employee.findByIdAndUpdate(employee._id, updates);
          migrated++;
          console.log(`  ✓ Migrated ${employee.emp_no} (${employee.employee_name})`);
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(`  ✗ Error migrating ${employee.emp_no}:`, error.message);
      }
    }

    console.log('\n✅ Migration completed!');
    console.log(`   - Migrated: ${migrated} employees`);
    console.log(`   - Skipped: ${skipped} employees (already up to date)`);
    console.log(`   - Errors: ${errors} employees`);
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  migrateEmployeeData();
}

module.exports = { migrateEmployeeData };

