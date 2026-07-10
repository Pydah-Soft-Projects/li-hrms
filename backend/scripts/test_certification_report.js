require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
require('../departments/model/Division');
require('../departments/model/Department');
require('../departments/model/Designation');
const { buildCertificationReport } = require('../employees/services/certificationReportService');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ravi';
  await mongoose.connect(uri);
  const total = await Employee.countDocuments({});
  const active = await Employee.countDocuments({ is_active: { $ne: false } });
  console.log('DB employees total:', total, 'active:', active);

  const report = await buildCertificationReport({}, { page: 1, limit: 25, includeLeft: 'false' });
  console.log('report stats:', report.stats);
  console.log('report total rows:', report.total);
  console.log('sample rows:', JSON.stringify(report.rows.slice(0, 2), null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
