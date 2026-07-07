const mongoose = require('mongoose');
const readline = require('readline');
const Employee = require('../employees/model/Employee');
const ResignationRequest = require('../resignations/model/ResignationRequest');

const targetEmployees = [
  { emp_no: '2170', name: 'Nakka Govindu' },
  { emp_no: '2239', name: 'G.V. Manikanta' },
  { emp_no: '2270', name: 'M. Vegeswara Rao' },
  { emp_no: '1737', name: 'Ch.S. Chandra Rajesh' },
];

function askQuestion(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';

  console.log(`Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to MongoDB host: ${mongoose.connection.host}`);
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);

  console.log('\nEmployee and resignation details to review:');
  for (const target of targetEmployees) {
    const empNo = String(target.emp_no).toUpperCase();
    const employee = await Employee.findOne({ emp_no: empNo }).lean();
    const resignationRequests = await ResignationRequest.find({ emp_no: empNo }).lean();

    console.log(`\n- ${target.emp_no} (${target.name})`);
    if (employee) {
      console.log(`  Employee: is_active=${employee.is_active}, leftDate=${employee.leftDate ? new Date(employee.leftDate).toISOString().split('T')[0] : 'null'}, leftReason=${employee.leftReason || 'null'}`);
    } else {
      console.log('  Employee: not found');
    }

    if (resignationRequests.length > 0) {
      console.log('  Resignations:');
      resignationRequests.forEach((req) => {
        console.log(`    * status=${req.status}, requestType=${req.requestType || 'resignation'}, leftDate=${req.leftDate ? new Date(req.leftDate).toISOString().split('T')[0] : 'null'}`);
      });
    } else {
      console.log('  Resignations: none found');
    }
  }

  const confirmation = await askQuestion('\nDo you want to proceed with these changes? Type YES to continue: ');
  if (confirmation !== 'yes') {
    console.log('Operation cancelled. No changes were made.');
    process.exit(0);
  }

  const summary = [];

  for (const target of targetEmployees) {
    const empNo = String(target.emp_no).toUpperCase();

    const employee = await Employee.findOne({ emp_no: empNo });
    if (!employee) {
      console.log(`[SKIP] ${target.name} (${empNo}) - employee not found`);
      summary.push({ emp_no: empNo, name: target.name, status: 'not_found' });
      continue;
    }

    const updates = {};
    let changed = false;

    if (employee.leftDate) {
      updates.leftDate = null;
      changed = true;
    }

    if (employee.leftReason) {
      updates.leftReason = null;
      changed = true;
    }

    if (employee.is_active === false) {
      updates.is_active = true;
      changed = true;
    }

    if (Object.keys(updates).length > 0) {
      await Employee.updateOne({ _id: employee._id }, { $set: updates });
    }

    const deletedResignationCount = await ResignationRequest.deleteMany({ emp_no: empNo }).then((result) => result.deletedCount || 0);

    console.log(`[DONE] ${target.name} (${empNo}) - employee cleared: ${changed ? 'yes' : 'no change'}, resignation requests removed: ${deletedResignationCount}`);
    summary.push({
      emp_no: empNo,
      name: target.name,
      status: 'updated',
      employeeCleared: changed,
      resignationsRemoved: deletedResignationCount,
    });
  }

  console.log('\nSummary:');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  console.log('\nScript completed.');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
