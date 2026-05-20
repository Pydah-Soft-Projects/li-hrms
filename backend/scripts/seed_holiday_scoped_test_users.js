/**
 * Creates/updates users for holiday scoped-access API testing.
 * Run once: node scripts/seed_holiday_scoped_test_users.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const User = require('../users/model/User');
const HolidayGroup = require('../holidays/model/HolidayGroup');
const { connectMongoDB, closeMongoDB } = require('../config/database');

const SCOPED_EMAIL = process.env.HOLIDAY_TEST_SCOPED_EMAIL || 'holiday-scoped-test@hrms.local';
const SCOPED_PASSWORD = process.env.HOLIDAY_TEST_SCOPED_PASSWORD || 'HolidayTest@123';
const GLOBAL_EMAIL = process.env.HOLIDAY_TEST_GLOBAL_EMAIL || 'holiday-global-test@hrms.local';
const GLOBAL_PASSWORD = process.env.HOLIDAY_TEST_GLOBAL_PASSWORD || 'HolidayTest@123';

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
    const group = await HolidayGroup.findOne({ isActive: true }).select('_id name');
    if (!group) {
        console.error('No active HolidayGroup in DB. Create at least one in Superadmin → Holidays.');
        process.exit(1);
    }

    const groupIds = [group._id];
    const second = await HolidayGroup.findOne({ isActive: true, _id: { $ne: group._id } }).select('_id');
    if (second) groupIds.push(second._id);

    await upsertUser(
        { email: SCOPED_EMAIL },
        {
            email: SCOPED_EMAIL,
            password: SCOPED_PASSWORD,
            name: 'Holiday Scoped Test User',
            role: 'manager',
            roles: ['manager'],
            isActive: true,
            featureControl: ['HOLIDAY_CALENDAR:write'],
            managedHolidayGroupIds: groupIds.slice(0, 1),
        }
    );

    await upsertUser(
        { email: GLOBAL_EMAIL },
        {
            email: GLOBAL_EMAIL,
            password: GLOBAL_PASSWORD,
            name: 'Holiday Global Test User',
            role: 'manager',
            roles: ['manager'],
            isActive: true,
            featureControl: ['HOLIDAY_CALENDAR:write', 'HOLIDAY_CALENDAR_MANAGE_GLOBAL:write'],
            managedHolidayGroupIds: groupIds,
        }
    );

    console.log('Test users ready:');
    console.log(`  Scoped: ${SCOPED_EMAIL} / ${SCOPED_PASSWORD}`);
    console.log(`  Global: ${GLOBAL_EMAIL} / ${GLOBAL_PASSWORD}`);
    console.log(`  Assigned group: ${group.name} (${group._id})`);

    await closeMongoDB();
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
