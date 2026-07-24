/**
 * Live verification: partial direct edit on a real employee.
 * - Snapshot BEFORE
 * - Apply ONLY edited fields (dummy profilePhoto + phone)
 * - Snapshot AFTER
 * - Assert only intended fields changed (plus allowed dynamicFields cleanup)
 * - Restore original values
 *
 * Usage: node backend/scripts/verify_partial_employee_edit.js [emp_no]
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const {
  extractPermanentFields,
  extractDynamicFields,
  getPermanentFieldNames,
} = require('../employee-applications/services/fieldMappingService');
const {
  promotePermanentFieldsFromDynamic,
  stripPromotedPermanentFieldsFromDynamic,
} = require('../shared/utils/promotePermanentFieldsFromDynamic');

const DUMMY_PHOTO =
  'https://example.com/hrms-dummy-profile-photo-verify-2026.png';
const ALLOWED_EXTRA_CHANGED = new Set(['updated_at', 'dynamicFields', '__v']);

function stable(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function diffDocs(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [];
  for (const k of keys) {
    if (k === '_id') continue;
    if (stable(before[k]) !== stable(after[k])) changed.push(k);
  }
  return changed;
}

async function main() {
  const empNo = String(process.argv[2] || '5010').trim().toUpperCase();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected:', process.env.MONGODB_URI);
  console.log('Target emp_no:', empNo);

  const beforeDoc = await Employee.findOne({ emp_no: empNo }).lean();
  if (!beforeDoc) {
    console.error('Employee not found');
    process.exit(1);
  }

  const beforePhone = beforeDoc.phone_number;
  const beforePhoto = beforeDoc.profilePhoto;
  const editedPhone = beforePhone && String(beforePhone).endsWith('9')
    ? String(beforePhone).slice(0, -1) + '8'
    : String(beforePhone || '9000000000') + '1';

  console.log('\n========== BEFORE EDIT ==========');
  console.log({
    emp_no: beforeDoc.emp_no,
    employee_name: beforeDoc.employee_name,
    phone_number: beforeDoc.phone_number,
    profilePhoto: beforeDoc.profilePhoto || null,
    email: beforeDoc.email,
    address: beforeDoc.address,
    employee_group_id: beforeDoc.employee_group_id,
    dynamicHasProfilePhoto: !!(beforeDoc.dynamicFields && beforeDoc.dynamicFields.profilePhoto),
  });

  // Simulate frontend: ONLY send edited fields
  const partialPayload = {
    emp_no: empNo,
    phone_number: editedPhone,
    profilePhoto: DUMMY_PHOTO,
  };
  console.log('\n========== PAYLOAD (edited fields only) ==========');
  console.log(partialPayload);

  // Same routing helpers as updateEmployee
  const permanentFields = extractPermanentFields(partialPayload);
  let dynamicFields = extractDynamicFields(partialPayload, permanentFields);
  const promoted = promotePermanentFieldsFromDynamic({
    ...beforeDoc,
    ...permanentFields,
    dynamicFields: { ...(beforeDoc.dynamicFields || {}), ...dynamicFields },
  });
  for (const name of getPermanentFieldNames()) {
    if (permanentFields[name] !== undefined && permanentFields[name] !== null) continue;
    if (
      (beforeDoc[name] === undefined || beforeDoc[name] === null || beforeDoc[name] === '') &&
      promoted[name] !== undefined &&
      promoted[name] !== null &&
      promoted[name] !== ''
    ) {
      permanentFields[name] = promoted[name];
    }
  }
  dynamicFields = stripPromotedPermanentFieldsFromDynamic(dynamicFields);

  const updateData = {
    ...permanentFields,
    updated_at: new Date(),
    dynamicFields: stripPromotedPermanentFieldsFromDynamic({
      ...(beforeDoc.dynamicFields || {}),
      ...dynamicFields,
    }),
  };

  // Intentionally DO NOT set qualifications / salary / leaves — partial edit
  console.log('\n========== UPDATE DATA KEYS ==========');
  console.log(Object.keys(updateData).sort());

  await Employee.findOneAndUpdate({ emp_no: empNo }, updateData, { new: true });

  const afterDoc = await Employee.findOne({ emp_no: empNo }).lean();
  console.log('\n========== AFTER EDIT ==========');
  console.log({
    emp_no: afterDoc.emp_no,
    employee_name: afterDoc.employee_name,
    phone_number: afterDoc.phone_number,
    profilePhoto: afterDoc.profilePhoto || null,
    email: afterDoc.email,
    address: afterDoc.address,
    employee_group_id: afterDoc.employee_group_id,
    dynamicHasProfilePhoto: !!(afterDoc.dynamicFields && afterDoc.dynamicFields.profilePhoto),
  });

  const changed = diffDocs(beforeDoc, afterDoc);
  const intended = new Set(['phone_number', 'profilePhoto']);
  const unexpected = changed.filter((k) => !intended.has(k) && !ALLOWED_EXTRA_CHANGED.has(k));

  // Also check root photo not stuck only in dynamic
  const photoOnRoot = afterDoc.profilePhoto === DUMMY_PHOTO;
  const photoNotInDynamic = !(afterDoc.dynamicFields && afterDoc.dynamicFields.profilePhoto);

  console.log('\n========== DIFF REPORT ==========');
  console.log('Changed keys:', changed);
  console.log('Intended edits:', [...intended]);
  console.log('Allowed extras (cleanup/meta):', [...ALLOWED_EXTRA_CHANGED].filter((k) => changed.includes(k)));
  console.log('Unexpected other field changes:', unexpected.length ? unexpected : 'NONE');
  console.log('profilePhoto on ROOT with dummy URL:', photoOnRoot ? 'PASS' : 'FAIL');
  console.log('profilePhoto NOT in dynamicFields:', photoNotInDynamic ? 'PASS' : 'FAIL');
  console.log('phone_number updated:', afterDoc.phone_number === editedPhone ? 'PASS' : 'FAIL');
  console.log(
    'untouched email preserved:',
    stable(beforeDoc.email) === stable(afterDoc.email) ? 'PASS' : 'FAIL'
  );
  console.log(
    'untouched address preserved:',
    stable(beforeDoc.address) === stable(afterDoc.address) ? 'PASS' : 'FAIL'
  );
  console.log(
    'untouched employee_group_id preserved:',
    stable(beforeDoc.employee_group_id) === stable(afterDoc.employee_group_id) ? 'PASS' : 'FAIL'
  );

  const pass =
    photoOnRoot &&
    photoNotInDynamic &&
    afterDoc.phone_number === editedPhone &&
    unexpected.length === 0 &&
    stable(beforeDoc.email) === stable(afterDoc.email) &&
    stable(beforeDoc.address) === stable(afterDoc.address) &&
    stable(beforeDoc.employee_group_id) === stable(afterDoc.employee_group_id);

  // Restore
  await Employee.findOneAndUpdate(
    { emp_no: empNo },
    {
      phone_number: beforePhone,
      profilePhoto: beforePhoto ?? null,
      dynamicFields: beforeDoc.dynamicFields || {},
      updated_at: beforeDoc.updated_at || new Date(),
    }
  );
  const restored = await Employee.findOne({ emp_no: empNo }).select('phone_number profilePhoto').lean();
  console.log('\n========== RESTORED ==========');
  console.log({
    phone_number: restored.phone_number,
    profilePhoto: restored.profilePhoto || null,
  });

  console.log('\n========== OVERALL ==========');
  console.log(pass ? 'SUCCESS: partial edit behaved correctly' : 'FAILURE: see checks above');
  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
