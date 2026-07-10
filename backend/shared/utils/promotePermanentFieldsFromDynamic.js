/**
 * Promote permanent schema fields stored only in dynamicFields onto the top-level
 * document before verify / employee creation. Prevents legacy contact data loss.
 */

'use strict';

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
 * Remove permanent field keys from a dynamicFields object after promotion.
 */
function stripPromotedPermanentFieldsFromDynamic(dynamicFields = {}, permanentFieldNames = null) {
  if (!dynamicFields || typeof dynamicFields !== 'object') return {};
  const names = permanentFieldNames || getPermanentFieldNames();
  const next = { ...dynamicFields };
  for (const fieldName of names) {
    delete next[fieldName];
  }
  return next;
}

module.exports = {
  promotePermanentFieldsFromDynamic,
  stripPromotedPermanentFieldsFromDynamic,
};
