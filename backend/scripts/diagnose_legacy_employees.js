const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const total = await Employee.countDocuments();
        const approved = await Employee.countDocuments({ salaryStatus: 'approved' });
        const pending = await Employee.countDocuments({ salaryStatus: 'pending_approval' });
        const missing = await Employee.countDocuments({ salaryStatus: { $exists: false } });
        const nulls = await Employee.countDocuments({ salaryStatus: null });

        console.log(`DIAG_RESULT: Total=${total}, Approved=${approved}, Pending=${pending}, Missing=${missing}, Nulls=${nulls}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

diagnose();
