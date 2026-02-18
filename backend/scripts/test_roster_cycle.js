const mongoose = require('mongoose');
const { getRoster, saveRoster } = require('../shifts/controllers/preScheduledShiftController');
require('dotenv').config({ path: '../.env' });

// Mock Express Request/Response
const mockReq = (query = {}, body = {}, user = { _id: new mongoose.Types.ObjectId() }) => ({
    query,
    body,
    user,
    params: {}
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function testRosterCycle() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const month = '2024-05';
        const startDate = '2024-04-26';
        const endDate = '2024-05-25';

        // 1. Save an entry for April 26 (within the payroll cycle for May)
        console.log('\n--- TEST: Save roster entry for 2024-04-26 ---');
        const saveReq = mockReq({}, {
            month,
            startDate,
            endDate,
            entries: [
                {
                    employeeNumber: 'EMP001',
                    date: '2024-04-26',
                    status: 'WO'
                }
            ]
        });
        const saveRes = mockRes();
        await saveRoster(saveReq, saveRes);
        console.log('Save response:', saveRes.data?.message || saveRes.data);

        // 2. Fetch roster with custom date range
        console.log('\n--- TEST: Fetch roster with range:', startDate, 'to', endDate, '---');
        const req = mockReq({
            month,
            startDate,
            endDate,
            employeeNumber: 'EMP001'
        });
        const res = mockRes();
        await getRoster(req, res);

        if (res.data?.success) {
            const entries = res.data.data.entries;
            console.log('Roster fetched successfully. Entries count:', entries.length);

            const entry = entries.find(e => e.date === '2024-04-26');
            if (entry) {
                console.log('✅ PASS: Found expected entry for 2024-04-26:', entry);
            } else {
                console.error('❌ FAIL: Entry for 2024-04-26 NOT FOUND!');
            }

            const invalidDates = entries.filter(e => e.date < startDate || e.date > endDate);
            if (invalidDates.length > 0) {
                console.error('❌ FAIL: Found entries outside date range:', invalidDates.map(e => e.date));
            } else {
                console.log('✅ PASS: All entries are within the specified date range.');
            }
        } else {
            console.error('❌ FAIL: Failed to fetch roster:', res.data?.message);
        }

        // 3. Verify standard month range still works (no startDate/endDate)
        console.log('\n--- TEST: Standard month range (no custom dates) ---');
        const req2 = mockReq({ month });
        const res2 = mockRes();
        await getRoster(req2, res2);
        if (res2.data?.success) {
            console.log('✅ PASS: Standard month fetch works. Entries:', res2.data.data.entries.length);
        } else {
            console.error('❌ FAIL:', res2.data?.message);
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

testRosterCycle();
