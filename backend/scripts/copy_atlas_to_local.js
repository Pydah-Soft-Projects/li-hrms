/**
 * ============================================================
 * ATLAS → LOCAL MONGODB COPY SCRIPT (using Mongoose)
 * ============================================================
 * Copies ALL collections from Atlas to local MongoDB.
 * Atlas is READ-ONLY — never modified.
 *
 * Usage:
 *   node scripts/copy_atlas_to_local.js
 *   node scripts/copy_atlas_to_local.js --drop        (drop local first)
 *   node scripts/copy_atlas_to_local.js --collection employees
 * ============================================================
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms';
const LOCAL_URI = 'mongodb://localhost:27017/hrms';

const args = process.argv.slice(2);
const DROP_FIRST = args.includes('--drop');
const SINGLE_COLLECTION = (() => { const i = args.indexOf('--collection'); return i !== -1 ? args[i + 1] : null; })();
const BATCH_SIZE = 500;

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║         ATLAS  →  LOCAL  MONGODB  COPY               ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    if (DROP_FIRST) console.log('⚠️  --drop: local collections will be dropped first\n');
    if (SINGLE_COLLECTION) console.log(`📦 Single collection: ${SINGLE_COLLECTION}\n`);

    // ── Connect to Atlas (source) ─────────────────────────────
    console.log('🔗 Connecting to Atlas...');
    const atlasConn = await mongoose.createConnection(ATLAS_URI, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
    }).asPromise();
    console.log('✅ Atlas connected\n');

    // ── Connect to Local (destination) ───────────────────────
    console.log('🔗 Connecting to Local MongoDB...');
    const localConn = await mongoose.createConnection(LOCAL_URI, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
    }).asPromise();
    console.log('✅ Local connected\n');

    const atlasDb = atlasConn.db;
    const localDb = localConn.db;

    // ── List collections ──────────────────────────────────────
    const allCollections = await atlasDb.listCollections().toArray();
    const collections = SINGLE_COLLECTION
        ? allCollections.filter(c => c.name === SINGLE_COLLECTION)
        : allCollections.filter(c => c.type === 'collection');

    if (collections.length === 0) {
        console.log('⚠️  No collections found. Exiting.');
        await atlasConn.close();
        await localConn.close();
        return;
    }

    console.log(`📋 ${collections.length} collection(s) to copy:`);
    collections.forEach(c => console.log(`   • ${c.name}`));
    console.log('');

    const stats = { collections: 0, totalDocs: 0, errors: [], startTime: Date.now() };

    for (const collInfo of collections) {
        const name = collInfo.name;
        console.log(`\n── ${name} ──────────────────────────────────────────`);

        try {
            const srcColl = atlasDb.collection(name);
            const destColl = localDb.collection(name);

            const total = await srcColl.countDocuments();
            console.log(`   Atlas: ${total} docs`);

            if (DROP_FIRST) {
                await destColl.drop().catch(() => { });
                console.log(`   🗑️  Local dropped`);
            }

            if (total === 0) {
                console.log(`   ⏭️  Empty — skipped`);
                stats.collections++;
                continue;
            }

            // Stream all docs in batches
            let copied = 0;
            let batch = [];
            const cursor = srcColl.find({});

            for await (const doc of cursor) {
                batch.push(doc);
                if (batch.length >= BATCH_SIZE) {
                    await destColl.insertMany(batch, { ordered: false }).catch(err => {
                        // Ignore duplicate key errors silently
                        if (!(err.code === 11000 || (err.writeErrors && err.writeErrors.every(e => e.code === 11000)))) throw err;
                    });
                    copied += batch.length;
                    process.stdout.write(`\r   Copied: ${copied}/${total}`);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                await destColl.insertMany(batch, { ordered: false }).catch(err => {
                    if (!(err.code === 11000 || (err.writeErrors && err.writeErrors.every(e => e.code === 11000)))) throw err;
                });
                copied += batch.length;
            }

            const localTotal = await destColl.countDocuments();
            process.stdout.write(`\r   ✅ Copied ${copied} | Local total: ${localTotal}\n`);

            // Copy indexes
            try {
                const indexes = await srcColl.indexes();
                for (const idx of indexes) {
                    if (idx.name === '_id_') continue;
                    const { key, name: idxName, ...opts } = idx;
                    await destColl.createIndex(key, { name: idxName, ...opts }).catch(() => { });
                }
                console.log(`   📑 Indexes copied`);
            } catch { /* skip */ }

            stats.collections++;
            stats.totalDocs += copied;

        } catch (err) {
            console.log(`   ❌ ${err.message}`);
            stats.errors.push(`${name}: ${err.message}`);
        }
    }

    // ── Summary ───────────────────────────────────────────────
    const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                    COPY COMPLETE                     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Collections: ${String(stats.collections).padEnd(38)}║`);
    console.log(`║  Documents:   ${String(stats.totalDocs).padEnd(38)}║`);
    console.log(`║  Time:        ${String(`${Math.floor(elapsed / 60)}m ${elapsed % 60}s`).padEnd(38)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');

    if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} error(s):`);
        stats.errors.forEach(e => console.log(`   • ${e}`));
    } else {
        console.log('\n✅ Done. Atlas was NOT modified.\n');
    }

    await atlasConn.close();
    await localConn.close();
}

main().catch(err => {
    console.error('\n❌ Fatal:', err.message);
    process.exit(1);
});
