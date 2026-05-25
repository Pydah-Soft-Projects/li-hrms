/**
 * Integration tests: holiday employee scope (holidayDivisionMapping + MAPPING holidays).
 * Run: node scripts/test_holiday_employee_scope_api.js
 * Prereq: backend on PORT, MongoDB, node scripts/seed_holiday_mapping_test_user.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Holiday = require('../holidays/model/Holiday');
const HolidayHistory = require('../holidays/model/HolidayHistory');
const { connectMongoDB, closeMongoDB } = require('../config/database');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const EMAIL = process.env.HOLIDAY_TEST_MAPPING_EMAIL || 'holiday-mapping-test@hrms.local';
const PASSWORD = process.env.HOLIDAY_TEST_MAPPING_PASSWORD || 'HolidayTest@123';

const results = { passed: 0, failed: 0, skipped: 0 };
let createdHolidayId = null;

function pass(msg) {
    console.log(`  PASS: ${msg}`);
    results.passed += 1;
}
function fail(msg, detail) {
    console.log(`  FAIL: ${msg}${detail ? ` — ${detail}` : ''}`);
    results.failed += 1;
}
function skip(msg) {
    console.log(`  SKIP: ${msg}`);
    results.skipped += 1;
}

async function request(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return { status: res.status, data };
}

async function login(email, password) {
    const res = await request('POST', '/api/auth/login', {
        body: { identifier: email, password },
    });
    if (!res.data?.success) throw new Error(res.data?.message || `HTTP ${res.status}`);
    return { token: res.data.data.token, user: res.data.data.user };
}

async function main() {
    console.log('\n=== Holiday Employee Scope API Tests (real DB) ===\n');
    console.log(`Base: ${BASE}`);
    console.log(`User: ${EMAIL}\n`);

    const health = await request('GET', '/health');
    if (health.status !== 200) {
        console.error('Backend not running. Start: cd backend && npm run dev');
        process.exit(1);
    }
    pass('Backend health');

    let token;
    let loginUser;
    try {
        const auth = await login(EMAIL, PASSWORD);
        token = auth.token;
        loginUser = auth.user;
        pass('Login');
    } catch (e) {
        console.error(`Login failed: ${e.message}`);
        console.error('Run: node scripts/seed_holiday_mapping_test_user.js');
        process.exit(1);
    }

    const mapping = loginUser?.holidayDivisionMapping;
    if (Array.isArray(mapping) && mapping.length > 0) {
        pass(`Login returns holidayDivisionMapping (${mapping.length} row(s))`);
    } else {
        fail('Login holidayDivisionMapping missing', JSON.stringify(mapping));
    }

    if (!loginUser?.managedHolidayGroupIds?.length) {
        pass('Login managedHolidayGroupIds empty (mapping-only user)');
    } else {
        fail('Expected no managedHolidayGroupIds for mapping test user', String(loginUser.managedHolidayGroupIds?.length));
    }

    const adminRes = await request('GET', '/api/holidays/admin?year=2026', { token });
    if (adminRes.status !== 200 || !adminRes.data?.success) {
        fail('GET /holidays/admin', adminRes.data?.message || String(adminRes.status));
    } else {
        pass('GET /holidays/admin');
        const access = adminRes.data.data?.access;
        if (access?.hasEmployeeScope === true) pass('access.hasEmployeeScope is true');
        else fail('access.hasEmployeeScope', JSON.stringify(access));
        if (access?.holidayDivisionMapping?.length > 0) pass('access.holidayDivisionMapping returned');
        else fail('access.holidayDivisionMapping empty');
    }

    const previewAll = await request('POST', '/api/holidays/preview-impact', {
        token,
        body: { scope: 'MAPPING', divisionMapping: [] },
    });
    if (previewAll.status === 200 && previewAll.data?.success) {
        const count = previewAll.data.data?.employeeCount;
        if (typeof count === 'number' && count >= 0) {
            pass(`preview-impact (full scope): ${count} employee(s)`);
        } else {
            fail('preview-impact employeeCount invalid', JSON.stringify(previewAll.data.data));
        }
    } else {
        fail('POST /holidays/preview-impact', previewAll.data?.message || String(previewAll.status));
    }

    const testDate = '2026-12-25';
    const createRes = await request('POST', '/api/holidays', {
        token,
        body: {
            name: 'AUTO_MAPPING_SCOPE_TEST',
            date: testDate,
            type: 'Company',
            scope: 'MAPPING',
            divisionMapping: [],
            description: 'Integration test holiday — employee scope',
            rosterFillMode: 'HOL',
        },
    });
    if (createRes.status === 200 && createRes.data?.success) {
        const holiday = createRes.data.data;
        createdHolidayId = holiday?._id;
        pass(`POST /holidays MAPPING created (${createdHolidayId})`);
        if (holiday?.scope === 'MAPPING') pass('Created holiday scope is MAPPING');
        else fail('Created holiday scope', holiday?.scope);
        const affected = createRes.data.affectedEmployees;
        if (typeof affected === 'number') pass(`Create response affectedEmployees: ${affected}`);
        else skip('affectedEmployees not in response');
    } else {
        fail('POST /holidays MAPPING', createRes.data?.message || String(createRes.status));
    }

    if (createdHolidayId) {
        const activityRes = await request('GET', `/api/holidays/${createdHolidayId}/activity`, { token });
        if (activityRes.status === 200 && Array.isArray(activityRes.data?.data)) {
            const created = activityRes.data.data.find((r) => r.event === 'holiday_created');
            if (created) pass('Activity log has holiday_created');
            else fail('Activity log missing holiday_created', activityRes.data.data.map((r) => r.event).join(', '));
        } else {
            fail('GET activity', activityRes.data?.message || String(activityRes.status));
        }

        await connectMongoDB();
        const dbHoliday = await Holiday.findById(createdHolidayId).lean();
        if (dbHoliday?.scope === 'MAPPING' && dbHoliday.divisionMapping?.length > 0) {
            pass('DB: holiday has divisionMapping saved');
        } else {
            fail('DB holiday mapping', JSON.stringify({ scope: dbHoliday?.scope, rows: dbHoliday?.divisionMapping?.length }));
        }
        const histCount = await HolidayHistory.countDocuments({ holidayId: createdHolidayId, event: 'holiday_created' });
        if (histCount >= 1) pass('DB: HolidayHistory holiday_created row exists');
        else fail('DB HolidayHistory', `count=${histCount}`);
        await closeMongoDB();

        const delRes = await request('DELETE', `/api/holidays/${createdHolidayId}`, {
            token,
            body: { onDeleteAction: 'RESTORE_PATTERN' },
        });
        if (delRes.status === 200) pass('DELETE /holidays (cleanup)');
        else fail('DELETE cleanup', delRes.data?.message || String(delRes.status));
        createdHolidayId = null;
    }

    console.log('\n--- Summary ---');
    console.log(`Passed: ${results.passed}, Failed: ${results.failed}, Skipped: ${results.skipped}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
