require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

async function testPayRegister() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const Employee = require('../employees/model/Employee');
        const { manualSyncPayRegister } = require('../pay-register/services/autoSyncService');

        const empNo = '272';
        const month = '2026-02';

        const employee = await Employee.findOne({ emp_no: empNo });
        if (!employee) return;

        // Force recalculate Monthly Summary to ensure baseline is fresh
        const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
        const [year, monthNum] = month.split('-').map(Number);
        const monthlySummary = await calculateMonthlySummary(employee._id, empNo, year, monthNum);

        // Sync Pay Register
        const payRegister = await manualSyncPayRegister(employee._id, month);

        const result = {
            monthlySummary: {
                present: monthlySummary.totalPresentDays,
                paidLeaves: monthlySummary.totalLeaves,
                ods: monthlySummary.totalODs,
                lates: monthlySummary.lateInCount,
                earlyOuts: monthlySummary.earlyOutCount,
                payableShifts: monthlySummary.totalPayableShifts
            },
            payRegister: {
                present: payRegister.totals.totalPresentDays,
                paidLeaves: payRegister.totals.totalPaidLeaveDays,
                ods: payRegister.totals.totalODDays,
                lates: payRegister.totals.lateCount,
                earlyOuts: payRegister.totals.earlyOutCount,
                payableShifts: payRegister.totals.totalPayableShifts
            },
            dailyRecords: payRegister.dailyRecords.map(r => ({
                date: r.date,
                s1: r.firstHalf.status,
                s2: r.secondHalf.status,
                od1: r.firstHalf.isOD,
                od2: r.secondHalf.isOD,
                isLate: r.isLate,
                isEarlyOut: r.isEarlyOut,
                payableShifts: r.payableShifts
            }))
        };

        fs.writeFileSync('pay_register_output.json', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

testPayRegister();
