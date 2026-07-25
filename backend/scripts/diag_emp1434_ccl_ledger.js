/** Read-only: CCL register state for emp 1434 on local copy. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const util = require('util');

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ravi-1');
  await client.connect();
  const db = client.db();
  console.log('DB:', db.databaseName);

  const emp = await db.collection('employees').findOne({ emp_no: '1434' }, { projection: { _id: 1, employee_name: 1 } });

  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  const regCols = cols.filter((c) => /leaveregister|leavebalance|monthlyleave|elhist/i.test(c));
  console.log('Register-ish collections:', regCols);

  for (const colName of regCols) {
    const docs = await db
      .collection(colName)
      .find({ $or: [{ employeeId: emp._id }, { emp_no: '1434' }] })
      .limit(5)
      .toArray();
    if (!docs.length) continue;
    console.log(`\n=== ${colName} (${docs.length} docs shown) ===`);
    for (const d of docs) {
      // Print compact: balances + count of today's transactions
      const summary = { _id: d._id, financialYear: d.financialYear, leaveType: d.leaveType || d.type };
      for (const k of Object.keys(d)) {
        const v = d[k];
        if (typeof v === 'number') summary[k] = v;
      }
      console.log(util.inspect(summary, { depth: 3 }));
      const txArrays = [];
      if (Array.isArray(d.transactions)) txArrays.push(['transactions', d.transactions]);
      if (Array.isArray(d.months)) {
        for (const m of d.months) {
          if (Array.isArray(m.transactions)) txArrays.push([`months[${m.month || m.monthNumber}].transactions`, m.transactions]);
        }
      }
      for (const [label, txs] of txArrays) {
        const today = txs.filter((t) => t.createdAt && new Date(t.createdAt) >= new Date('2026-07-25T00:00:00Z'));
        const debitsToday = today.filter((t) => /debit/i.test(t.type || t.action || ''));
        console.log(`  ${label}: total=${txs.length}, createdToday=${today.length}, debitsToday=${debitsToday.length}`);
        const dSum = debitsToday.reduce((s, t) => s + (Number(t.days) || Number(t.amount) || 0), 0);
        const cSum = today
          .filter((t) => /credit|reverse/i.test(t.type || t.action || ''))
          .reduce((s, t) => s + (Number(t.days) || Number(t.amount) || 0), 0);
        console.log(`  today's debit days=${dSum}, credit/reversal days=${cSum}`);
        if (today.length) {
          console.log('  sample today tx:', util.inspect(today[today.length - 1], { depth: 2 }));
        }
      }
    }
  }

  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
