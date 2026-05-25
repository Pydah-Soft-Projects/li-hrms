require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const H = mongoose.connection.collection('holidays');
  const User = mongoose.connection.collection('users');

  const byName = await H.find({ name: /asdfsadfsa/i }).toArray();
  console.log('asdfsadfsa holidays:', byName.length);
  for (const x of byName) {
    console.log(JSON.stringify({
      _id: x._id,
      name: x.name,
      date: x.date,
      scope: x.scope,
      applicableTo: x.applicableTo,
      isActive: x.isActive,
      divisionMapping: x.divisionMapping,
      createdBy: x.createdBy,
    }, null, 2));
    if (x.createdBy) {
      const u = await User.findOne({ _id: x.createdBy });
      console.log('creator:', u?.name, u?.email, u?.role);
      console.log('creator holidayDivisionMapping:', JSON.stringify(u?.holidayDivisionMapping));
    }
  }

  const may28 = await H.find({
    date: new Date('2026-05-28T00:00:00.000Z'),
  }).toArray();
  console.log('\nAll holidays on 2026-05-28 (any active state):', may28.length);
  for (const x of may28) {
    console.log('-', x.name, 'active:', x.isActive, 'scope:', x.scope);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
