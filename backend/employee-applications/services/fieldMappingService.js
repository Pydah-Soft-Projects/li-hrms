/**
 * Field Mapping Service
 * Automatically extracts permanent fields from application/employee data
 * Prevents manual field listing and ensures all fields are included
 */

const Employee = require('../../employees/model/Employee');

/**
 * List of permanent field names in Employee model
 * Permanent employee fields stored in MongoDB
 * Excludes: _id, __v, timestamps, virtuals, dynamicFields
 */
const PERMANENT_FIELDS = [
  'emp_no',
  'employee_name',
  'division_id',
  'department_id',
  'designation_id',
  'employee_group_id',
  'doj',
  'dob',
  'gross_salary',
  'salaries',
  'gender',
  'marital_status',
  'blood_group',
  // qualifications is a root schema array (not dynamicFields)
  'qualifications',
  'experience',
  'address',
  'location',
  'aadhar_number',
  'phone_number',
  'alt_phone_number',
  'email',
  'pf_number',
  'esi_number',
  'bank_account_no',
  'bank_name',
  'bank_place',
  'ifsc_code',
  'paidLeaves',
  'allottedLeaves',
  'employeeAllowances',
  'employeeDeductions',
  'ctcSalary',
  'calculatedSalary',
  'is_active',
  'second_salary',
  'profilePhoto',
  'applyProfessionTax',
  'applyESI',
  'applyPF',
  'applyAttendanceDeduction',
  'deductLateIn',
  'deductEarlyOut',
  'deductPermission',
  'deductAbsent',
  // Weekday shift schedule: copied verbatim from application → employee on verification
  'weekdayShiftSchedule',
];

/**
 * Fields to exclude from permanent fields extraction
 */
const EXCLUDED_FIELDS = [
  '_id',
  '__v',
  'created_at',
  'updated_at',
  // Managed by notification endpoints; do not overwrite via employee profile updates.
  'pushSubscriptions',
  'dynamicFields',
  'createdBy',
  'approvedBy',
  'rejectedBy',
  'status',
  'proposedSalary',
  'approvedSalary',
  'approvalComments',
  'rejectionComments',
  'approvedAt',
  'rejectedAt',
  // Populated refs / UI meta — never persist into dynamicFields
  'division',
  'department',
  'designation',
  'employee_group',
  'employeeGroup',
  'Division',
  'Department',
  'Designation',
  'EmployeeGroup',
  'AllData',
  'allData',
  'GenQualifications',
  'AllAllowanceDeductions',
  'leave_stats',
  'payroll_stats',
  'isProfileRequest',
  'password',
  'plain_password',
];

/**
 * Get permanent field names from Employee schema dynamically
 * This ensures we always have the latest field list
 */
const getPermanentFieldNames = () => {
  try {
    const schema = Employee.schema;
    const paths = schema.paths;

    // Get all field names from schema
    const allFields = Object.keys(paths).filter((key) => {
      // Exclude virtuals, internal fields, and dynamicFields
      const path = paths[key];
      return (
        !key.startsWith('_') &&
        key !== '__v' &&
        key !== 'dynamicFields' &&
        !path.options?.virtual &&
        !EXCLUDED_FIELDS.includes(key)
      );
    });

    // Merge with predefined list to ensure we don't miss any
    const mergedFields = [...new Set([...PERMANENT_FIELDS, ...allFields])];

    return mergedFields.filter((field) => !EXCLUDED_FIELDS.includes(field));
  } catch (error) {
    console.error('Error getting permanent field names:', error);
    // Fallback to predefined list
    return PERMANENT_FIELDS;
  }
};

/**
 * Extract permanent fields from source data
 * Automatically maps all permanent fields, excluding dynamicFields and metadata
 * 
 * @param {Object} sourceData - Source data (application or employee)
 * @param {Object} overrides - Optional field overrides (e.g., approvedSalary -> gross_salary)
 * @returns {Object} Object containing only permanent fields
 */
exports.extractPermanentFields = (sourceData, overrides = {}) => {
  const permanentFieldNames = getPermanentFieldNames();
  const permanentFields = {};

  // Extract all permanent fields
  permanentFieldNames.forEach((fieldName) => {
    const value = sourceData[fieldName];
    // Skip undefined/null/empty-string so partial updates never wipe existing root values
    if (value !== undefined && value !== null && value !== '') {
      permanentFields[fieldName] = value;
    }
  });

  // Apply overrides (e.g., approvedSalary -> gross_salary)
  Object.keys(overrides).forEach((overrideKey) => {
    if (overrides[overrideKey] !== undefined && overrides[overrideKey] !== null) {
      permanentFields[overrideKey] = overrides[overrideKey];
    }
  });

  return permanentFields;
};

/**
 * Extract dynamic fields from source data
 * Returns all fields that are not permanent fields
 * 
 * @param {Object} sourceData - Source data
 * @param {Object} permanentFields - Already extracted permanent fields
 * @returns {Object} Object containing dynamic fields
 */
exports.extractDynamicFields = (sourceData, _permanentFields = null) => {
  // Always use the full schema permanent list — NOT only keys present in this payload.
  // Using Object.keys(extractedPermanent) wrongly treated missing permanent keys as dynamic.
  const permanentFieldNames = getPermanentFieldNames();
  const dynamicFields = {};

  Object.keys(sourceData || {}).forEach((key) => {
    if (
      !permanentFieldNames.includes(key) &&
      !EXCLUDED_FIELDS.includes(key) &&
      !key.startsWith('_') &&
      key !== '__v' &&
      key !== 'dynamicFields'
    ) {
      dynamicFields[key] = sourceData[key];
    }
  });

  return dynamicFields;
};

