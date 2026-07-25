const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * Copy production MongoDB → local safely (upsert by _id).
 *
 * Resilient to Atlas network drops (ECONNRESET): reconnects, retries,
 * and resumes each collection from the last copied _id.
 *
 * Env:
 * 1. MONGODB_ATLAS_URI in backend/.env (source)
 * 2. Destination hardcoded below (or set LOCAL_COPY_URI)
 */

const MAX_RETRIES = 8;
const BATCH_SIZE = 500;
const RETRY_BASE_MS = 2000;

const CLIENT_OPTIONS = {
  // Keep sockets alive so long Atlas reads don't get silently dropped
  maxPoolSize: 5,
  minPoolSize: 1,
  maxIdleTimeMS: 60_000,
  connectTimeoutMS: 60_000,
  socketTimeoutMS: 0, // no idle socket timeout (we handle disconnects ourselves)
  serverSelectionTimeoutMS: 60_000,
  heartbeatFrequencyMS: 10_000,
  retryWrites: true,
  retryReads: true,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  const name = err.name || '';
  const code = err.code || err.cause?.code || '';
  const msg = String(err.message || err.cause?.message || '');
  const labels = err.errorLabelSet;

  if (labels && (labels.has('ResetPool') || labels.has('RetryableWriteError') || labels.has('Retryable'))) {
    return true;
  }
  if (
    name === 'MongoNetworkError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongoExpiredSessionError'
  ) {
    return true;
  }
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED'
  ) {
    return true;
  }
  if (/ECONNRESET|ETIMEDOUT|socket|network|not connected|topology|pool/i.test(msg)) {
    return true;
  }
  return false;
}

async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      const wait = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ⚠ ${label} failed (${err.name || 'Error'}: ${err.message}). ` +
          `Retry ${attempt}/${MAX_RETRIES} in ${wait / 1000}s...`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function copyDatabase() {
  const prodUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  const localUri = process.env.LOCAL_COPY_URI || 'mongodb://127.0.0.1:27017/ravi-1';

  if (!prodUri) {
    console.error('Missing MONGODB_ATLAS_URI (or MONGODB_URI) in backend/.env');
    process.exit(1);
  }

  console.log('--------------------------------------------------');
  console.log(`Source (PROD): ${prodUri.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Destination (LOCAL): ${localUri.replace(/:[^:@]+@/, ':****@')}`);
  console.log('--------------------------------------------------');
  console.log(
    'Note: Upserts by _id. Safe to re-run after a network drop — it resumes per collection.\n'
  );

  let prodClient = new MongoClient(prodUri, {
    ...CLIENT_OPTIONS,
    readPreference: 'secondaryPreferred',
  });
  let localClient = new MongoClient(localUri, CLIENT_OPTIONS);

  const reconnect = async (which) => {
    if (which === 'prod' || which === 'both') {
      try {
        await prodClient.close();
      } catch (_) {
        /* ignore */
      }
      prodClient = new MongoClient(prodUri, {
        ...CLIENT_OPTIONS,
        readPreference: 'secondaryPreferred',
      });
      await prodClient.connect();
      console.log('  ↻ Reconnected to production.');
    }
    if (which === 'local' || which === 'both') {
      try {
        await localClient.close();
      } catch (_) {
        /* ignore */
      }
      localClient = new MongoClient(localUri, CLIENT_OPTIONS);
      await localClient.connect();
      console.log('  ↻ Reconnected to local.');
    }
  };

  try {
    console.log('Connecting to Source (Production)...');
    await prodClient.connect();
    console.log('Connecting to Destination (Local)...');
    await localClient.connect();

    let prodDb = prodClient.db();
    let localDb = localClient.db();

    const collections = await withRetry('listCollections', () =>
      prodDb.listCollections().toArray()
    );
    console.log(`Found ${collections.length} collections in production.`);

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      if (collectionName.startsWith('system.')) continue;

      console.log(`\n--- Copying collection: ${collectionName} ---`);

      // Fresh handles after any reconnect
      prodDb = prodClient.db();
      localDb = localClient.db();

      let count;
      try {
        count = await withRetry(`count ${collectionName}`, async () => {
          prodDb = prodClient.db();
          return prodDb.collection(collectionName).countDocuments();
        });
      } catch (err) {
        if (isRetryableNetworkError(err)) {
          await reconnect('prod');
          prodDb = prodClient.db();
          count = await prodDb.collection(collectionName).countDocuments();
        } else {
          throw err;
        }
      }

      console.log(`Total documents to upsert: ${count}`);
      if (count === 0) {
        console.log(`Skipping empty collection: ${collectionName}`);
        continue;
      }

      // _id-based paging: no long-lived cursor that dies on ECONNRESET
      let lastId = null;
      let processed = 0;

      for (;;) {
        let docs;
        try {
          docs = await withRetry(`fetch ${collectionName} batch`, async () => {
            prodDb = prodClient.db();
            const filter = lastId ? { _id: { $gt: lastId } } : {};
            return prodDb
              .collection(collectionName)
              .find(filter)
              .sort({ _id: 1 })
              .limit(BATCH_SIZE)
              .toArray();
          });
        } catch (err) {
          if (!isRetryableNetworkError(err)) throw err;
          console.warn('  Network error on fetch — reconnecting production...');
          await reconnect('prod');
          continue;
        }

        if (!docs.length) break;

        const ops = docs.map((doc) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true,
          },
        }));

        try {
          await withRetry(`bulkWrite ${collectionName}`, async () => {
            localDb = localClient.db();
            await localDb.collection(collectionName).bulkWrite(ops, { ordered: false });
          });
        } catch (err) {
          if (!isRetryableNetworkError(err)) throw err;
          console.warn('  Network error on write — reconnecting local...');
          await reconnect('local');
          continue; // same batch again (upserts are safe)
        }

        lastId = docs[docs.length - 1]._id;
        processed += docs.length;
        console.log(`  Upserted ${processed}/${count}...`);

        if (docs.length < BATCH_SIZE) break;
      }

      console.log(`  ✓ Done: ${collectionName} (${processed} docs)`);
    }

    console.log('\nDatabase copy completed successfully!');
  } catch (error) {
    console.error('\nAn error occurred during the copy process:', error);
    console.error(
      '\nSafe to re-run this script — already-copied docs are upserted; remaining collections continue.'
    );
    process.exitCode = 1;
  } finally {
    try {
      await prodClient.close();
    } catch (_) {
      /* ignore */
    }
    try {
      await localClient.close();
    } catch (_) {
      /* ignore */
    }
  }
}

copyDatabase();
