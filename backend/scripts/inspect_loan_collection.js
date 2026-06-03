/**
 * Inspect Loan collection distribution (debug helper).
 * Run: node backend/scripts/inspect_loan_collection.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const Loan = require('../loans/model/Loan');

  const total = await Loan.countDocuments({});
  const byStatus = await Loan.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 50 },
  ]);
  const byType = await Loan.aggregate([
    { $group: { _id: '$requestType', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);

  console.log(JSON.stringify({ total, byStatus, byType }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

