const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    console.log(`🔄 Connecting to: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get the database
    const db = mongoose.connection.db;
    
    // List all collections
    console.log('📊 Collections in database:');
    const collections = await db.listCollections().toArray();
    collections.forEach((col, idx) => {
      console.log(`  ${idx + 1}. ${col.name}`);
    });

    // Check specific collections for employee 2146 logs
    console.log('\n🔄 Searching all collections for employeeId: 2146...\n');
    
    for (const col of collections) {
      const name = col.name;
      const count = await db.collection(name).countDocuments({ employeeId: '2146' });
      if (count > 0) {
        console.log(`✅ Found ${count} record(s) in "${name}"`);
        const sample = await db.collection(name).findOne({ employeeId: '2146' });
        console.log(`   Sample: ${JSON.stringify(sample, null, 2).split('\n').slice(0, 5).join('\n')}`);
        console.log();
      }
    }

    // Check for employeeNumber instead
    console.log('🔄 Searching all collections for employeeNumber: 2146...\n');
    
    for (const col of collections) {
      const name = col.name;
      const count = await db.collection(name).countDocuments({ employeeNumber: '2146' });
      if (count > 0) {
        console.log(`✅ Found ${count} record(s) in "${name}"`);
        const sample = await db.collection(name).findOne({ employeeNumber: '2146' });
        console.log(`   Sample: ${JSON.stringify(sample, null, 2).split('\n').slice(0, 10).join('\n')}`);
        console.log();
      }
    }

    // Check for logs on June 13th
    console.log('🔄 Searching for any logs on June 13th, 2026...\n');
    const june13 = {
      $gte: new Date('2026-06-13T00:00:00Z'),
      $lt: new Date('2026-06-14T00:00:00Z')
    };
    
    for (const col of collections) {
      const name = col.name;
      const count = await db.collection(name).countDocuments({ 
        timestamp: june13
      });
      if (count > 0) {
        console.log(`✅ Found ${count} record(s) with June 13 timestamp in "${name}"`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
