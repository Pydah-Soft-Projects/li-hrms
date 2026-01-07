const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

// Minimal Model
const employeeSchema = new mongoose.Schema({
  emp_no: String,
  is_active: Boolean
});
const Employee = mongoose.model('Employee', employeeSchema);

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const empNos = ['EMP0147', 'EMP0148'];
    
    for (const empNo of empNos) {
      console.log(`\nChecking ${empNo}...`);
      const e = await Employee.findOne({ emp_no: empNo });
      if (e) {
        console.log('Found:', JSON.stringify(e, null, 2));
      } else {
        console.log('NOT FOUND by exact emp_no');
        // Try case-insensitive or partial
        const partial = await Employee.findOne({ emp_no: new RegExp(empNo, 'i') });
        if (partial) {
          console.log('Found by Case-Insensitive:', JSON.stringify(partial, null, 2));
        } else {
          console.log('Searching all employees...');
          const all = await Employee.find({}).limit(5);
          console.log('Sample employees in DB:', all.map(a => a.emp_no));
        }
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
