const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import Employee model
const Employee = require('../employees/model/Employee');

(async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if employee 2146 exists
    console.log('\n🔄 Checking for employee 2146...');
    
    const employee = await Employee.findOne({
      employeeNumber: '2146'
    }).lean();

    console.log('\n📊 Employee Found:');
    if (employee) {
      console.log(JSON.stringify({
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        status: employee.status,
        _id: employee._id
      }, null, 2));
    } else {
      console.log('❌ Employee 2146 not found in the system');
      
      // Show some existing employees
      console.log('\n📊 Sample employees in the system:');
      const samples = await Employee.find({}).select('employeeNumber firstName lastName').limit(10).lean();
      console.log(JSON.stringify(samples, null, 2));
    }

    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
