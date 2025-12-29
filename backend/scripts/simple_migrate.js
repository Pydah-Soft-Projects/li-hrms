
const mongoose = require('mongoose');
require('dotenv').config();

const DRY_RUN = false;

const designationSchema = new mongoose.Schema({
    name: String,
    department: mongoose.Schema.Types.ObjectId
}, { strict: false });

const departmentSchema = new mongoose.Schema({
    name: String,
    designations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }]
}, { strict: false });

const Designation = mongoose.model('Designation', designationSchema);
const Department = mongoose.model('Department', departmentSchema);

async function migrate() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const departments = await Department.find({});
        console.log(`Found ${departments.length} departments.`);

        for (const dept of departments) {
            console.log(`Processing ${dept.name} (${dept._id})...`);
            const designations = await Designation.find({ department: dept._id });
            console.log(`  Found ${designations.length} linked designations.`);

            if (designations.length > 0) {
                const ids = designations.map(d => d._id);
                if (!DRY_RUN) {
                    await Department.findByIdAndUpdate(dept._id, {
                        $addToSet: { designations: { $each: ids } }
                    });
                    console.log('  Updated department designations.');
                } else {
                    console.log('  [DRY RUN] Would update department.');
                }
            }
        }

        // Also populate links from existing Employee data if available?
        // The previous script did that. Let's stick to basics first.
        // If strict: false allows looking up by department field which exists in DB, we are good.

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

migrate();
