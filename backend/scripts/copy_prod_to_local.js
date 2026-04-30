const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * Script to copy a production MongoDB database to a local instance safely.
 * Replaces or inserts each document by _id (upsert). Does not delete local
 * documents that no longer exist in production.
 * Requirements:
 * 1. MONGODB_ATLAS_URI in backend/.env (Source - Production)
 * 2. MONGODB_URI in backend/.env (Destination - Local)
 */

async function copyDatabase() {
    const prodUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
    const localUri = "mongodb://127.0.0.1:27017/hrms-ravi";

    console.log("--------------------------------------------------");
    console.log(`Source (PROD): ${prodUri.replace(/:[^:@]+@/, ':****@')}`);
    console.log(`Destination (LOCAL): ${localUri.replace(/:[^:@]+@/, ':****@')}`);
    console.log("--------------------------------------------------");

    console.log("Connecting to Source (Production)...");
    const prodClient = new MongoClient(prodUri, { readPreference: 'secondaryPreferred' });

    console.log("Connecting to Destination (Local)...");
    const localClient = new MongoClient(localUri);

    try {
        await prodClient.connect();
        await localClient.connect();

        const prodDb = prodClient.db();
        const localDb = localClient.db();

        // Get all collections from production
        const collections = await prodDb.listCollections().toArray();
        console.log(`Found ${collections.length} collections in production.`);

        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;

            // Skip system collections if any
            if (collectionName.startsWith('system.')) continue;

            console.log(`\n--- Copying collection: ${collectionName} ---`);

            const prodCollection = prodDb.collection(collectionName);
            const count = await prodCollection.countDocuments();
            console.log(`Total documents to upsert: ${count}`);

            if (count === 0) {
                console.log(`Skipping empty collection: ${collectionName}`);
                continue;
            }

            const batchSize = 1000;
            const cursor = prodCollection.find({});

            let batch = [];
            let processed = 0;

            const flushBatch = async () => {
                if (batch.length === 0) return;
                const ops = batch.map((doc) => ({
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true,
                    },
                }));
                await localDb.collection(collectionName).bulkWrite(ops, { ordered: false });
                processed += batch.length;
                console.log(`  Upserted ${processed}/${count}...`);
                batch = [];
            };

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                batch.push(doc);

                if (batch.length === batchSize) {
                    await flushBatch();
                }
            }

            await flushBatch();
        }

        console.log("\nDatabase copy completed successfully!");

    } catch (error) {
        console.error("An error occurred during the copy process:", error);
    } finally {
        await prodClient.close();
        await localClient.close();
    }
}

copyDatabase();
