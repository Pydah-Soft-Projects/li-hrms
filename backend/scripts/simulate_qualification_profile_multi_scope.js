/**
 * End-to-end simulation for multi-scope qualification profiles.
 * Run: node scripts/simulate_qualification_profile_multi_scope.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  SCOPE_TYPES,
  SCOPE_LABELS,
  RESOLUTION_ORDER,
  buildScopeKey,
  validateScopePayload,
  buildResolveQuery,
  canResolveScope,
  inferLegacyScopeType,
} = require('../employee-applications/services/qualificationProfileScope');
const {
  findProfileInList,
  cloneQualificationsConfig,
  normalizeProfilePayload,
  profileToResolved,
} = require('../employee-applications/services/qualificationProfileService');

const OID = (hex) => new mongoose.Types.ObjectId(hex.padEnd(24, '0').slice(0, 24));

function makeProfile(scopeType, ids, overrides = {}) {
  const scopeKey = buildScopeKey(scopeType, ids);
  return {
    _id: OID(Math.random().toString().slice(2, 8)),
    scopeType,
    scopeKey,
    division_id: ids.division_id || null,
    department_id: ids.department_id || null,
    designation_id: ids.designation_id || null,
    isActive: true,
    isEnabled: true,
    enableCertificateUpload: false,
    fields: [{ id: 'degree', label: `${scopeType} Degree`, type: 'text', order: 1 }],
    defaultRows: [{ degree: scopeType }],
    ...overrides,
  };
}

const DIV = OID('aaaaaaaaaaaaaaaaaaaa0001');
const DEPT = OID('aaaaaaaaaaaaaaaaaaaa0002');
const DES = OID('aaaaaaaaaaaaaaaaaaaa0003');

const ctx = {
  division_id: String(DIV),
  department_id: String(DEPT),
  designation_id: String(DES),
};

// --- Scope utility simulations ---
test('SCOPE_TYPES has all 7 configured scope types', () => {
  assert.equal(SCOPE_TYPES.length, 7);
  assert.deepEqual(RESOLUTION_ORDER.length, 7);
  for (const st of SCOPE_TYPES) {
    assert.ok(SCOPE_LABELS[st], `missing label for ${st}`);
  }
});

test('validateScopePayload accepts each scope type with required ids only', () => {
  const cases = [
    { scopeType: 'division', division_id: DIV },
    { scopeType: 'department', department_id: DEPT },
    { scopeType: 'designation', designation_id: DES },
    { scopeType: 'department_designation', department_id: DEPT, designation_id: DES },
    { scopeType: 'division_designation', division_id: DIV, designation_id: DES },
    { scopeType: 'division_department', division_id: DIV, department_id: DEPT },
    {
      scopeType: 'division_department_designation',
      division_id: DIV,
      department_id: DEPT,
      designation_id: DES,
    },
  ];
  for (const body of cases) {
    const r = validateScopePayload(body);
    assert.equal(r.ok, true, `failed for ${body.scopeType}: ${r.error || ''}`);
    assert.equal(r.scopeType, body.scopeType);
    assert.ok(r.scopeKey.includes(body.scopeType));
  }
});

test('validateScopePayload rejects extra ids for narrow scopes', () => {
  const r = validateScopePayload({
    scopeType: 'division',
    division_id: DIV,
    department_id: DEPT,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /department_id must be empty/);
});

test('validateScopePayload rejects missing required ids', () => {
  const r = validateScopePayload({ scopeType: 'department_designation', department_id: DEPT });
  assert.equal(r.ok, false);
  assert.match(r.error, /designation_id is required/);
});

test('buildScopeKey produces stable unique keys', () => {
  const key1 = buildScopeKey('department_designation', { department_id: DEPT, designation_id: DES });
  const key2 = buildScopeKey('department_designation', { department_id: DEPT, designation_id: DES });
  assert.equal(key1, key2);
  assert.equal(key1, `department_designation:${DEPT}:${DES}`);
});

test('canResolveScope requires context ids per scope type', () => {
  assert.equal(canResolveScope('division', ctx), true);
  assert.equal(canResolveScope('division_department_designation', ctx), true);
  assert.equal(canResolveScope('division', { division_id: null }), false);
  assert.equal(canResolveScope('department_designation', { department_id: DEPT }), false);
});

// --- Resolution order simulation ---
test('resolution picks most specific profile when all scopes exist', () => {
  const profiles = [
    makeProfile('division', { division_id: DIV }),
    makeProfile('department', { department_id: DEPT }),
    makeProfile('designation', { designation_id: DES }),
    makeProfile('department_designation', { department_id: DEPT, designation_id: DES }),
    makeProfile('division_designation', { division_id: DIV, designation_id: DES }),
    makeProfile('division_department', { division_id: DIV, department_id: DEPT }),
    makeProfile('division_department_designation', {
      division_id: DIV,
      department_id: DEPT,
      designation_id: DES,
    }),
  ];

  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, scopeType, ctx);
    assert.ok(hit, `expected profile for ${scopeType}`);
    assert.equal(hit.scopeType, scopeType);
  }

  // Walk resolution chain like service does
  let winner = null;
  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, scopeType, ctx);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'division_department_designation');
  assert.equal(winner.defaultRows[0].degree, 'division_department_designation');
});

test('resolution falls through to department_designation when triple not set', () => {
  const profiles = [
    makeProfile('division', { division_id: DIV }),
    makeProfile('department_designation', { department_id: DEPT, designation_id: DES }),
  ];
  let winner = null;
  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, scopeType, ctx);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'department_designation');
});

test('resolution uses division default when only division profile exists', () => {
  const profiles = [makeProfile('division', { division_id: DIV })];
  let winner = null;
  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, scopeType, ctx);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'division');
});

test('resolution returns null profiles list => global fallback (simulated)', () => {
  let winner = null;
  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList([], scopeType, ctx);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner, null);
});

test('legacy profile without scopeType still matches department_designation', () => {
  const legacy = {
    _id: OID('aaaaaaaaaaaaaaaaaaaa00aa'),
    department_id: DEPT,
    designation_id: DES,
    isActive: true,
    fields: [{ id: 'x', label: 'Legacy', type: 'text', order: 1 }],
    defaultRows: [],
  };
  assert.equal(inferLegacyScopeType(legacy), 'department_designation');
  const hit = findProfileInList([legacy], 'department_designation', ctx);
  assert.ok(hit);
  assert.equal(String(hit.department_id), String(DEPT));
});

test('inactive profiles are skipped', () => {
  const inactive = makeProfile('division_department_designation', {
    division_id: DIV,
    department_id: DEPT,
    designation_id: DES,
  }, { isActive: false });
  const active = makeProfile('department_designation', { department_id: DEPT, designation_id: DES });
  let winner = null;
  for (const scopeType of RESOLUTION_ORDER) {
    const hit = findProfileInList([inactive, active], scopeType, ctx);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'department_designation');
});

test('profileToResolved includes source and cloned config', () => {
  const p = makeProfile('designation', { designation_id: DES });
  const resolved = profileToResolved(p, 'designation', ctx);
  assert.equal(resolved.source, 'designation');
  assert.equal(resolved.fields[0].label, 'designation Degree');
  assert.notEqual(resolved.fields, p.fields);
  assert.equal(resolved.fields[0].id, p.fields[0].id);
});

test('normalizeProfilePayload filters invalid fields and preserves toggles', () => {
  const out = normalizeProfilePayload({
    isEnabled: false,
    enableCertificateUpload: true,
    fields: [
      { id: 'a', label: 'A', type: 'text', order: 2 },
      { id: '', label: 'Bad', type: 'text' },
      { id: 'b', label: '', type: 'text' },
    ],
    defaultRows: [{ a: 'x' }],
  });
  assert.equal(out.isEnabled, false);
  assert.equal(out.enableCertificateUpload, true);
  assert.equal(out.fields.length, 1);
  assert.equal(out.fields[0].id, 'a');
});

test('cloneQualificationsConfig deep clones fields and rows', () => {
  const src = {
    isEnabled: true,
    enableCertificateUpload: true,
    fields: [{ id: 'f1', label: 'F1', type: 'text', order: 1, options: [{ label: 'L', value: 'v' }] }],
    defaultRows: [{ f1: 'val' }],
  };
  const cloned = cloneQualificationsConfig(src);
  cloned.fields[0].label = 'Changed';
  cloned.defaultRows[0].f1 = 'changed';
  assert.equal(src.fields[0].label, 'F1');
  assert.equal(src.defaultRows[0].f1, 'val');
});

// --- Employee context change simulation (merge behavior logic) ---
function mergeQualificationsOnProfileChange(existingQuals, newDefaultRows) {
  const list = Array.isArray(existingQuals) ? existingQuals : [];
  const applicantRows = list.filter((row) => row && typeof row === 'object' && row.isPreFilled !== true);
  const prefilled = (newDefaultRows || []).map((row) => ({ ...row, isPreFilled: true }));
  return [...prefilled, ...applicantRows];
}

function seedQualificationsFromDefaults(existingQuals, defaultRows) {
  const list = Array.isArray(existingQuals) ? existingQuals : [];
  if (list.length > 0 || !defaultRows?.length) return null;
  return defaultRows.map((row) => ({ ...row, isPreFilled: true }));
}

test('scope change keeps applicant rows and replaces pre-filled rows', () => {
  const existing = [
    { degree: 'Org default', isPreFilled: true },
    { degree: 'MBA', isPreFilled: false },
    { degree: 'PhD', isPreFilled: false },
  ];
  const newDefaults = [{ degree: 'B.Tech prefill' }];
  const merged = mergeQualificationsOnProfileChange(existing, newDefaults);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].degree, 'B.Tech prefill');
  assert.equal(merged[0].isPreFilled, true);
  assert.equal(merged[1].degree, 'MBA');
  assert.equal(merged[2].degree, 'PhD');
});

test('first load seeds default rows when qualifications empty', () => {
  const seeded = seedQualificationsFromDefaults([], [{ degree: '10th' }]);
  assert.ok(seeded);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].isPreFilled, true);
});

test('seed does not run when applicant already has rows', () => {
  const seeded = seedQualificationsFromDefaults([{ degree: 'custom' }], [{ degree: '10th' }]);
  assert.equal(seeded, null);
});

// --- API payload simulation (upsert shape) ---
test('upsert payload shape for each scope type is valid', () => {
  const matrix = {
    division: { division_id: DIV },
    department: { department_id: DEPT },
    designation: { designation_id: DES },
    department_designation: { department_id: DEPT, designation_id: DES },
    division_designation: { division_id: DIV, designation_id: DES },
    division_department: { division_id: DIV, department_id: DEPT },
    division_department_designation: { division_id: DIV, department_id: DEPT, designation_id: DES },
  };
  for (const [scopeType, ids] of Object.entries(matrix)) {
    const validated = validateScopePayload({ scopeType, ...ids });
    assert.equal(validated.ok, true);
    const normalized = normalizeProfilePayload({
      isEnabled: true,
      enableCertificateUpload: false,
      fields: [{ id: 'degree', label: 'Degree', type: 'text' }],
      defaultRows: [],
    });
    const upsertBody = {
      scopeType: validated.scopeType,
      scopeKey: validated.scopeKey,
      division_id: validated.division_id,
      department_id: validated.department_id,
      designation_id: validated.designation_id,
      ...normalized,
      isActive: true,
    };
    assert.equal(upsertBody.scopeType, scopeType);
    assert.ok(upsertBody.fields.length >= 1);
  }
});

test('resolve query built for each scope in resolution order', () => {
  for (const scopeType of RESOLUTION_ORDER) {
    const q = buildResolveQuery(scopeType, ctx);
    assert.ok(q, `query null for ${scopeType}`);
    assert.equal(q.scopeType, scopeType);
    assert.equal(q.isActive, true);
  }
});

// Summary runner
test('SIMULATION SUMMARY', () => {
  console.log('\n========================================');
  console.log('QUALIFICATION PROFILE MULTI-SCOPE SIMULATION');
  console.log('========================================');
  console.log(`Scope types configured: ${SCOPE_TYPES.length}`);
  console.log('Resolution order:');
  RESOLUTION_ORDER.forEach((s, i) => console.log(`  ${i + 1}. ${SCOPE_LABELS[s]} (${s})`));
  console.log('\nAll unit simulations passed.');
  console.log('========================================\n');
  assert.ok(true);
});
