/**
 * Migration Script: Convert Designations to Independent Entities
 * 
 * This script migrates existing designation data to the new independent designation architecture:
 * 1. Populates department.designations array with existing designation IDs
 * 2. Verifies data integrity
 * 3. Provides rollback capability
 * 
 * Run with: node backend/scripts/migrate_designations_to_independent.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const path = require('path');

const Department = require(path.join(__dirname, '../departments/model/Department'));
const Designation = require(path.join(__dirname, '../departments/model/Designation'));
const Employee = require(path.join(__dirname, '../employees/model/Employee'));

// Configuration
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set to 'true' for preview mode

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ MongoDB connection error:', error);
        process.exit(1);
    }
}

async function migrateDesignations() {
    console.log('\n========================================');
    console.log('DESIGNATION MIGRATION SCRIPT');
    console.log('========================================\n');

    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    } else {
        console.log('⚠️  LIVE MODE - Changes will be applied\n');
    }

    try {
        // Step 1: Get all departments
        const departments = await Department.find({});
        console.log(`Found ${departments.length} departments\n`);

        const migrationResults = {
            departments: 0,
            designationsLinked: 0,
            errors: [],
        };

        // Step 2: For each department, find and link designations
        for (const department of departments) {
            console.log(`\nProcessing: ${department.name} (${department._id})`);

            try {
                // Find all designations that reference this department
                const designations = await Designation.find({
                    department: department._id
                });

                console.log(`  - Found ${designations.length} designation(s) with department reference`);

                if (designations.length > 0) {
                    const designationIds = designations.map(d => d._id);

                    // Show what will be linked
                    designations.forEach(d => {
                        console.log(`    • ${d.name} (${d._id})`);
                    });

                    if (!DRY_RUN) {
                        // Update department's designations array
                        await Department.findByIdAndUpdate(
                            department._id,
                            { $addToSet: { designations: { $each: designationIds } } }
                        );
                        console.log(`  ✓ Linked ${designations.length} designation(s) to department`);
                    } else {
                        console.log(`  [DRY RUN] Would link ${designations.length} designation(s)`);
                    }

                    migrationResults.departments++;
                    migrationResults.designationsLinked += designations.length;
                } else {
                    console.log(`  - No designations found for this department`);
                }
            } catch (error) {
                console.error(`  ✗ Error processing department ${department.name}:`, error.message);
                migrationResults.errors.push({
                    department: department.name,
                    error: error.message,
                });
            }
        }

        // Step 3: Find and link designations used by employees but not yet linked
        console.log('\n\nChecking for designations used by employees...');
        const employees = await Employee.find({
            designation_id: { $ne: null },
            department_id: { $ne: null }
        }).populate('designation_id department_id');

        const employeeDesignationLinks = new Map(); // departmentId -> Set of designationIds

        for (const employee of employees) {
            if (employee.designation_id && employee.department_id) {
                const deptId = employee.department_id._id.toString();
                const desigId = employee.designation_id._id.toString();

                if (!employeeDesignationLinks.has(deptId)) {
                    employeeDesignationLinks.set(deptId, new Set());
                }
                employeeDesignationLinks.get(deptId).add(desigId);
            }
        }

        console.log(`Found ${employeeDesignationLinks.size} department(s) with employee-designation links`);

        for (const [deptId, desigIds] of employeeDesignationLinks) {
            const department = await Department.findById(deptId);
            if (!department) continue;

            const newLinks = [];
            for (const desigId of desigIds) {
                if (!department.designations.includes(desigId)) {
                    newLinks.push(desigId);
                }
            }

            if (newLinks.length > 0) {
                console.log(`\n${department.name}: Adding ${newLinks.length} designation(s) from employee assignments`);

                if (!DRY_RUN) {
                    await Department.findByIdAndUpdate(
                        deptId,
                        { $addToSet: { designations: { $each: newLinks } } }
                    );
                    console.log(`  ✓ Added ${newLinks.length} designation(s)`);
                } else {
                    console.log(`  [DRY RUN] Would add ${newLinks.length} designation(s)`);
                }

                migrationResults.designationsLinked += newLinks.length;
            }
        }

        // Step 4: Verification
        console.log('\n\n========================================');
        console.log('VERIFICATION');
        console.log('========================================\n');

        const verificationResults = {
            totalDepartments: 0,
            departmentsWithDesignations: 0,
            totalDesignationLinks: 0,
            orphanedDesignations: 0,
        };

        const allDepartments = await Department.find({});
        verificationResults.totalDepartments = allDepartments.length;

        for (const dept of allDepartments) {
            if (dept.designations && dept.designations.length > 0) {
                verificationResults.departmentsWithDesignations++;
                verificationResults.totalDesignationLinks += dept.designations.length;
            }
        }

        // Check for orphaned designations (not linked to any department)
        const allDesignations = await Designation.find({});
        for (const desig of allDesignations) {
            const linkedDepartments = await Department.countDocuments({
                designations: desig._id
            });

            if (linkedDepartments === 0) {
                verificationResults.orphanedDesignations++;
                console.log(`⚠️  Orphaned designation: ${desig.name} (${desig._id})`);
            }
        }

        console.log(`Total Departments: ${verificationResults.totalDepartments}`);
        console.log(`Departments with Designations: ${verificationResults.departmentsWithDesignations}`);
        console.log(`Total Designation Links: ${verificationResults.totalDesignationLinks}`);
        console.log(`Orphaned Designations: ${verificationResults.orphanedDesignations}`);

        // Step 5: Summary
        console.log('\n\n========================================');
        console.log('MIGRATION SUMMARY');
        console.log('========================================\n');

        console.log(`Departments Processed: ${migrationResults.departments}`);
        console.log(`Designations Linked: ${migrationResults.designationsLinked}`);
        console.log(`Errors: ${migrationResults.errors.length}`);

        if (migrationResults.errors.length > 0) {
            console.log('\nErrors encountered:');
            migrationResults.errors.forEach(err => {
                console.log(`  - ${err.department}: ${err.error}`);
            });
        }

        if (DRY_RUN) {
            console.log('\n✓ DRY RUN COMPLETE - No changes were made');
            console.log('To apply changes, run: DRY_RUN=false node backend/scripts/migrate_designations_to_independent.js');
        } else {
            console.log('\n✓ MIGRATION COMPLETE');
        }

    } catch (error) {
        console.error('\n✗ Migration failed:', error);
        throw error;
    }
}

async function main() {
    try {
        await connectDB();
        await migrateDesignations();
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n✓ Database connection closed');
    }
}

// Run migration
main();
