/**
 * Simulation + tests for multi-select division/department qualification batch save.
 *
 * Covers:
 *  - expandScopeCombos cartesian + hierarchy filtering
 *  - each combo validates as a unique scopeKey upsert payload
 *  - resolution still picks most-specific after multi upsert
 *  - cascade prune simulation (div change drops orphan depts)
 *
 * Run: node scripts/simulate_qualification_multiselect_batch.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  SCOPE_TYPES,
  buildScopeKey,
  validateScopePayload,
  RESOLUTION_ORDER,
} = require('../employee-applications/services/qualificationProfileScope');
const {
  findProfileInList,
  normalizeProfilePayload,
} = require('../employee-applications/services/qualificationProfileService');

const OID = (n) => {
  const hex = String(n).replace(/\D/g, '').padStart(24, '0').slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
};

const DIV_A = String(OID('100000000000000000000001'));
const DIV_B = String(OID('100000000000000000000002'));
const DEPT_A1 = String(OID('200000000000000000000001'));
const DEPT_A2 = String(OID('200000000000000000000002'));
const DEPT_B1 = String(OID('200000000000000000000003'));
const DES_1 = String(OID('300000000000000000000001'));
const DES_2 = String(OID('300000000000000000000002'));

const DEPARTMENTS = [
  { _id: DEPT_A1, name: 'Dept A1', division_id: DIV_A },
  { _id: DEPT_A2, name: 'Dept A2', division_id: DIV_A },
  { _id: DEPT_B1, name: 'Dept B1', division_id: DIV_B },
];

const SCOPE_REQUIRED = {
  division: ['division_id'],
  department: ['department_id'],
  designation: ['designation_id'],
  department_designation: ['department_id', 'designation_id'],
  division_designation: ['division_id', 'designation_id'],
  division_department: ['division_id', 'department_id'],
  division_department_designation: ['division_id', 'department_id', 'designation_id'],
};

function scopeNeeds(scopeType, field) {
  return SCOPE_REQUIRED[scopeType].includes(field);
}

function deptDivisionId(dept) {
  const dDiv = dept.division_id;
  if (!dDiv) return '';
  return typeof dDiv === 'object' ? String(dDiv._id || '') : String(dDiv);
}

/** Mirrors frontend/src/lib/qualificationProfileMultiSelect.ts */
function expandScopeCombos(scopeType, divisionIds, departmentIds, designationIds, departments = []) {
  const needsDiv = scopeNeeds(scopeType, 'division_id');
  const needsDept = scopeNeeds(scopeType, 'department_id');
  const needsDes = scopeNeeds(scopeType, 'designation_id');

  const divs = needsDiv ? divisionIds.map(String) : [null];
  const depts = needsDept ? departmentIds.map(String) : [null];
  const dess = needsDes ? designationIds.map(String) : [null];

  const combos = [];
  for (const div of divs) {
    for (const dept of depts) {
      if (needsDiv && needsDept && div && dept) {
        const meta = departments.find((d) => String(d._id) === String(dept));
        const linked = meta ? deptDivisionId(meta) : '';
        if (linked && linked !== div) continue;
      }
      for (const des of dess) {
        combos.push({
          division_id: div,
          department_id: dept,
          designation_id: des,
        });
      }
    }
  }
  return combos;
}

function pruneDepartmentsForDivisions(divisionIds, departmentIds, departments) {
  const allowed = new Set(
    departments
      .filter((d) => {
        const linked = deptDivisionId(d);
        return !linked || divisionIds.includes(linked);
      })
      .map((d) => String(d._id))
  );
  return departmentIds.filter((id) => allowed.has(id));
}

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
}

test('expand: multi division only → N division profiles', () => {
  const combos = expandScopeCombos('division', [DIV_A, DIV_B], [], [], DEPARTMENTS);
  assert.equal(combos.length, 2);
  assert.deepEqual(
    combos.map((c) => c.division_id).sort(),
    [DIV_A, DIV_B].sort()
  );
  assert.ok(combos.every((c) => c.department_id == null && c.designation_id == null));
  record('multi division expand', true, `${combos.length} combos`);
});

