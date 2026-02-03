/**
 * Migration Script: Remove Workspace Fields from Users
 * 
 * This script removes workspace-related fields from all user documents:
 * - activeWorkspaceId
 * - preferences.defaultWorkspace
 * 
 * Run this after deploying the updated User model.
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function removeWorkspaceFields() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Count documents before migration
        const totalUsers = await usersCollection.countDocuments();
        console.log(`📊 Total users in database: ${totalUsers}`);

        // Count users with workspace fields
        const usersWithActiveWorkspace = await usersCollection.countDocuments({
            activeWorkspaceId: { $exists: true }
        });
        const usersWithDefaultWorkspace = await usersCollection.countDocuments({
            'preferences.defaultWorkspace': { $exists: true }
        });

        console.log(`🔍 Users with activeWorkspaceId: ${usersWithActiveWorkspace}`);
        console.log(`🔍 Users with preferences.defaultWorkspace: ${usersWithDefaultWorkspace}`);

        // Perform the migration
        console.log('\n🚀 Starting migration...');

        const result = await usersCollection.updateMany(
            {},
            {
                $unset: {
                    activeWorkspaceId: "",
                    "preferences.defaultWorkspace": ""
                }
            }
        );

        console.log(`\n✅ Migration completed successfully!`);
        console.log(`📝 Modified ${result.modifiedCount} documents`);
        console.log(`📝 Matched ${result.matchedCount} documents`);

        // Verify the migration
        const remainingActiveWorkspace = await usersCollection.countDocuments({
            activeWorkspaceId: { $exists: true }
        });
        const remainingDefaultWorkspace = await usersCollection.countDocuments({
            'preferences.defaultWorkspace': { $exists: true }
        });

        console.log(`\n🔍 Verification:`);
        console.log(`   Users with activeWorkspaceId: ${remainingActiveWorkspace} (should be 0)`);
        console.log(`   Users with preferences.defaultWorkspace: ${remainingDefaultWorkspace} (should be 0)`);

        if (remainingActiveWorkspace === 0 && remainingDefaultWorkspace === 0) {
            console.log('\n✅ Migration verified successfully! All workspace fields removed.');
        } else {
            console.log('\n⚠️  Warning: Some workspace fields still exist. Please investigate.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Database connection closed');
    }
}

// Run the migration
removeWorkspaceFields();
