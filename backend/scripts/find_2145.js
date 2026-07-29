const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
    console.log('🔄 Connecting to MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 1. Search Employee by emp_no
    console.log('\n🔍 Searching Employee by emp_no = "2145" or "EMP2145"...');
    let emp = await Employee.findOne({ emp_no: { $in: ['2145', 'EMP2145'] } }).lean();
    if (!emp) {
      // Try regular expression
      emp = await Employee.findOne({ emp_no: /2145/ }).lean();
    }

    if (emp) {
      console.log('✅ Found Employee:', JSON.stringify(emp, null, 2));
    } else {
      console.log('❌ Employee with 2145 not found.');
    }

    // 2. Search User by email, employeeId, name, username
    console.log('\n🔍 Searching User for "2145"...');
    let user = await User.findOne({ 
      $or: [
        { employeeId: '2145' },
        { employeeId: 'EMP2145' },
        { email: /2145/ },
        { name: /2145/ }
      ]
    }).lean();

    if (user) {
      console.log('✅ Found User:', JSON.stringify(user, null, 2));
    } else {
      console.log('❌ User with 2145 not found.');
    }

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();
