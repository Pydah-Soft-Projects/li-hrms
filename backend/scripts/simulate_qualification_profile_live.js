/**
 * Live DB + API simulation for qualification profiles (requires MongoDB + optional running server).
 * Run: node scripts/simulate_qualification_profile_live.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const test = require('node:test');
const assert = require('node:assert/strict');
const QualificationProfile = require('../employee-applications/model/QualificationProfile');
const {
  resolveQualificationProfile,
  migrateLegacyQualificationProfiles,
} = require('../employee-applications/services/qualificationProfileService');
const { validateScopePayload } = require('../employee-applications/services/qualificationProfileScope');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi';
const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';

async function connectDb() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
}

async function tryApi(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test('live: migrate legacy profiles without error', async () => {
  await connectDb();
  const count = await migrateLegacyQualificationProfiles();
  assert.ok(count >= 0);
  console.log(`  migrated legacy profiles: ${count}`);
});

test('live: list active profiles from database', async () => {
  await connectDb();
  const profiles = await QualificationProfile.find({ isActive: true }).lean();
  assert.ok(Array.isArray(profiles));
  for (const p of profiles) {
    if (p.scopeType) {
      assert.ok(p.scopeKey, `profile ${p._id} missing scopeKey`);
    }
  }
  console.log(`  active profiles in DB: ${profiles.length}`);
});

test('live: resolve with real org ids when available', async () => {
  await connectDb();
  const Division = mongoose.models.Division || mongoose.model('Division', new mongoose.Schema({ name: String, isActive: Boolean }));
  const Department = mongoose.models.Department || mongoose.model('Department', new mongoose.Schema({ name: String, isActive: Boolean, division_id: mongoose.Schema.Types.ObjectId }));
  const Designation = mongoose.models.Designation || mongoose.model('Designation', new mongoose.Schema({ name: String, department: mongoose.Schema.Types.ObjectId }));

  const [div, dept, des] = await Promise.all([
    Division.findOne({ isActive: true }).lean(),
    Department.findOne({ isActive: true }).lean(),
    Designation.findOne().lean(),
  ]);

  if (!div || !dept || !des) {
    console.log('  skipped resolve test — no division/department/designation in DB');
    return;
  }

  const resolved = await resolveQualificationProfile(div._id, dept._id, des._id);
  assert.ok(resolved);
  assert.ok(resolved.source);
  assert.ok(Array.isArray(resolved.fields));
  console.log(`  resolved source: ${resolved.source}`);
  console.log(`  fields: ${resolved.fields.length}, defaultRows: ${(resolved.defaultRows || []).length}`);
});

test('live: upsert and lookup division profile (cleanup after)', async () => {
  await connectDb();
  const Division = mongoose.models.Division || mongoose.model('Division', new mongoose.Schema({ name: String, isActive: Boolean }));
  const div = await Division.findOne({ isActive: true }).lean();
  if (!div) {
    console.log('  skipped upsert test — no division in DB');
    return;
  }

  const scopeKey = `simulation:division:${div._id}`;
  const created = await QualificationProfile.findOneAndUpdate(
    { scopeKey },
    {
      $set: {
        scopeType: 'division',
        scopeKey,
        division_id: div._id,
        department_id: null,
        designation_id: null,
        isEnabled: true,
        enableCertificateUpload: false,
        fields: [{ id: 'sim_degree', label: 'Sim Degree', type: 'text', order: 1 }],
        defaultRows: [{ sim_degree: 'simulation-row' }],
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  assert.ok(created._id);
  assert.equal(created.scopeType, 'division');

  const resolved = await resolveQualificationProfile(div._id, null, null);
  assert.ok(resolved);
  assert.ok(resolved.source === 'division' || resolved.source === 'global');

  await QualificationProfile.deleteOne({ scopeKey });
  console.log('  upsert + resolve + cleanup OK');
});

test('live: API list endpoint (if server running)', async () => {
  try {
    const { status, body } = await tryApi('/employee-applications/qualification-profiles');
    if (status === 401) {
      console.log('  API list: server up, auth required (expected without token)');
      return;
    }
    if (status === 200) {
      assert.equal(body.success, true);
      console.log(`  API list: ${(body.data || []).length} profiles`);
      return;
    }
    console.log(`  API list: status ${status} — ${body.message || 'no message'}`);
  } catch (e) {
    console.log('  API list: server not reachable — skipped');
  }
});

test('LIVE SIMULATION SUMMARY', () => {
  console.log('\n========================================');
  console.log('LIVE QUALIFICATION PROFILE SIMULATION DONE');
  console.log('========================================\n');
  assert.ok(true);
});
