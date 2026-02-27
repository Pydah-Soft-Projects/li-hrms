/**
 * Test script: verify annual CL reset date logic (payroll vs fixed).
 * Run from backend: node scripts/test_annual_cl_reset_date.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { extractISTComponents } = require('../shared/utils/dateUtils');

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms');
        const dateCycleService = require('../leaves/services/dateCycleService');
        const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
        const { getResetDate, getNextResetDate } = require('../leaves/services/annualCLResetService');

        const settings = await LeavePolicySettings.getSettings();
        const payroll = await dateCycleService.getPayrollCycleSettings();
        console.log('Current leave policy annualCLReset:', {
            enabled: settings.annualCLReset?.enabled,
            usePayrollCycleForReset: settings.annualCLReset?.usePayrollCycleForReset,
            resetMonth: settings.annualCLReset?.resetMonth,
            resetDay: settings.annualCLReset?.resetDay,
        });
        console.log('Payroll cycle:', payroll);

        // Test 1: Reset date for year 2026 with payroll
        const withPayroll = { annualCLReset: { ...settings.annualCLReset.toObject?.() || settings.annualCLReset, usePayrollCycleForReset: true } };
        const resetDatePayroll = await getResetDate(2026, withPayroll);
        const payrollStr = extractISTComponents(resetDatePayroll).dateStr;
        console.log('\nWith usePayrollCycleForReset=true, targetYear=2026:');
        console.log('  Reset date (IST):', payrollStr, '(expected: 2025-12-26 when payroll start day is 26)');

        // Test 2: Reset date for year 2026 with fixed (e.g. April 1)
        const withFixed = { annualCLReset: { ...settings.annualCLReset.toObject?.() || settings.annualCLReset, usePayrollCycleForReset: false, resetMonth: 4, resetDay: 1 } };
        const resetDateFixed = await getResetDate(2026, withFixed);
        const fixedStr = extractISTComponents(resetDateFixed).dateStr;
        console.log('\nWith usePayrollCycleForReset=false, resetMonth=4, resetDay=1, targetYear=2026:');
        console.log('  Reset date (IST):', fixedStr, '(expected: 2026-04-01)');

        // Test 3: Next reset date (uses current settings)
        const nextDate = await getNextResetDate(settings);
        const nextStr = extractISTComponents(nextDate).dateStr;
        console.log('\nNext reset date (IST, current settings):', nextStr);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

test();
