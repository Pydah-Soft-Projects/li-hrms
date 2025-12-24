require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

async function runTests() {
    console.log('--- Starting Bulk Upload Verification ---');
    let token;

    // 1. Login
    try {
        console.log(`[1/4] Logging in as ${ADMIN_EMAIL}...`);
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            identifier: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        token = loginRes.data.data.token;
        console.log('✅ Login successful');
    } catch (err) {
        console.error('❌ Login failed:', err.response?.data?.message || err.message);
        process.exit(1);
    }

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Verify /bulk-approve route reordering (should no longer return CastError/500)
    try {
        console.log('[2/4] Verifying /bulk-approve route...');
        // We expect a 200 or 400 (if no IDs provided), but NOT a 500 CastError
        const approveRes = await axios.put(`${BASE_URL}/employee-applications/bulk-approve`, {}, { headers: authHeaders });
        console.log('✅ /bulk-approve responded with:', approveRes.status);
    } catch (err) {
        if (err.response?.status === 400) {
            console.log('✅ /bulk-approve responded with 400 (Bad Request), which is expected when no data is sent. (No CastError)');
        } else {
            console.error('❌ /bulk-approve check failed:', err.response?.status, err.response?.data?.message || err.message);
        }
    }

    // 3. Setup test data (Fetch a valid dept/desig)
    let deptId, desigId;
    try {
        console.log('[3/4] Fetching valid department and designation for test data...');
        const deptsRes = await axios.get(`${BASE_URL}/departments?isActive=true`, { headers: authHeaders });
        const dept = deptsRes.data.data?.[0] || deptsRes.data?.[0];
        if (dept) {
            deptId = dept._id;
            const desigsRes = await axios.get(`${BASE_URL}/departments/${deptId}/designations`, { headers: authHeaders });
            const desig = desigsRes.data.data?.[0] || desigsRes.data?.[0];
            if (desig) desigId = desig._id;
        }
        console.log(`Using Dept: ${deptId}, Desig: ${desigId}`);
    } catch (err) {
        console.warn('⚠️  Could not fetch real IDs, using placeholders. Tests might fail validation but should not crash.');
        deptId = '6735e0000000000000000000';
        desigId = '6735e1111111111111111111';
    }

    // 4. Test Bulk Create Endpoint
    try {
        console.log('[4/4] Testing Bulk Create endpoint...');
        const bulkData = [
            {
                emp_no: 'TEST_BULK_001',
                employee_name: 'Test Bulk User 1',
                proposedSalary: 50000,
                department_id: deptId,
                designation_id: desigId,
                doj: '2025-01-01',
                phone_number: '1234567890',
                qualifications: 'B.Tech:2021, M.Tech:2023'
            },
            {
                emp_no: 'TEST_BULK_002',
                employee_name: 'Test Bulk User 2',
                proposedSalary: 60000,
                department_id: deptId,
                designation_id: desigId,
                doj: '2025-01-01',
                phone_number: '0987654321',
                qualifications: 'Inter:2019'
            }
        ];

        const bulkRes = await axios.post(`${BASE_URL}/employee-applications/bulk`, bulkData, { headers: authHeaders });
        console.log('✅ Bulk response:', JSON.stringify(bulkRes.data, null, 2));
        if (bulkRes.data.success) {
            console.log('🎉 Bulk Upload test PASSED!');
        } else {
            console.log('⚠️  Bulk Upload returned partial success/fail. Check payload above.');
        }
    } catch (err) {
        console.error('❌ Bulk Create test failed:', err.response?.status, JSON.stringify(err.response?.data, null, 2) || err.message);
    }

    console.log('--- Verification Complete ---');
}

runTests();
