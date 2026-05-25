require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Employee = mongoose.connection.collection('employees');
  const PreScheduledShift = mongoose.connection.collection('prescheduledshifts');
  const divId = new mongoose.Types.ObjectId('6992f9254fb69ffde98364bc');
  const deptId = new mongoose.Types.ObjectId('69942f884fb69ffde98cb68a');

  const byDiv = await Employee.countDocuments({ is_active: { $ne: false }, division_id: divId });
  const byDept = await Employee.countDocuments({ is_active: { $ne: false }, department_id: deptId });
  const byDeptStr = await Employee.countDocuments({ is_active: { $ne: false }, department_id: deptId.toString() });
  console.log('active by division_id (ObjectId):', byDiv);
  console.log('active by department_id (ObjectId):', byDept);
  console.log('active by department_id (string):', byDeptStr);

  const sample = await Employee.find({ is_active: { $ne: false }, department_id: deptId }).limit(5).toArray();
  console.log('sample dept match:', sample.map((e) => ({
    emp: e.emp_no,
    division_id: e.division_id,
    department_id: e.department_id,
    types: [typeof e.division_id, typeof e.department_id],
  })));

  const holNotes = await PreScheduledShift.countDocuments({
    date: '2026-05-28',
    status: 'HOL',
    notes: /Ravi Buraga/i,
  });
  const holAll = await PreScheduledShift.countDocuments({ date: '2026-05-28', status: 'HOL' });
  const holNoNotes = await PreScheduledShift.countDocuments({
    date: '2026-05-28',
    status: 'HOL',
    notes: { $exists: false },
  });
  const sampleHol = await PreScheduledShift.find({ date: '2026-05-28', status: 'HOL' }).limit(3).toArray();
  console.log('HOL with Ravi Buraga notes:', holNotes, 'total HOL:', holAll, 'no notes:', holNoNotes);
  console.log('sample HOL rows:', sampleHol.map((r) => ({ emp: r.employeeNumber, notes: r.notes })));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
