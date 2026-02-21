require('dotenv').config();
const mongoose = require('mongoose');
const DeviceUser = require('../models/DeviceUser');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';

const DEPARTMENTS = ['Unassigned'];
const DIVISIONS = ['Unassigned'];

async function repairRealData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find users with empty department
    const usersToFix = await DeviceUser.find({
      $or: [
        { department: { $exists: false } },
        { department: '' },
        { department: null }
      ]
    });

    console.log(`Found ${usersToFix.length} users with missing Department/Division.`);

    let updatedCount = 0;
    for (const user of usersToFix) {
      // Assign default "Unassigned" or "General"
      // Or random if you want to test variety
      user.department = 'General';
      user.division = 'Main';

      await user.save();
      updatedCount++;
      process.stdout.write(`\rFixed user: ${user.userId} (${user.name})`);
    }

    console.log(`\nSuccessfully repaired ${updatedCount} users.`);

  } catch (error) {
    console.error('Error repairing data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  }
}

repairRealData();
