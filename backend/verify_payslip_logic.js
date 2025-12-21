const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const PayrollRecord = require('./payroll/model/PayrollRecord');
const Employee = require('./employees/model/Employee');
const Settings = require('./settings/model/Settings');
const { getPayrollRecords, getPayslip, downloadPayslip, releasePayslips } = require('./payroll/controllers/payrollController');

dotenv.config();

async function verifyPayslipLogic() {
    try {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Setup Test Data
        const testEmpNo = 'TEST_PAY_006';
        let employee = await Employee.findOne({ emp_no: testEmpNo });
        if (!employee) {
            employee = await Employee.create({
                emp_no: testEmpNo,
                employee_name: 'Test Payroll Employee 6',
                email: 'test_pay6@example.com'
            });
            console.log('Created test employee');
        }

        // Clear existing records for test
        await PayrollRecord.deleteMany({ employee_id: employee._id });

        // Create 3 months of payslips using getOrCreate static method
        const testMonths = [
            { year: 2024, month: 1 },
            { year: 2024, month: 2 },
            { year: 2024, month: 3 }
        ];

        for (const m of testMonths) {
            try {
                const record = await PayrollRecord.getOrCreate(employee._id, testEmpNo, m.year, m.month);
                record.netSalary = 50000;
                record.isReleased = false;
                record.downloadCount = 0;
                // Fix for attendance.totalDaysInMonth validation
                record.attendance = {
                    totalDaysInMonth: record.totalDaysInMonth || 30
                };
                await record.save();
            } catch (valErr) {
                if (valErr.name === 'ValidationError') {
                    console.error(`Validation Error for ${m.month}/${m.year}:`);
                    for (let field in valErr.errors) {
                        console.error(` - ${field}: ${valErr.errors[field].message}`);
                    }
                }
                throw valErr;
            }
        }
        console.log('Created 3 months of testing payslips');

        // 2. Test Release Logic
        console.log('\n--- Testing Release Logic ---');
        const mockRes = {
            status: function (code) { this.statusCode = code; return this; },
            json: function (data) { return data; }
        };

        // Release February 2024
        const releaseResult = await releasePayslips({ body: { month: 'February 2024' } }, mockRes);
        console.log('Release Result Success:', releaseResult.success);

        const febRecord = await PayrollRecord.findOne({ employee_id: employee._id, month: '2024-02' });
        console.log('February Released:', febRecord.isReleased);

        // 3. Test Access Logic (Role-based)
        console.log('\n--- Testing Access Logic ---');

        // Admin access
        const adminReq = { user: { role: 'super_admin' }, query: {} };
        const adminRecords = await getPayrollRecords(adminReq, mockRes);
        console.log('Admin saw records count:', adminRecords.count);

        // Employee access (Release Required = ON)
        await Settings.findOneAndUpdate({ key: 'payslip_release_required' }, { value: true }, { upsert: true });
        const empReq = { user: { role: 'employee', employeeRef: employee._id }, query: {} };
        const empRecords = await getPayrollRecords(empReq, mockRes);
        console.log('Employee (Release Required=ON) saw records:', empRecords.count);

        const visibleMonths = empRecords.data.map(r => r.month);
        console.log('Visible months to employee:', visibleMonths);
        // Should NOT contain 2024-01 or 2024-03, SHOULD contain 2024-02

        // 4. Test Download Limits
        console.log('\n--- Testing Download Limits ---');
        await Settings.findOneAndUpdate({ key: 'payslip_download_limit' }, { value: 2 }, { upsert: true });

        const downloadReq = { user: { role: 'employee', employeeRef: employee._id }, params: { employeeId: employee._id, month: '2024-02' } };
        const mockResBlob = {
            set: () => { },
            status: function (code) { this.statusCode = code; return this; },
            send: () => { },
            json: function (data) { return data; }
        };

        // Reset feb download count
        await PayrollRecord.findOneAndUpdate({ _id: febRecord._id }, { downloadCount: 0 });

        await downloadPayslip(downloadReq, mockResBlob); // 1
        await downloadPayslip(downloadReq, mockResBlob); // 2

        const febAfter2 = await PayrollRecord.findById(febRecord._id);
        console.log('Current download count:', febAfter2.downloadCount);

        // 3rd download should fail
        const download3 = await downloadPayslip(downloadReq, mockRes);
        console.log('Download 3 result message:', download3.message);

        // Cleanup
        await PayrollRecord.deleteMany({ employee_id: employee._id });
        await Employee.deleteOne({ _id: employee._id });
        console.log('\nVerification complete & cleanup done!');

    } catch (error) {
        if (error.name !== 'ValidationError') {
            console.error('Verification failed:', error);
            console.error(error.stack);
        }
    } finally {
        await mongoose.connection.close();
    }
}

verifyPayslipLogic();