/**
 * Transform application data to employee data
 * Separates permanent fields and dynamicFields automatically
 * 
 * @param {Object} applicationData - Employee application data
 * @param {Object} overrides - Optional overrides (e.g., { gross_salary: approvedSalary })
 * @returns {Object} { permanentFields, dynamicFields }
 */
exports.transformApplicationToEmployee = (applicationData, overrides = {}) => {
  const { applyWeekdayShiftScheduleToPayload } = require('../../shared/utils/weekdayShiftScheduleUtils');
  const {
    promotePermanentFieldsFromDynamic,
    stripPromotedPermanentFieldsFromDynamic,
  } = require('../../shared/utils/promotePermanentFieldsFromDynamic');

  const promotedSource = promotePermanentFieldsFromDynamic(applicationData);

  // Extract permanent fields
  const permanentFields = exports.extractPermanentFields(promotedSource, overrides);

  // Extract dynamic fields (from dynamicFields or from root level)
  let dynamicFields = {};

  // If dynamicFields exists in application, use it
  if (promotedSource.dynamicFields && typeof promotedSource.dynamicFields === 'object') {
    dynamicFields = { ...promotedSource.dynamicFields };
  }

  // Also check for any fields in root that should be dynamic
  const rootDynamicFields = exports.extractDynamicFields(promotedSource, permanentFields);
  if (Object.keys(rootDynamicFields).length > 0) {
    dynamicFields = { ...dynamicFields, ...rootDynamicFields };
  }

  dynamicFields = stripPromotedPermanentFieldsFromDynamic(dynamicFields);

  const normalized = applyWeekdayShiftScheduleToPayload(permanentFields, dynamicFields, promotedSource);

  return {
    permanentFields: normalized.permanentFields,
    dynamicFields: Object.keys(normalized.dynamicFields).length > 0 ? normalized.dynamicFields : {},
  };
};

/**
 * Get permanent field names (for reference)
 */
exports.getPermanentFieldNames = getPermanentFieldNames;

/**
 * Resolve qualification field IDs to Labels
 * 
 * @param {Array} qualifications - Array of qualification objects
 * @param {Object} settings - EmployeeApplicationFormSettings object
 * @returns {Array} Qualifications with resolved labels
 */
exports.resolveQualificationLabels = (qualifications, settings) => {
  if (!qualifications || !Array.isArray(qualifications) || qualifications.length === 0) {
    return [];
  }

  if (!settings || !settings.qualifications || !settings.qualifications.fields) {
    console.log('[resolveQualificationLabels] No qualifications config in settings');
    return qualifications;
  }

  // Create ID -> Label map
  const fieldMap = {};
  settings.qualifications.fields.forEach(field => {
    if (field.id && field.label) {
      fieldMap[field.id] = field.label;
    }
  });

  console.log('[resolveQualificationLabels] Field Mapping:', JSON.stringify(fieldMap));

  const resolved = qualifications.map((qual, index) => {
    const resolvedQual = {};

    Object.keys(qual).forEach(key => {
      const lowerKey = key.toLowerCase();
      // Explicitly preserve certificate fields with correct camelCase
      if (lowerKey === 'certificateurl') {
        resolvedQual['certificateUrl'] = qual[key];
        return;
      }
      if (lowerKey === 'certificatefile') {
        resolvedQual['certificateFile'] = qual[key];
        return;
      }

      // If key matches a field ID, use the label
      if (fieldMap[key]) {
        resolvedQual[fieldMap[key]] = qual[key];
      } else {
        // Otherwise check if it's already a label (or unknown key) and keep it
        resolvedQual[key] = qual[key];
      }
    });

    console.log(`[resolveQualificationLabels] Resolved [${index}]:`, JSON.stringify(resolvedQual));
    return resolvedQual;
  });

  return resolved;
};

/**
 * Map Qualification Labels back to Field IDs for robust storage
 * 
 * @param {Array} qualifications - Array of qualification objects (with Labels as keys)
 * @param {Object} settings - EmployeeApplicationFormSettings object
 * @returns {Array} Qualifications with Field IDs as keys
 */
exports.mapQualificationsLabelsToIds = (qualifications, settings) => {
  if (!qualifications || !Array.isArray(qualifications) || qualifications.length === 0) {
    return [];
  }

  if (!settings || !settings.qualifications || !settings.qualifications.fields) {
    console.log('[mapQualificationsLabelsToIds] No qualifications config in settings');
    return qualifications;
  }

  // Create Label -> ID map (Case-insensitive for robustness)
  const labelToIdMap = {};
  settings.qualifications.fields.forEach(field => {
    if (field.id && field.label) {
      labelToIdMap[field.label.toLowerCase()] = field.id;
    }
  });

  console.log('[mapQualificationsLabelsToIds] Label To ID Mapping:', JSON.stringify(labelToIdMap));

  const mapped = qualifications.map((qual, index) => {
    const mappedQual = {};

    Object.keys(qual).forEach(key => {
      const lowerKey = key.toLowerCase();

      // Explicitly preserve certificate fields
      if (lowerKey === 'certificateurl') {
        mappedQual['certificateUrl'] = qual[key];
        return;
      }
      if (lowerKey === 'certificatefile') {
        mappedQual['certificateFile'] = qual[key];
        return;
      }

      // Check if key is a known Label
      if (labelToIdMap[lowerKey]) {
        mappedQual[labelToIdMap[lowerKey]] = qual[key];
      } else {
        // Otherwise keep original key (e.g. certificateUrl, or already an ID)
        mappedQual[key] = qual[key];
      }
    });

    return mappedQual;
  });

  return mapped;
};

