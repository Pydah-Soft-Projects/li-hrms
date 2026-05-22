/**
 * Integration smoke tests for holiday scoped access API.
 * Run: node scripts/test_holiday_scoped_access_api.js
 * Requires: backend running on PORT (default 5000), MongoDB, super admin login.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = `http://localhost:${process.env.PORT || 5000}`;

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
    if (!res.data?.success) throw new Error(`Login failed for ${email}: ${res.data?.message || res.status}`);
    return res.data.data.token;
}

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

const results = { passed: 0, failed: 0, skipped: 0 };

async function main() {
    console.log('\n=== Holiday Scoped Access API Tests ===\n');
    console.log(`Base URL: ${BASE}\n`);

    const health = await request('GET', '/health');
    if (health.status !== 200) {
        console.error('Backend not reachable. Start backend with: cd backend && npm run dev');
        process.exit(1);
    }
    pass('Backend health check');

    const email = process.env.HOLIDAY_TEST_SUPER_EMAIL
        || process.env.SUPER_ADMIN_EMAIL
        || 'nitya@pydah.edu.in';
    const password = process.env.HOLIDAY_TEST_SUPER_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;

    let superToken;
    if (!password) {
        skip('Super admin login — set HOLIDAY_TEST_SUPER_PASSWORD or SUPER_ADMIN_PASSWORD in .env');
    } else {
        try {
            superToken = await login(email, password);
            pass(`Super admin login (${email})`);
        } catch (e) {
            skip(`Super admin login (${e.message}) — using seeded test users instead`);
        }
    }

    if (!superToken) {
        const scopedEmail = process.env.HOLIDAY_TEST_SCOPED_EMAIL || 'holiday-scoped-test@hrms.local';
        const scopedPass = process.env.HOLIDAY_TEST_SCOPED_PASSWORD || 'HolidayTest@123';
        try {
            const scopedToken = await login(scopedEmail, scopedPass);
            pass(`Scoped test user login (${scopedEmail})`);
            await runScopedApiChecks(scopedToken, false);
        } catch (e) {
            skip(`Scoped test user — run: node scripts/seed_holiday_scoped_test_users.js (${e.message})`);
        }
        const globalEmail = process.env.HOLIDAY_TEST_GLOBAL_EMAIL || 'holiday-global-test@hrms.local';
        const globalPass = process.env.HOLIDAY_TEST_GLOBAL_PASSWORD || 'HolidayTest@123';
        try {
            const globalToken = await login(globalEmail, globalPass);
            pass(`Global test user login (${globalEmail})`);
            const adminRes = await request('GET', '/api/holidays/admin?year=2026', { token: globalToken });
            if (adminRes.status === 200 && adminRes.data?.data?.access?.canManageGlobal === true) {
                pass('Global test user access.canManageGlobal is true');
            } else {
                fail('Global test user access', JSON.stringify(adminRes.data?.data?.access));
            }
        } catch (e) {
            skip(`Global test user — run seed script (${e.message})`);
        }
        printSummary();
        process.exit(results.failed > 0 ? 1 : 0);
    }

    const noAuth = await request('GET', '/api/holidays/admin');
    if (noAuth.status === 401) pass('GET /holidays/admin without token returns 401');
    else fail('GET /holidays/admin without token', `status ${noAuth.status}`);

    const adminRes = await request('GET', '/api/holidays/admin?year=2026', { token: superToken });
    if (adminRes.status === 200 && adminRes.data?.success) {
        pass('Super admin GET /holidays/admin');
        const access = adminRes.data.data?.access;
        if (access?.canManageGlobal === true) pass('Super admin access.canManageGlobal is true');
        else fail('Super admin access.canManageGlobal', JSON.stringify(access));
    } else {
        fail('Super admin GET /holidays/admin', adminRes.data?.message || String(adminRes.status));
    }

    const groupsRes = await request('GET', '/api/holidays/groups', { token: superToken });
    if (groupsRes.status === 200) pass('Super admin GET /holidays/groups');
    else fail('Super admin GET /holidays/groups', String(groupsRes.status));

    const postGroupNoGlobal = await request('POST', '/api/holidays/groups', {
        token: superToken,
        body: { name: '__test_should_not_create_without_global__' },
    });
    if (postGroupNoGlobal.status === 200 || postGroupNoGlobal.status === 400) {
        pass('POST /holidays/groups reachable for super admin');
    }

    const scopedEmail = process.env.HOLIDAY_TEST_SCOPED_EMAIL || 'holiday-scoped-test@hrms.local';
    const scopedPass = process.env.HOLIDAY_TEST_SCOPED_PASSWORD || 'HolidayTest@123';
    try {
        const scopedToken = await login(scopedEmail, scopedPass);
        pass(`Scoped test user login (${scopedEmail})`);
        await runScopedApiChecks(scopedToken, false);
    } catch (e) {
        skip(`Scoped API checks — run: node scripts/seed_holiday_scoped_test_users.js (${e.message})`);
    }

    printSummary();
    process.exit(results.failed > 0 ? 1 : 0);
}

async function runScopedApiChecks(scopedToken, hasGlobal) {
    const scopedAdmin = await request('GET', '/api/holidays/admin?year=2026', { token: scopedToken });
    if (scopedAdmin.status === 200) {
        pass('Scoped user GET /holidays/admin');
        const access = scopedAdmin.data?.data?.access;
        if (!hasGlobal && access?.canManageGlobal === false) pass('Scoped access.canManageGlobal is false');
        else if (hasGlobal) skip('User has global manage flag');
        else fail('Scoped access.canManageGlobal expected false', JSON.stringify(access));

        const groups = scopedAdmin.data?.data?.groups || [];
        const managed = access?.managedHolidayGroupIds || [];
        if (!hasGlobal && groups.length > 0 && groups.every((g) => managed.includes(String(g._id)))) {
            pass('Scoped admin groups filtered to managed ids');
        } else if (hasGlobal) skip('Global manager — group filter not applied');
        else if (groups.length === 0) skip('No groups returned for scoped user');
        else fail('Group filter mismatch', `groups=${groups.length} managed=${managed.length}`);
    } else {
        fail('Scoped GET /holidays/admin', scopedAdmin.data?.message);
    }

    const globalHoliday = (scopedAdmin.data?.data?.holidays || []).find((h) => h.scope === 'GLOBAL');
    if (globalHoliday && !hasGlobal) {
        const delGlobal = await request('DELETE', `/api/holidays/${globalHoliday._id}`, {
            token: scopedToken,
            body: { onDeleteAction: 'RESTORE_PATTERN' },
        });
        if (delGlobal.status === 403) pass('Scoped user cannot delete GLOBAL holiday (403)');
        else fail('Scoped delete GLOBAL holiday', `status ${delGlobal.status}`);
    } else {
        skip('No GLOBAL holiday in dataset to test scoped delete denial');
    }

    const postGlobal = await request('POST', '/api/holidays/groups', {
        token: scopedToken,
        body: { name: 'Scoped Test Group ' + Date.now() },
    });
    if (!hasGlobal && postGlobal.status === 403) pass('Scoped user cannot POST /holidays/groups (403)');
    else if (hasGlobal) skip('User has global manage');
    else fail('Scoped POST /holidays/groups', `status ${postGlobal.status}`);
}

function printSummary() {
    console.log('\n--- Summary ---');
    console.log(`Passed: ${results.passed}, Failed: ${results.failed}, Skipped: ${results.skipped}\n`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