test('expand: multi department only → N department profiles', () => {
  const combos = expandScopeCombos('department', [], [DEPT_A1, DEPT_A2, DEPT_B1], [], DEPARTMENTS);
  assert.equal(combos.length, 3);
  record('multi department expand', true, `${combos.length} combos`);
});

test('expand: division_department hierarchy skips cross-division pairs', () => {
  // Select both divisions + all 3 depts → only matching pairs: A×A1, A×A2, B×B1 (not 2×3=6)
  const combos = expandScopeCombos(
    'division_department',
    [DIV_A, DIV_B],
    [DEPT_A1, DEPT_A2, DEPT_B1],
    [],
    DEPARTMENTS
  );
  assert.equal(combos.length, 3, `expected 3 hierarchy-valid pairs, got ${combos.length}`);
  const keys = combos.map((c) => `${c.division_id}:${c.department_id}`).sort();
  assert.deepEqual(
    keys,
    [`${DIV_A}:${DEPT_A1}`, `${DIV_A}:${DEPT_A2}`, `${DIV_B}:${DEPT_B1}`].sort()
  );
  record('hierarchy filter division×department', true, keys.join(' | '));
});

test('expand: division_department without links pairs all (legacy unlinked depts)', () => {
  const unlinked = [
    { _id: DEPT_A1, name: 'X' },
    { _id: DEPT_A2, name: 'Y' },
  ];
  const combos = expandScopeCombos('division_department', [DIV_A, DIV_B], [DEPT_A1, DEPT_A2], [], unlinked);
  assert.equal(combos.length, 4);
  record('unlinked dept cartesian', true, `${combos.length} combos`);
});

test('expand: department_designation multi × multi', () => {
  const combos = expandScopeCombos(
    'department_designation',
    [],
    [DEPT_A1, DEPT_A2],
    [DES_1, DES_2],
    DEPARTMENTS
  );
  assert.equal(combos.length, 4);
  record('department×designation cartesian', true, `${combos.length} combos`);
});

test('expand: empty required selection → empty / incomplete', () => {
  const combos = expandScopeCombos('division_department', [DIV_A], [], [], DEPARTMENTS);
  // department required but empty array → depts = [] → zero iterations
  assert.equal(combos.length, 0);
  record('incomplete selection yields 0 combos', true);
});

test('each expanded combo validates + unique scopeKey', () => {
  const combos = expandScopeCombos(
    'division_department',
    [DIV_A, DIV_B],
    [DEPT_A1, DEPT_A2, DEPT_B1],
    [],
    DEPARTMENTS
  );
  const keys = new Set();
  for (const combo of combos) {
    const validated = validateScopePayload({
      scopeType: 'division_department',
      division_id: combo.division_id,
      department_id: combo.department_id,
    });
    assert.equal(validated.ok, true, validated.error);
    assert.ok(!keys.has(validated.scopeKey), `duplicate key ${validated.scopeKey}`);
    keys.add(validated.scopeKey);
    assert.equal(
      validated.scopeKey,
      buildScopeKey('division_department', {
        division_id: combo.division_id,
        department_id: combo.department_id,
      })
    );
  }
  assert.equal(keys.size, combos.length);
  record('unique scopeKeys after expand', true, `${keys.size} keys`);
});

test('batch upsert simulation: same config applied to all combos', () => {
  const combos = expandScopeCombos('division', [DIV_A, DIV_B], [], [], DEPARTMENTS);
  const config = normalizeProfilePayload({
    isEnabled: true,
    enableCertificateUpload: true,
    fields: [
      { id: 'degree', label: 'Degree', type: 'text', order: 1 },
      { id: 'year', label: 'Year', type: 'number', order: 2 },
    ],
    defaultRows: [{ degree: '10th', year: 2010 }],
  });

  const store = new Map();
  for (const combo of combos) {
    const validated = validateScopePayload({
      scopeType: 'division',
      division_id: combo.division_id,
    });
    assert.equal(validated.ok, true);
    store.set(validated.scopeKey, {
      ...validated,
      ...config,
      isActive: true,
    });
  }

  assert.equal(store.size, 2);
  for (const profile of store.values()) {
    assert.equal(profile.fields.length, 2);
    assert.equal(profile.defaultRows[0].degree, '10th');
    assert.equal(profile.enableCertificateUpload, true);
  }
  record('batch upsert same config', true, `profiles=${store.size}`);
});

