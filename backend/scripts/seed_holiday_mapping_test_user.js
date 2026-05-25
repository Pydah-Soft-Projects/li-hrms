/**
 * Creates/updates a user with holidayDivisionMapping only (no holiday groups).
 * Run: node scripts/seed_holiday_mapping_test_user.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const User = require('../users/model/User');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const { connectMongoDB, closeMongoDB } = require('../config/database');

const EMAIL = process.env.HOLIDAY_TEST_MAPPING_EMAIL || 'holiday-mapping-test@hrms.local';
const PASSWORD = process.env.HOLIDAY_TEST_MAPPING_PASSWORD || 'HolidayTest@123';

async function upsertUser(filter, data) {
    let user = await User.findOne(filter);
    if (user) {
        Object.assign(user, data);
        await user.save();
        return user;
    }
    return User.create({ ...filter, ...data });
}

(async () => {
    await connectMongoDB();

    const division = await Division.findOne({ is_active: { $ne: false } }).select('_id name').lean()
        || await Division.findOne().select('_id name').lean();
    if (!division) {
        console.error('No Division in DB. Create divisions first.');
        process.exit(1);
    }

    const dept = await Department.findOne({
        divisions: division._id,
        is_active: { $ne: false },
    }).select('_id name').lean();

    const holidayDivisionMapping = [
        {
            division: division._id,
            departments: dept ? [dept._id] : [],
            employeeGroups: [],
        },
    ];

    const baseFilter = (typeof Employee.getCurrentlyActiveFilter === 'function')
        ? Employee.getCurrentlyActiveFilter()
        : { is_active: { $ne: false } };
    const empFilter = dept
        ? { ...baseFilter, division_id: division._id, department_id: dept._id }
        : { ...baseFilter, division_id: division._id };
    const expectedCount = await Employee.countDocuments(empFilter);

    await upsertUser(
        { email: EMAIL },
        {
            email: EMAIL,
            password: PASSWORD,
            name: 'Holiday Mapping Scope Test',
            role: 'manager',
            roles: ['manager'],
            isActive: true,
            featureControl: ['HOLIDAY_CALENDAR:write'],
            managedHolidayGroupIds: [],
            holidayDivisionMapping,
        }
    );

    console.log('Mapping-scope test user ready:');
    console.log(`  Email: ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Division: ${division.name} (${division._id})`);
    if (dept) console.log(`  Department: ${dept.name} (${dept._id})`);
    console.log(`  Expected employees in scope (approx): ${expectedCount}`);

    await closeMongoDB();
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
