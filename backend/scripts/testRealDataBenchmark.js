require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Employee = require('../employees/model/Employee');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const { processAndAggregateLogs } = require('../attendance/services/attendanceSyncService');
const { batchDetectExtraHours } = require('../attendance/services/extraHoursService');
const dayjs = require('dayjs');

async function runRealDataBenchmark() {
    try {
        console.log('🚀 Starting Real Data Performance Benchmark...');

        // Connect to DB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Fetch real employees
        const employees = await Employee.find({ is_active: true }).limit(1000).select('emp_no');
        if (employees.length === 0) {
            console.error('❌ No active employees found in database. Cannot run benchmark.');
            return;
        }
        console.log(`👥 Found ${employees.length} real employees to use for mock logs.`);

        const rowCountPerEmployee = 20; // 10 days of IN/OUT
        const mockData = [];
        const baseDate = dayjs().subtract(10, 'day').startOf('day');

        employees.forEach((emp, index) => {
            for (let day = 0; day < 10; day++) {
                const date = baseDate.add(day, 'day');

                // IN
                const inTime = date.hour(9).minute(Math.floor(Math.random() * 30));
                mockData.push({
                    employeeNumber: emp.emp_no,
                    timestamp: inTime.toDate(),
                    type: 'IN',
                    source: 'test_real_benchmark',
                    date: date.format('YYYY-MM-DD')
                });

                // OUT
                const outTime = date.hour(18).minute(Math.floor(Math.random() * 30));
                mockData.push({
                    employeeNumber: emp.emp_no,
                    timestamp: outTime.toDate(),
                    type: 'OUT',
                    source: 'test_real_benchmark',
                    date: date.format('YYYY-MM-DD')
                });
            }
        });

        console.log(`📊 Generated ${mockData.length} mock logs for ${employees.length} employees.`);

        console.log('⚡ Starting Bulk Insertion (bulkWrite)...');
        const startInsert = Date.now();

        const bulkOps = mockData.map(log => ({
            updateOne: {
                filter: { employeeNumber: log.employeeNumber, timestamp: log.timestamp, type: log.type },
                update: { $setOnInsert: log },
                upsert: true
            }
        }));

        await AttendanceRawLog.bulkWrite(bulkOps, { ordered: false });
        const endInsert = Date.now();
        console.log(`⏱️ Bulk insertion took: ${(endInsert - startInsert) / 1000}s`);

        console.log('🔄 Starting Aggregation (processAndAggregateLogs)...');
        const startAgg = Date.now();
        // Set silent = true to avoid massive console logs
        const stats = await processAndAggregateLogs(mockData, false);
        const endAgg = Date.now();
        console.log(`⏱️ Aggregation took: ${(endAgg - startAgg) / 1000}s`);

        console.log('⌛ Starting Extra Hours Detection...');
        const startExtra = Date.now();
        const sortedDates = [...new Set(mockData.map(l => l.date))].sort();
        await batchDetectExtraHours(sortedDates[0], sortedDates[sortedDates.length - 1]);
        const endExtra = Date.now();
        console.log(`⏱️ Extra hours detection took: ${(endExtra - startExtra) / 1000}s`);

        const totalTime = (Date.now() - startInsert) / 1000;
        console.log(`\n✅ Real Data Benchmark Complete!`);
        console.log(`📈 Stats: ${mockData.length} logs / ${employees.length} employees`);
        console.log(`⏱️ Total Time: ${totalTime}s`);

    } catch (error) {
        console.error('❌ Benchmark failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

runRealDataBenchmark();