test('after multi division upsert, resolution still picks most specific', () => {
  const profiles = [
    {
      _id: OID('1'),
      scopeType: 'division',
      scopeKey: buildScopeKey('division', { division_id: DIV_A }),
      division_id: DIV_A,
      department_id: null,
      designation_id: null,
      isActive: true,
      fields: [{ id: 'degree', label: 'Div A', type: 'text' }],
      defaultRows: [{ degree: 'from-division' }],
    },
    {
      _id: OID('2'),
      scopeType: 'division',
      scopeKey: buildScopeKey('division', { division_id: DIV_B }),
      division_id: DIV_B,
      department_id: null,
      designation_id: null,
      isActive: true,
      fields: [{ id: 'degree', label: 'Div B', type: 'text' }],
      defaultRows: [{ degree: 'from-division-b' }],
    },
    {
      _id: OID('3'),
      scopeType: 'division_department',
      scopeKey: buildScopeKey('division_department', { division_id: DIV_A, department_id: DEPT_A1 }),
      division_id: DIV_A,
      department_id: DEPT_A1,
      designation_id: null,
      isActive: true,
      fields: [{ id: 'degree', label: 'DivA+Dept', type: 'text' }],
      defaultRows: [{ degree: 'from-div-dept' }],
    },
  ];

  const ctxA = { division_id: DIV_A, department_id: DEPT_A1, designation_id: DES_1 };
  let winner = null;
  for (const st of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, st, ctxA);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'division_department');
  assert.equal(winner.defaultRows[0].degree, 'from-div-dept');

  const ctxB = { division_id: DIV_B, department_id: DEPT_B1, designation_id: DES_1 };
  winner = null;
  for (const st of RESOLUTION_ORDER) {
    const hit = findProfileInList(profiles, st, ctxB);
    if (hit) {
      winner = hit;
      break;
    }
  }
  assert.equal(winner.scopeType, 'division');
  assert.equal(String(winner.division_id), DIV_B);
  record('resolution after multi upsert', true, 'div+dept wins over division; other div uses its profile');
});

test('cascade prune: removing a division drops its departments from selection', () => {
  let divisionIds = [DIV_A, DIV_B];
  let departmentIds = [DEPT_A1, DEPT_A2, DEPT_B1];
  // User deselects DIV_B
  divisionIds = [DIV_A];
  departmentIds = pruneDepartmentsForDivisions(divisionIds, departmentIds, DEPARTMENTS);
  assert.deepEqual(departmentIds.sort(), [DEPT_A1, DEPT_A2].sort());
  const combos = expandScopeCombos('division_department', divisionIds, departmentIds, [], DEPARTMENTS);
  assert.equal(combos.length, 2);
  record('cascade prune departments', true, `remaining depts=${departmentIds.length}`);
});

test('all 7 scope types still listed for UI matrix', () => {
  assert.equal(SCOPE_TYPES.length, 7);
  record('scope type matrix intact', true, SCOPE_TYPES.join(', '));
});

test('REPORT', () => {
  const failed = results.filter((r) => !r.pass);
  console.log('\n====================================================');
  console.log('QUALIFICATION MULTI-SELECT BATCH — TEST REPORT');
  console.log('====================================================');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('----------------------------------------------------');
  console.log(`Total: ${results.length}  Passed: ${results.length - failed.length}  Failed: ${failed.length}`);
  console.log('====================================================\n');
  assert.equal(failed.length, 0);
});
