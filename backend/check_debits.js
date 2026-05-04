const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  // Find any year doc that has a DEBIT transaction with a non-APPROVED status
  const cursor = await db.collection('leave_register_years').find({
    'months.transactions': { 
      $elemMatch: { 
        transactionType: 'DEBIT', 
        status: { $nin: ['APPROVED', 'approved'] } 
      } 
    }
  });

  const docs = await cursor.toArray();
  if (docs.length > 0) {
    console.log(`Found ${docs.length} docs with non-APPROVED DEBITs`);
    // Print the statuses of these DEBITs
    const statuses = new Set();
    docs.forEach(d => {
      d.months.forEach(m => {
        if(m.transactions) {
          m.transactions.forEach(t => {
            if (t.transactionType === 'DEBIT') {
              statuses.add(t.status);
            }
          });
        }
      });
    });
    console.log('Statuses found:', Array.from(statuses));
  } else {
    console.log('None found.');
  }

  process.exit(0);
}

run().catch(console.error);
