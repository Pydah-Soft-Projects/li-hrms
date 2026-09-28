const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('./notifications/model/Notification');
const User = require('./users/model/User');
const Employee = require('./employees/model/Employee');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const user = await User.findOne({ email: '2145@pydah.edu.in' }).lean();
  console.log('User 2145:', { user_id: user._id, employeeRef: user.employeeRef });

  const notifsByUser = await Notification.find({ recipientUserId: user._id }).lean();
  const notifsByEmp = await Notification.find({ recipientUserId: user.employeeRef }).lean();

  console.log(`Notifications by User ID (${user._id}):`, notifsByUser.length);
  console.log(`Notifications by Employee ID (${user.employeeRef}):`, notifsByEmp.length);

  const allNotifs = await Notification.find({ recipientUserId: { $in: [user._id, user.employeeRef] } }).lean();
  console.log(`Total Combined Notifications for Penkey Teja:`, allNotifs.length);
  if (allNotifs.length > 0) {
    console.log('Sample Notification:', allNotifs[0]);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
