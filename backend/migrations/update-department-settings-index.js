/**
 * Migration Script: Update DepartmentSettings Index
 * 
 * Purpose: Drop old single-field index and create new compound index
 * to support division-specific department settings.
 * 
 * Old Index: { department: 1 } (unique)
 * New Index: { department: 1, division: 1 } (unique)
 * 
 * This allows multiple settings per department (one per division + one default)
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateDepartmentSettingsIndex() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms');
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('departmentsettings');

        // Get existing indexes
        const indexes = await collection.indexes();
        console.log('\n📋 Current indexes:');
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}:`, idx.key);
        });

        // Drop the old department_1 index if it exists
        try {
            const oldIndexExists = indexes.some(idx => idx.name === 'department_1');
            if (oldIndexExists) {
                console.log('\n🗑️  Dropping old index: department_1');
                await collection.dropIndex('department_1');
                console.log('✅ Old index dropped successfully');
            } else {
                console.log('\n⚠️  Old index department_1 not found (already dropped?)');
            }
        } catch (error) {
            if (error.code === 27) {
                console.log('⚠️  Index department_1 does not exist (already dropped)');
            } else {
                throw error;
            }
        }

        // Create new compound index
        console.log('\n🔧 Creating new compound index: { department: 1, division: 1 }');
        await collection.createIndex(
            { department: 1, division: 1 },
            {
                unique: true,
                name: 'department_1_division_1'
            }
        );
        console.log('✅ New compound index created successfully');

        // Verify new indexes
        const newIndexes = await collection.indexes();
        console.log('\n📋 Updated indexes:');
        newIndexes.forEach(idx => {
            console.log(`  - ${idx.name}:`, idx.key);
        });

        console.log('\n✅ Migration completed successfully!');
        console.log('\nYou can now:');
        console.log('  1. Create department default settings (division = null)');
        console.log('  2. Create division-specific settings (division = specific ID)');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

// Run migration
migrateDepartmentSettingsIndex();
