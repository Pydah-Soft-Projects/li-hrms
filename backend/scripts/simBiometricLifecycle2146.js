/**
 * Simulate LWD+1 offboard + rejoin onboard for emp 2146 via HRMS lifecycle service.
 * Restores employee HR fields afterward. Device commands are real (queued to biometric).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const {
  runBiometricDeviceOffboard,
  runBiometricDeviceOnboard,
} = require('../attendance/services/biometricDeviceLifecycleService');

const EMP = '2146';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const emp = await Employee.findOne({ emp_no: EMP });
  if (!emp) {
    console.log('Employee not found');
    process.exit(1);
  }

  const original = {
    is_active: emp.is_active,
    leftDate: emp.leftDate,
    leftReason: emp.leftReason,
    biometricOffboardedAt: emp.biometricOffboardedAt,
    biometricOffboardDeviceIds: [...(emp.biometricOffboardDeviceIds || [])],
  };
  console.log('HRMS BEFORE:', JSON.stringify({
    emp_no: emp.emp_no,
    name: emp.employee_name,
    ...original,
  }, null, 2));

  // Pretend LWD was yesterday so offboard is allowed
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  emp.leftDate = yesterday;
  emp.leftReason = 'SIMULATION resign/terminate LWD+1';
  emp.biometricOffboardedAt = null;
  emp.biometricOffboardDeviceIds = [];
  await emp.save();
  console.log('\nSet leftDate to yesterday for simulation.');

  console.log('\n>>> HRMS offboard (LWD+1 path)');
  const off = await runBiometricDeviceOffboard(EMP, { force: true });
  console.log(JSON.stringify(off, null, 2));

  const mid = await Employee.findOne({ emp_no: EMP }).lean();
  console.log('\nHRMS AFTER OFFBOARD:', JSON.stringify({
    biometricOffboardedAt: mid.biometricOffboardedAt,
    biometricOffboardDeviceIds: mid.biometricOffboardDeviceIds,
    leftDate: mid.leftDate,
  }, null, 2));

  console.log('\n>>> HRMS onboard (rejoin path)');
  // Clear left like rejoin verify would
  await Employee.updateOne(
    { emp_no: EMP },
    { $set: { leftDate: null, leftReason: null, is_active: true } }
  );
  const on = await runBiometricDeviceOnboard(EMP);
  console.log(JSON.stringify(on, null, 2));

  // Restore original HR flags (do not leave sim leftDate on employee)
  await Employee.updateOne(
    { emp_no: EMP },
    {
      $set: {
        is_active: original.is_active,
        leftDate: original.leftDate,
        leftReason: original.leftReason,
        biometricOffboardedAt: original.biometricOffboardedAt,
        biometricOffboardDeviceIds: original.biometricOffboardDeviceIds,
      },
    }
  );

  const fin = await Employee.findOne({ emp_no: EMP }).lean();
  console.log('\nHRMS RESTORED:', JSON.stringify({
    is_active: fin.is_active,
    leftDate: fin.leftDate,
    leftReason: fin.leftReason,
    biometricOffboardedAt: fin.biometricOffboardedAt,
    biometricOffboardDeviceIds: fin.biometricOffboardDeviceIds,
  }, null, 2));

  await mongoose.disconnect();
  console.log('\nDone.');
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
