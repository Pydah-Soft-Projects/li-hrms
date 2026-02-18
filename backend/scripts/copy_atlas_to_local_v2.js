/**
 * ============================================================
 * ATLAS → LOCAL MONGODB MIGRATION SCRIPT
 * ============================================================
 * Copies ALL data from MongoDB Atlas to local MongoDB.
 * 
 * Instructions:
 * 1. Ensure your local MongoDB is running (mongod).
 * 2. Run this script: node scripts/copy_atlas_to_local_v2.js
 * ============================================================
 */

const { MongoClient } = require('mongodb');

// Configuration
const ATLAS_URI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms';
const LOCAL_URI = 'mongodb://localhost:27017/hrms';

async function migrate() {
    console.log('\n🚀 Starting Migration: Atlas → Local\n');

    const atlasClient = new MongoClient(ATLAS_URI);
    const localClient = new MongoClient(LOCAL_URI);

    try {
        // Connect to both
        await atlasClient.connect();
        console.log('✅ Connected to Atlas');

        await localClient.connect();
        console.log('✅ Connected to Local MongoDB');

        const atlasDb = atlasClient.db();
        const localDb = localClient.db();

        // Get all collections
        const collections = await atlasDb.listCollections().toArray();
        console.log(`\n📦 Found ${collections.length} collections in Atlas\n`);

        for (const collInfo of collections) {
            const collName = collInfo.name;

            // Skip system collections
            if (collName.startsWith('system.')) continue;

            console.log(`\n── Processing: ${collName.padEnd(25)} ──`);

            // 1. Clear local collection (optional, but cleaner for a full copy)
            // If you want to MERGE instead of REPLACE, comment out the line below:
            // await localDb.collection(collName).deleteMany({});

            // 2. Fetch data from Atlas
            const data = await atlasDb.collection(collName).find({}).toArray();

            if (data.length === 0) {
                console.log(`   ℹ️  Collection is empty. Skipping.`);
                continue;
            }

            console.log(`   ⬆️  Reading ${data.length} documents from Atlas...`);

            // 3. Insert into Local (in batches to be safe)
            const BATCH_SIZE = 500;
            let inserted = 0;

            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                try {
                    // Use ordered: false to skip duplicates if they exist locally
                    await localDb.collection(collName).insertMany(batch, { ordered: false });
                    inserted += batch.length;
                } catch (e) {
                    // Part of the batch might have failed due to duplicate _id
                    // but others would have been inserted.
                    if (e.writeErrors) {
                        inserted += (batch.length - e.writeErrors.length);
                    } else {
                        console.error(`   ❌ Error in batch for ${collName}:`, e.message);
                    }
                }
            }

            console.log(`   ✅ Successfully copied ${inserted} documents to Local.`);

            // 4. Copy Indexes (optional but highly recommended)
            try {
                const indexes = await atlasDb.collection(collName).indexes();
                for (const idx of indexes) {
                    if (idx.name === '_id_') continue;
                    // Remove version/ns if present to avoid errors
                    const { v, ns, ...idxSpec } = idx;
                    await localDb.collection(collName).createIndex(idxSpec.key, idxSpec);
                }
                console.log(`   📌 Indices re-created.`);
            } catch (idxErr) {
                console.warn(`   ⚠️  Could not copy indices for ${collName}: ${idxErr.message}`);
            }
        }

        console.log('\n✨ MIGRATION COMPLETE! All data copied to local MongoDB.\n');

    } catch (error) {
        console.error('\n❌ FATAL ERROR DURING MIGRATION:', error);
    } finally {
        await atlasClient.close();
        await localClient.close();
    }
}

migrate();
