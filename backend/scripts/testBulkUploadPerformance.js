require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const { processAndAggregateLogs } = require('../attendance/services/attendanceSyncService');
const { batchDetectExtraHours } = require('../attendance/services/extraHoursService');

async function runBenchmark() {
    try {
        console.log('🚀 Starting Performance Benchmark...');

        // Connect to DB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const rowCount = 10000;
        console.log(`📊 Generating ${rowCount} mock rows...`);

        const mockData = [];
        const baseDate = new Date('2024-01-01');

        for (let i = 0; i < rowCount; i++) {
            const empNo = `EMP${1000 + (i % 500)}`; // 500 unique employees
            const dateOffset = Math.floor(i / 1000); // spread across 10 days
            const timestamp = new Date(baseDate.getTime() + (dateOffset * 24 * 60 * 60 * 1000) + (i % 1000) * 60 * 1000);

            mockData.push({
                employeeNumber: empNo,
                timestamp: timestamp,
                type: i % 2 === 0 ? 'IN' : 'OUT',
                source: 'test_benchmark',
                date: timestamp.toISOString().split('T')[0]
            });
        }

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
        const stats = await processAndAggregateLogs(mockData, false);
        const endAgg = Date.now();
        console.log(`⏱️ Aggregation took: ${(endAgg - startAgg) / 1000}s`);
        console.log('📊 Stats:', stats);

        console.log('⌛ Starting Extra Hours Detection...');
        const startExtra = Date.now();
        const sortedDates = [...new Set(mockData.map(l => l.date))].sort();
        await batchDetectExtraHours(sortedDates[0], sortedDates[sortedDates.length - 1]);
        const endExtra = Date.now();
        console.log(`⏱️ Extra hours detection took: ${(endExtra - startExtra) / 1000}s`);

        const totalTime = (Date.now() - startInsert) / 1000;
        console.log(`\n✅ Benchmark Complete! Total processing time for ${rowCount} logs: ${totalTime}s`);

    } catch (error) {
        console.error('❌ Benchmark failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

runBenchmark();
