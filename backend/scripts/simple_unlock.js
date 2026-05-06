require('dotenv').config();
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

/**
 * Minimal script to unlock all attendance records.
 * This clears the 'locked' and 'isEdited' flags and removes the 'manual' source tag.
 * This allows the records to be edited again and permits the biometric sync to update them.
 */
async function unlockAll() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to Database. Unlocking records...');

    const result = await AttendanceDaily.updateMany(
      { 
        $or: [
          { locked: true }, 
          { isEdited: true }, 
          { source: 'manual' }
        ] 
      },
      { 
        $set: { locked: false, isEdited: false },
        $pull: { source: 'manual' }
      }
    );

    console.log('--------------------------------------------------');
    console.log(`Unlocking Complete!`);
    console.log(`Records Matched:  ${result.matchedCount}`);
    console.log(`Records Modified: ${result.modifiedCount}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('An error occurred during the unlock process:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from Database.');
  }
}

unlockAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
