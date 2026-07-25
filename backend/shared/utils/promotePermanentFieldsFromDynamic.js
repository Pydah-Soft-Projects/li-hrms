/**
 * Promote permanent schema fields stored only in dynamicFields onto the top-level
 * document before verify / employee creation / updates. Prevents legacy data loss
 * and keeps permanent fields off dynamicFields.
 */

'use strict';

/** camelCase / alias keys that must never live in dynamicFields when a snake_case permanent exists */
const PERMANENT_ALIAS_KEYS = [
  'bankAccountNo',
  'bankName',
  'bankPlace',
  'ifscCode',
  'salaryMode',
  'secondSalary',
  'profile_photo',
  'employeeGroupId',
  'employee_group',
  'divisionId',
  'departmentId',
  'designationId',
];

function getPermanentFieldNames() {
  // Lazy require avoids circular dependency with fieldMappingService
  return require('../../employee-applications/services/fieldMappingService').getPermanentFieldNames();
}

function isEmptyValue(value) {
  return value === undefined || value === null || value === '';
}

/**
 * @param {Object} sourceData - Application or employee-like document
 * @returns {Object} Shallow copy with permanent fields filled from dynamicFields when top-level is empty
 */
function promotePermanentFieldsFromDynamic(sourceData = {}) {
  const promoted = { ...sourceData };
  const dynamicFields = sourceData?.dynamicFields;
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return promoted;
  }

  const permanentFieldNames = getPermanentFieldNames();
  for (const fieldName of permanentFieldNames) {
    if (!isEmptyValue(promoted[fieldName])) continue;
    const dynVal = dynamicFields[fieldName];
    if (!isEmptyValue(dynVal)) {
      promoted[fieldName] = dynVal;
    }
  }

  return promoted;
}

/**
 * Remove permanent field keys (and known aliases) from a dynamicFields object after promotion.
 */
function stripPromotedPermanentFieldsFromDynamic(dynamicFields = {}, permanentFieldNames = null) {
  if (!dynamicFields || typeof dynamicFields !== 'object') return {};
  const names = permanentFieldNames || getPermanentFieldNames();
  const next = { ...dynamicFields };
  for (const fieldName of names) {
    delete next[fieldName];
  }
  for (const alias of PERMANENT_ALIAS_KEYS) {
    delete next[alias];
  }
  return next;
}

/**
 * Split an updates map into permanent root updates vs dynamicFields updates.
 * Permanent keys are never written into dynamicFields.
 *
 * @param {Object} updates - field -> value
 * @param {Object} [existingDynamicFields]
 * @param {Object} [fieldMapping] - alias -> actualKey (e.g. personal_email -> email)
 * @returns {{ permanentUpdates: Object, dynamicUpdates: Object }}
 */
function splitUpdatesIntoPermanentAndDynamic(updates = {}, existingDynamicFields = {}, fieldMapping = {}) {
  const permanentFieldNames = new Set(getPermanentFieldNames());
  const permanentUpdates = {};
  const dynamicUpdates = { ...(existingDynamicFields || {}) };

  for (const key of Object.keys(updates || {})) {
    const actualKey = fieldMapping[key] || key;
    const value = updates[key];

    if (permanentFieldNames.has(actualKey)) {
      permanentUpdates[actualKey] = value;
      delete dynamicUpdates[actualKey];
    } else if (PERMANENT_ALIAS_KEYS.includes(actualKey) || PERMANENT_ALIAS_KEYS.includes(key)) {
      // Known alias of a permanent field — do not stash under dynamicFields
      // Caller should map aliases; if unmapped, drop from dynamic to avoid pollution
      delete dynamicUpdates[actualKey];
      delete dynamicUpdates[key];
    } else {
      dynamicUpdates[actualKey] = value;
    }
  }

  return {
    permanentUpdates,
    dynamicUpdates: stripPromotedPermanentFieldsFromDynamic(dynamicUpdates),
  };
}

module.exports = {
  promotePermanentFieldsFromDynamic,
  stripPromotedPermanentFieldsFromDynamic,
  splitUpdatesIntoPermanentAndDynamic,
  PERMANENT_ALIAS_KEYS,
};
