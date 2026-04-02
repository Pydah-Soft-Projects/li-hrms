const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Force register all models
require('./employees/model/Designation');
require('./departments/model/Department');
require('./divisions/model/Division');
require('./employees/model/Employee');
require('./arrears/model/ArrearsRequest');
require('./manual-deductions/model/DeductionRequest');
require('./payroll/model/SecondSalaryRecord');

const SecondSalaryService = require('./payroll/services/secondSalaryCalculationService');
const Employee = mongoose.model('Employee');
const ArrearsRequest = mongoose.model('ArrearsRequest');
const DeductionRequest = mongoose.model('DeductionRequest');
const SecondSalaryRecord = mongoose.model('SecondSalaryRecord');

async function verifyBulkFix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find an employee with second salary
        const employee = await Employee.findOne({ second_salary: { $gt: 0 }, is_active: true });
        if (!employee) {
            console.error('No employee with second salary found in DB!');
            process.exit(1);
        }
        console.log(`Testing with employee: ${employee.emp_no} (${employee.employee_name})`);

        const month = '2026-03';
        const userId = employee._id;

        // 2. Ensure they have pending arrears (status 'approved')
        let arrear = await ArrearsRequest.findOne({ employee: employee._id, status: 'approved' });
        if (!arrear) {
            console.log('Creating mock approved arrear...');
            arrear = await ArrearsRequest.create({
                type: 'direct',
                employee: employee._id,
                totalAmount: 5000,
                remainingAmount: 5000,
                status: 'approved',
                reason: 'Verification Test',
                createdBy: userId
            });
        }
        console.log(`Pending Arrear found: ID ${arrear._id}, Amount: ${arrear.remainingAmount}`);

        // 3. Ensure they have pending manual deductions (status 'approved')
        let deduction = await DeductionRequest.findOne({ employee: employee._id, status: 'approved' });
        if (!deduction) {
            console.log('Creating mock approved manual deduction...');
            deduction = await DeductionRequest.create({
                type: 'direct',
                employee: employee._id,
                totalAmount: 1500,
                remainingAmount: 1500,
                status: 'approved',
                reason: 'Verification Deduction',
                createdBy: userId
            });
        }
        console.log(`Pending Deduction found: ID ${deduction._id}, Amount: ${deduction.remainingAmount}`);

        // 4. Run Second Salary Calculation with bulk flags (auto-fetch)
        console.log('\nRunning Second Salary Calculation (Simulating Bulk)...');
        // Clear previous record to ensure fresh calculation
        await SecondSalaryRecord.deleteOne({ employeeId: employee._id, month });

        const result = await SecondSalaryService.calculateSecondSalary(employee._id, month, userId, {
            arrearsSettlements: [],
            deductionSettlements: []
        });

        // 5. Verify the persisted record
        const record = await SecondSalaryRecord.findOne({ employeeId: employee._id, month });
        if (!record) throw new Error('SecondSalaryRecord not created');

        console.log('\n--- Verification Results ---');
        console.log(`Arrears Amount in Record: ${record.arrearsAmount}`);
        console.log(`Manual Deductions Amount in Record: ${record.manualDeductionsAmount}`);
        console.log(`Arrears Settlements Attached: ${record.arrearsSettlements?.length || 0}`);
        console.log(`Deduction Settlements Attached: ${record.deductionSettlements?.length || 0}`);
        console.log(`Final Net Salary: ${record.netSalary}`);

        if (record.arrearsAmount > 0 && record.manualDeductionsAmount > 0) {
            console.log('\n✅ SUCCESS: Arrears and Deductions are correctly picked up and persisted!');
        } else {
            console.log('\n❌ FAILURE: Arrears or Deductions are still 0.');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyBulkFix();
