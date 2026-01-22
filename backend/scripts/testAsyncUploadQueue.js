require('dotenv').config();
const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');
const Employee = require('../employees/model/Employee');
const dayjs = require('dayjs');

async function testAsyncFlow() {
    try {
        console.log('🚀 Starting Full Async Flow Benchmark...');

        // Connect to MongoDB to get real employees
        await mongoose.connect(process.env.MONGODB_URI);
        const employees = await Employee.find({ is_active: true }).limit(500).select('emp_no');
        if (employees.length === 0) {
            console.error('❌ No active employees found.');
            await mongoose.connection.close();
            return;
        }
        console.log(`👥 Found ${employees.length} employees.`);

        // Generate 10,000 logs (20 logs per employee across 10 days)
        const mockLogs = [];
        const baseDate = dayjs().subtract(15, 'day').startOf('day');

        employees.forEach((emp) => {
            for (let day = 0; day < 10; day++) {
                const date = baseDate.add(day, 'day');
                mockLogs.push({
                    'Employee Number': emp.emp_no,
                    'In-Time': date.hour(9).minute(Math.floor(Math.random() * 30)).format('YYYY-MM-DD HH:mm:ss'),
                    'Out-Time': date.hour(18).minute(Math.floor(Math.random() * 30)).format('YYYY-MM-DD HH:mm:ss')
                });
            }
        });

        console.log(`📊 Generated ${mockLogs.length} logs for Excel simulation.`);

        // Create Excel buffer (simulating XLSX.write result)
        const XLSX = require('xlsx');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(mockLogs);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
        const buffer = XLSX.write(workbook, { type: 'buffer' });

        // Queue the job
        const attendanceUploadQueue = new Queue('attendanceUploadQueue', { connection: redisConfig });

        console.log('📤 Adding job to BullMQ queue...');
        const job = await attendanceUploadQueue.add('processAttendanceUpload', {
            fileBuffer: buffer.toString('base64'),
            userId: '65a0b1234567890abcdef123', // Mock user ID
            userName: 'Benchmark Runner',
            originalName: 'benchmark_10k_real_data.xlsx',
            rowCount: mockLogs.length
        });

        console.log(`✅ Job ${job.id} added successfully!`);
        console.log('👉 Monitor the backend console (npm run dev) to see processing progress and completion notification.');

    } catch (error) {
        console.error('❌ Async flow test failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

testAsyncFlow();
