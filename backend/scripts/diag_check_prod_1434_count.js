/** Read-only count of emp 1434 leaves on PROD Atlas. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(process.env.MONGODB_ATLAS_URI, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db();
  console.log('PROD DB:', db.databaseName);
  const col = db.collection('leaves');
  const total = await col.countDocuments({ emp_no: '1434', createdAt: { $gte: new Date('2026-07-25T00:00:00Z') } });
  const approved = await col.countDocuments({
    emp_no: '1434',
    createdAt: { $gte: new Date('2026-07-25T00:00:00Z') },
    status: 'approved',
    isActive: true,
  });
  const latest = await col
    .find({ emp_no: '1434' })
    .sort({ createdAt: -1 })
    .limit(1)
    .project({ createdAt: 1, status: 1, fromDate: 1, toDate: 1 })
    .toArray();
  console.log('Leaves for 1434 created on 2026-07-25 (UTC):', total);
  console.log('...of which approved+active:', approved);
  console.log('Most recent leave doc:', latest[0]);
  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
