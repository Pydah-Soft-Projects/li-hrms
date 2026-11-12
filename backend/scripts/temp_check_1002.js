const mongoose = require('mongoose');
require('dotenv').config({ path: 'backend/.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Dept = mongoose.connection.collection('departments');
    const dept = await Dept.findOne({ _id: new mongoose.Types.ObjectId('697f5d359644dbc8eeee5880') });
    console.log('Department:', dept ? dept.name : null);

    const Desig = mongoose.connection.collection('designations');
    const desig = await Desig.findOne({ _id: new mongoose.Types.ObjectId('697f5dca9644dbc8eeee58e9') });
    console.log('Designation:', desig ? desig.name : null);

    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
  }
})();
