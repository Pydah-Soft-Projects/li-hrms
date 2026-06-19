const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import Employee model
const Employee = require('../employees/model/Employee');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);

    // Get sample employees with employee numbers
    const employees = await Employee.find({})
      .select('employeeNumber firstName lastName')
      .limit(20)
      .lean();

    console.log('📊 Sample Employees:');
    employees.forEach(emp => {
      console.log(`  ${emp.employeeNumber} - ${emp.firstName} ${emp.lastName}`);
    });

    // Get total count
    const count = await Employee.countDocuments();
    console.log(`\n📈 Total employees in system: ${count}`);

    await mongoose.disconnect();

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
