/**
 * Update Leave Settings: HOD → Manager → HR → Super Admin (Final Authority)
 *
 * Workflow: HOD → Manager → HR → Super Admin
 * Final Authority: super_admin
 *
 * Usage: node scripts/update_leave_workflow_add_manager.js
 *        API_BASE=http://localhost:5000 node scripts/update_leave_workflow_add_manager.js
 */

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

const WORKFLOW = {
  isEnabled: true,
  steps: [
    { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
    { stepOrder: 2, stepName: 'Manager Approval', approverRole: 'manager' },
    { stepOrder: 3, stepName: 'HR Approval', approverRole: 'hr' },
    { stepOrder: 4, stepName: 'Super Admin Approval', approverRole: 'super_admin' },
  ],
  finalAuthority: { role: 'super_admin', anyHRCanApprove: false },
};

async function main() {
  try {
    console.log('Updating Leave/OD workflow via API:', API_BASE);

    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
      identifier: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });
    if (!loginRes.data.success) {
      throw new Error('Login failed: ' + (loginRes.data.message || JSON.stringify(loginRes.data)));
    }
    const token = loginRes.data.data.token;

    for (const type of ['leave', 'od']) {
      const getRes = await axios.get(`${API_BASE}/api/leaves/settings/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const current = getRes.data.data || {};

      const payload = {
        types: current.types,
        statuses: current.statuses,
        settings: current.settings,
        workflow: WORKFLOW,
      };

      const saveRes = await axios.post(`${API_BASE}/api/leaves/settings/${type}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!saveRes.data.success) {
        throw new Error(`Save ${type} failed: ${JSON.stringify(saveRes.data)}`);
      }
      console.log(`✓ ${type.toUpperCase()} workflow updated: HOD → Manager → HR → Super Admin (final authority)`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
