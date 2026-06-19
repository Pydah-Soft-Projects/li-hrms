const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Find employee with exact match
    console.log('🔄 Testing exact match: emp_no = "2146"');
    const emp1 = await Employee.findOne({ emp_no: '2146' }).lean();
    console.log('Result:', emp1 ? `Found: ${emp1.emp_no}` : 'NOT FOUND');

    // Step 2: Find with uppercase
    console.log('\n🔄 Testing uppercase match: emp_no = "2146".toUpperCase()');
    const emp2 = await Employee.findOne({ emp_no: '2146'.toUpperCase() }).lean();
    console.log('Result:', emp2 ? `Found: ${emp2.emp_no}` : 'NOT FOUND');

    // Step 3: Find with $in operator
    console.log('\n🔄 Testing $in operator: emp_no: { $in: ["2146"] }');
    const emps1 = await Employee.find({ emp_no: { $in: ['2146'] } }).lean();
    console.log(`Result: Found ${emps1.length} employee(s)`);
    emps1.forEach(e => console.log(`  - ${e.emp_no}`));

    // Step 4: Find all and filter
    console.log('\n🔄 Getting first 20 employees:');
    const all = await Employee.find({}).select('emp_no employee_name').limit(20).lean();
    all.forEach(e => console.log(`  - ${e.emp_no}: ${e.employee_name}`));

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
