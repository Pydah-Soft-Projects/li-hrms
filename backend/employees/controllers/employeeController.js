/**
 * Employee Controller
 * Handles employee operations via MongoDB
 */

const Employee = require('../model/Employee');
const EmployeeUpdateApplication = require('../../employee-updates/model/EmployeeUpdateApplication');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const Division = require('../../departments/model/Division');
const Settings = require('../../settings/model/Settings');
const EmployeeApplicationFormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
const User = require('../../users/model/User');
const {
  validateFormData,
} = require('../../employee-applications/services/formValidationService');
const {
  extractPermanentFields,
  extractDynamicFields,
  resolveQualificationLabels,
  mapQualificationsLabelsToIds,
  getPermanentFieldNames,
} = require('../../employee-applications/services/fieldMappingService');
const {
  promotePermanentFieldsFromDynamic,
  stripPromotedPermanentFieldsFromDynamic,
} = require('../../shared/utils/promotePermanentFieldsFromDynamic');
const { resolveForEmployee } = require('../../payroll/services/allowanceDeductionResolverService');
const mongoose = require('mongoose');
const { compareEmpNo, EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');
const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
const fileStorageService = require('../../shared/services/fileStorageService');
const { resolveRequestOrigin } = require('../../shared/utils/fileStorageConfig');
const { getNextEmpNo } = require('../services/empNoService');
const EmployeeHistory = require('../model/EmployeeHistory');
const { closeCurrentTenure } = require('../services/employmentTenureService');
const { initializeEmployeeLeaves } = require('../../leaves/services/employeeLeaveInitializationService');
const {
  stripEmployeeGroupIfDisabled,
  validateEmployeeGroupIfEnabled,
} = require('../../shared/utils/customEmployeeGrouping');
const streamingExportService = require('../../shared/services/streamingExportService');
const {
  normalizeEmployeeSalariesPayload,
  stripSalaryKeysFromDynamicField,
  getSalariesGroupFieldIds,
} = require('../utils/employeeSalariesNormalize');
const { normalizeNotificationArrayFields } = require('../utils/notificationPayloadNormalization');
const { enforceSecondSalaryOnPayload } = require('../utils/employeeFeatureAccess');
const { getQualificationSettingsForScope } = require('../../employee-applications/services/qualificationProfileService');

/**
 * Normalize web-push subscriptions from multipart/form payloads.
 * Some clients send `pushSubscriptions` as a JSON string (e.g. "[]"), which
 * must be converted to an array to avoid Mongoose embedded-cast failures.
 */
const normalizePushSubscriptionsPayload = (employeeData) => {
  if (!employeeData || typeof employeeData !== 'object') return;
  normalizeNotificationArrayFields(employeeData);
};

// ============== Helper Functions ==============

/**
 * Process qualifications with S3 uploads and label resolution
 */
const processQualifications = async (req, settings) => {
  let qualifications = [];
  try {
    // Parse if string (from FormData) or use as is
    const raw = req.body.qualifications;
    if (typeof raw === 'string') {
      qualifications = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      qualifications = raw;
    }
  } catch (e) {
    console.error('[EmployeeController] Error parsing qualifications:', e);
    return [];
  }

  // Handle S3 Uploads
  if (req.files && req.files.length > 0) {
    console.log(`[EmployeeController] Processing ${req.files.length} files`);
    console.log('[EmployeeController] Files received:', req.files.map(f => f.fieldname));

    // Map files for easy access
    // Expecting fieldname "qualification_cert_{index}"
    const fileMap = {};
    req.files.forEach(f => {
      fileMap[f.fieldname] = f;
    });

    for (let i = 0; i < qualifications.length; i++) {
      const file = fileMap[`qualification_cert_${i}`];
      if (file) {
        console.log(`[EmployeeController] Found file for qualification index [${i}]`);
        try {
          // Pass buffer, originalname, mimetype, and specify 'hrms/certificates' folder
          const uploadResult = await fileStorageService.upload(
            file.buffer,
            file.originalname,
            file.mimetype,
            'hrms/certificates',
            { origin: resolveRequestOrigin(req) }
          );

          qualifications[i].certificateUrl = uploadResult;
          console.log(`[EmployeeController] Upload success for index ${i}: ${uploadResult}`);
        } catch (uploadErr) {
          console.error(`[EmployeeController] Failed to upload cert for index ${i}:`, uploadErr);
        }
      } else {
        console.log(`[EmployeeController] No file for qualification index [${i}]`);
      }
    }
  } else {
    console.log('[EmployeeController] No files received in request');
  }

  // Resolve Labels -> Field IDs for Robust Storage (Reverse Mapping)
  if (settings && qualifications.length > 0) {
    console.log('[EmployeeController] Reversing labels to Field IDs for storage');
    qualifications = mapQualificationsLabelsToIds(qualifications, settings);
  }

  return qualifications;
};

const EMPLOYEE_SETTINGS_TTL_MS = 5 * 60 * 1000;
let employeeSettingsCache = { at: 0, value: null };

/**
 * Get employee settings from database (short TTL cache for list endpoints)
 */
const getEmployeeSettings = async () => {
  if (employeeSettingsCache.value && Date.now() - employeeSettingsCache.at < EMPLOYEE_SETTINGS_TTL_MS) {
    return employeeSettingsCache.value;
  }

  try {
    const autoGenSetting = await Settings.findOne({ key: 'auto_generate_employee_number' });

    const autoGenerateEmployeeNumber = autoGenSetting?.value === true
      || autoGenSetting?.value === 'true';

    const settings = {
      dataSource: 'mongodb',
      deleteTarget: 'mongodb',
      auto_generate_employee_number: autoGenerateEmployeeNumber,
    };
    employeeSettingsCache = { at: Date.now(), value: settings };
    return settings;
  } catch (error) {
    console.error('Error getting employee settings:', error);
    return { dataSource: 'mongodb', deleteTarget: 'mongodb', auto_generate_employee_number: false };
  }
};

/**
 * Convert MongoDB employee to plain object for response
 */
const toPlainObject = (doc) => {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : doc;
};

/**
 * Populate user ObjectIds in dynamicFields (e.g., reporting_to)
 * 
 * @param {Object} dynamicFields - Dynamic fields object
 * @returns {Object} Dynamic fields with populated users
 */
const extractReportingToUserIdStrings = (reportingToField) => {
  if (!Array.isArray(reportingToField) || reportingToField.length === 0) return [];
  const userIds = [];
  for (const id of reportingToField) {
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      userIds.push(id);
    } else if (id && typeof id === 'object') {
      if (id._id && mongoose.Types.ObjectId.isValid(id._id)) {
        userIds.push(id._id.toString());
      } else if (mongoose.Types.ObjectId.isValid(id)) {
        userIds.push(id.toString());
      }
    } else if (id && id.toString && typeof id.toString === 'function') {
      const idStr = id.toString();
      if (mongoose.Types.ObjectId.isValid(idStr)) userIds.push(idStr);
    }
  }
  return userIds;
};

const resolveReportingToWithUserMap = (reportingToField, userMap) => {
  return reportingToField.map((id) => {
    let idStr;
    if (typeof id === 'string') {
      idStr = id;
    } else if (id && typeof id === 'object') {
      if (id._id) idStr = id._id.toString();
      else if (id.toString && typeof id.toString === 'function') idStr = id.toString();
      else idStr = String(id);
    } else {
      idStr = String(id);
    }
    const user = userMap.get(idStr);
    if (user) return user;
    if (typeof id === 'object' && id._id) {
      const userById = userMap.get(id._id.toString());
      if (userById) return userById;
    }
    return id;
  });
};

const buildUserMapForEmployeeDocs = async (employees) => {
  const allIds = new Set();
  for (const employee of employees) {
    const plainObj = toPlainObject(employee);
    const dynamicFields = plainObj.dynamicFields;
    const reportingToField =
      plainObj.reporting_to ||
      plainObj.reporting_to_ ||
      dynamicFields?.reporting_to ||
      dynamicFields?.reporting_to_;
    extractReportingToUserIdStrings(reportingToField).forEach((id) => allIds.add(id));
  }
  if (allIds.size === 0) return new Map();

  const objectIds = [...allIds]
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);

  if (objectIds.length === 0) return new Map();

  const users = await User.find({ _id: { $in: objectIds } })
    .select('_id name email role')
    .lean();

  const userMap = new Map();
  users.forEach((u) => {
    userMap.set(u._id.toString(), u);
    userMap.set(String(u._id), u);
  });
  return userMap;
};

const populateUsersInDynamicFields = async (dynamicFields, prefetchedUserMap = null) => {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return dynamicFields || {};
  }

  const populated = { ...dynamicFields };
  const reportingToField = populated.reporting_to || populated.reporting_to_;

  if (reportingToField && Array.isArray(reportingToField) && reportingToField.length > 0) {
    try {
      const fieldName = populated.reporting_to ? 'reporting_to' : 'reporting_to_';
      const isAlreadyPopulated =
        reportingToField[0] && typeof reportingToField[0] === 'object' && reportingToField[0].name;

      if (!isAlreadyPopulated) {
        const userIds = extractReportingToUserIdStrings(reportingToField);
        if (userIds.length > 0) {
          let userMap = prefetchedUserMap;
          if (!userMap) {
            const objectIds = userIds
              .map((id) => {
                try {
                  return new mongoose.Types.ObjectId(id);
                } catch (e) {
                  return null;
                }
              })
              .filter(Boolean);
            if (objectIds.length > 0) {
              const users = await User.find({ _id: { $in: objectIds } })
                .select('_id name email role')
                .lean();
              userMap = new Map();
              users.forEach((u) => {
                userMap.set(u._id.toString(), u);
                userMap.set(String(u._id), u);
              });
            } else {
              userMap = new Map();
            }
          }
          if (userMap && userMap.size > 0) {
            populated[fieldName] = resolveReportingToWithUserMap(reportingToField, userMap);
          }
        }
      }
    } catch (error) {
      console.error('Error populating users in reporting_to:', error.message);
    }
  }

  return populated;
};

const EMPLOYEE_SUMMARY_SELECT =
  '_id emp_no employee_name division_id department_id designation_id employee_group_id is_active leftDate profilePhoto dob phone_number email';

/** Fields required by the employees grid (no dynamicFields / salary components). */
const EMPLOYEE_LIST_SELECT =
  `${EMPLOYEE_SUMMARY_SELECT} gross_salary qualificationStatus salaryStatus`;

const mapSummaryEmployeeRow = (emp) => ({
  _id: emp._id,
  emp_no: emp.emp_no,
  employee_name: emp.employee_name,
  division_id: emp.division_id,
  department_id: emp.department_id,
  designation_id: emp.designation_id,
  employee_group_id: emp.employee_group_id,
  division: emp.division_id,
  department: emp.department_id,
  designation: emp.designation_id,
  employee_group: emp.employee_group_id,
  is_active: emp.is_active,
  leftDate: emp.leftDate,
  profilePhoto: emp.profilePhoto,
  dob: emp.dob,
  phone_number: emp.phone_number,
  email: emp.email,
});

const mapListEmployeeRow = (emp) => ({
  ...mapSummaryEmployeeRow(emp),
  gross_salary:
    emp.gross_salary !== undefined && emp.gross_salary !== null ? Number(emp.gross_salary) : null,
  qualificationStatus: emp.qualificationStatus || 'not_submitted',
  salaryStatus: emp.salaryStatus || null,
});

const applyDepartmentIdFilter = (filters, department_id, department_ids) => {
  const raw = department_ids || department_id;
  if (!raw) return;
  const ids = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 1) {
    filters.department_id = ids[0];
  } else if (ids.length > 1) {
    filters.department_id = { $in: ids };
  }
};

const buildActiveEmployeeFilters = (reqQuery, scopeFilter) => {
  const {
    is_active,
    division_id,
    divisionId,
    department_id,
    department_ids,
    designation_id,
    employee_group_id,
    includeLeft,
    startDate,
    endDate,
    search,
  } = reqQuery;

  const filters = { ...scopeFilter };
  if (is_active !== undefined) filters.is_active = is_active === 'true';
  if (division_id || divisionId) filters.division_id = division_id || divisionId;
  applyDepartmentIdFilter(filters, department_id, department_ids);
  if (designation_id) filters.designation_id = designation_id;
  if (employee_group_id) filters.employee_group_id = employee_group_id;

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filters.$or = [
      { emp_no: searchRegex },
      { employee_name: searchRegex },
      { phone_number: searchRegex },
      { email: searchRegex },
    ];
  }

  if (startDate && endDate) {
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    if (!Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
      rangeStart.setUTCHours(0, 0, 0, 0);
      rangeEnd.setUTCHours(23, 59, 59, 999);
      filters.$and = filters.$and || [];
      filters.$and.push({ $or: [{ doj: null }, { doj: { $lte: rangeEnd } }] });
      filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: rangeStart } }] });
    }
  } else if (includeLeft !== 'true') {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    filters.$and = filters.$and || [];
    filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: startOfToday } }] });
  }

  return filters;
};

const mapFullEmployeeListRow = (transformed) => ({
  ...transformed,
  division: transformed.division_id,
  department: transformed.department_id,
  designation: transformed.designation_id,
  employee_group: transformed.employee_group_id,
  paidLeaves:
    transformed.paidLeaves !== undefined && transformed.paidLeaves !== null
      ? Number(transformed.paidLeaves)
      : 0,
  allottedLeaves:
    transformed.allottedLeaves !== undefined && transformed.allottedLeaves !== null
      ? Number(transformed.allottedLeaves)
      : 0,
  employeeAllowances: transformed.employeeAllowances || [],
  employeeDeductions: transformed.employeeDeductions || [],
  ctcSalary:
    transformed.ctcSalary !== undefined && transformed.ctcSalary !== null
      ? Number(transformed.ctcSalary)
      : null,
  calculatedSalary:
    transformed.calculatedSalary !== undefined && transformed.calculatedSalary !== null
      ? Number(transformed.calculatedSalary)
      : null,
});

/**
 * Transform employee data for API response
 * Merges permanent fields and dynamicFields for unified access
 * 
 * @param {Object} employee - Employee document or plain object
 * @param {Boolean} populateUsers - Whether to populate user ObjectIds in dynamicFields
 * @returns {Object} Transformed employee data
 */
const transformEmployeeForResponse = async (employee, populateUsers = true, prefetchedUserMap = null) => {
  if (!employee) return null;

  const plainObj = toPlainObject(employee);
  const { dynamicFields, ...permanentFields } = plainObj;

  // Populate users in dynamicFields if needed
  let populatedDynamicFields = dynamicFields || {};
  if (populateUsers && dynamicFields) {
    populatedDynamicFields = await populateUsersInDynamicFields(dynamicFields, prefetchedUserMap);
  }

  const salariesOut =
    permanentFields.salaries && typeof permanentFields.salaries === 'object' && !Array.isArray(permanentFields.salaries)
      ? { ...permanentFields.salaries }
      : {};
  if (populatedDynamicFields.salaries !== undefined) {
    const { salaries: _rm, ...restDf } = populatedDynamicFields;
    populatedDynamicFields = restDf;
  }

  // Merge dynamicFields into root level (dynamicFields act as fallback)
  // Permanent fields (Source of Truth) must overwrite dynamicFields
  const merged = {
    ...populatedDynamicFields,
    ...permanentFields,
    salaries: salariesOut,
    dynamicFields: populatedDynamicFields,
  };

  // Schema-level employeeAllowances/employeeDeductions must not be overwritten by dynamicFields
  // (dynamicFields can contain stale empty arrays; prefer the actual schema arrays)
  if (Array.isArray(permanentFields.employeeAllowances)) {
    merged.employeeAllowances = permanentFields.employeeAllowances;
  }
  if (Array.isArray(permanentFields.employeeDeductions)) {
    merged.employeeDeductions = permanentFields.employeeDeductions;
  }

  // Normalize reporting_to_ to reporting_to (handle field name inconsistency)
  // Ensure we move data if standard field is present but empty
  if (merged.reporting_to_) {
    if (!merged.reporting_to || !Array.isArray(merged.reporting_to) || merged.reporting_to.length === 0) {
      if (Array.isArray(merged.reporting_to_) && merged.reporting_to_.length > 0) {
        merged.reporting_to = merged.reporting_to_;
      }
    }
    delete merged.reporting_to_;
  }

  if (merged.dynamicFields) {
    if (merged.dynamicFields.reporting_to_) {
      if (!merged.dynamicFields.reporting_to || !Array.isArray(merged.dynamicFields.reporting_to) || merged.dynamicFields.reporting_to.length === 0) {
        if (Array.isArray(merged.dynamicFields.reporting_to_) && merged.dynamicFields.reporting_to_.length > 0) {
          merged.dynamicFields.reporting_to = merged.dynamicFields.reporting_to_;
        }
      }
      delete merged.dynamicFields.reporting_to_;
    }
  }

  // Also populate reporting_to if it exists at root level (from previous merge)
  const rootReportingTo = merged.reporting_to;
  if (populateUsers && rootReportingTo && Array.isArray(rootReportingTo) && rootReportingTo.length > 0) {
    const isAlreadyPopulated = rootReportingTo[0] && typeof rootReportingTo[0] === 'object' && rootReportingTo[0].name;
    if (!isAlreadyPopulated) {
      const populatedRoot = await populateUsersInDynamicFields(
        { reporting_to: rootReportingTo },
        prefetchedUserMap
      );
      merged.reporting_to = populatedRoot.reporting_to;
      // Also update in dynamicFields
      if (merged.dynamicFields) {
        merged.dynamicFields.reporting_to = populatedRoot.reporting_to;
      }
    }
  }

  return merged;
};

// ============== Controller Methods ==============

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private
 */
exports.getAllEmployees = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      view = 'full',
    } = req.query;
    const { scopeFilter } = req;
    const settings = await getEmployeeSettings();
    const isSummaryView = view === 'summary';
    const isListView = view === 'list';

    let employees = [];
    const limitNum = parseInt(limit, 10);
    const pageNum = parseInt(page, 10);
    const skip = (pageNum - 1) * limitNum;
    const filters = buildActiveEmployeeFilters(req.query, scopeFilter);

    const query = { ...filters };

    let employeeQuery = Employee.find(query)
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .populate('employee_group_id', 'name code isActive')
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION)
      .skip(skip)
      .limit(limitNum);

    if (isSummaryView) {
      employeeQuery = employeeQuery.select(EMPLOYEE_SUMMARY_SELECT);
    } else if (isListView) {
      employeeQuery = employeeQuery.select(EMPLOYEE_LIST_SELECT);
    }
    employeeQuery = employeeQuery.lean();

    const [total, mongoEmployees] = await Promise.all([
      Employee.countDocuments(query),
      employeeQuery,
    ]);

    if (isSummaryView) {
      employees = mongoEmployees.map(mapSummaryEmployeeRow);
    } else if (isListView) {
      employees = mongoEmployees.map(mapListEmployeeRow);
    } else {
      const userMap = await buildUserMapForEmployeeDocs(mongoEmployees);
      employees = await Promise.all(
        mongoEmployees.map(async (emp) => {
          const transformed = await transformEmployeeForResponse(emp, true, userMap);
          return mapFullEmployeeListRow(transformed);
        })
      );
    }

    const responseView = isSummaryView ? 'summary' : isListView ? 'list' : 'full';

    res.status(200).json({
      success: true,
      count: employees.length,
      view: responseView,
      dataSource: settings.dataSource,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data: employees,
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employees',
      error: error.message,
    });
  }
};

/**
 * @desc    Scoped lean list for birthday UI (only employees with DOB; minimal fields)
 * @route   GET /api/employees/birthdays-summary
 * @access  Private (same scope as employee list)
 */
exports.getBirthdaysSummary = async (req, res) => {
  try {
    const { includeLeft, today } = req.query;
    const scopeFilter = req.scopeFilter || {};
    const settings = await getEmployeeSettings();

    const filters = { ...scopeFilter };
    if (includeLeft !== 'true') {
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      filters.$and = filters.$and || [];
      filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: startOfToday } }] });
    }
    filters.dob = { $exists: true, $ne: null };

    if (today === 'true') {
      const now = new Date();
      filters.$expr = {
        $and: [
          { $eq: [{ $month: '$dob' }, now.getMonth() + 1] },
          { $eq: [{ $dayOfMonth: '$dob' }, now.getDate()] },
        ],
      };
    }

    const mapMongoBirthdayRow = (emp) => ({
      _id: emp._id,
      emp_no: emp.emp_no,
      employee_name: emp.employee_name,
      dob: emp.dob,
      division_id: emp.division_id,
      department_id: emp.department_id,
      designation_id: emp.designation_id,
      division: emp.division_id,
      department: emp.department_id,
      designation: emp.designation_id,
    });

    const query = { ...filters };
    const mongoEmployees = await Employee.find(query)
      .select('_id emp_no employee_name dob division_id department_id designation_id')
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION)
      .lean();
    const data = mongoEmployees.map(mapMongoBirthdayRow);

    res.status(200).json({
      success: true,
      count: data.length,
      dataSource: settings.dataSource,
      data,
    });
  } catch (error) {
    console.error('[EmployeeController] Error fetching birthdays summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching birthdays summary',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single employee
 * @route   GET /api/employees/:empNo
 * @access  Private
 */
exports.getEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const settings = await getEmployeeSettings();

    let employee = null;

    const mongoEmployee = await Employee.findOne({ emp_no: empNo })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .populate('employee_group_id', 'name code isActive');

    if (mongoEmployee) {
      const transformed = await transformEmployeeForResponse(mongoEmployee, true);
      employee = {
        ...transformed,
        division: transformed.division_id,
        department: transformed.department_id,
        designation: transformed.designation_id,
        employee_group: transformed.employee_group_id,
        paidLeaves: transformed.paidLeaves !== undefined && transformed.paidLeaves !== null ? Number(transformed.paidLeaves) : 0,
        allottedLeaves: transformed.allottedLeaves !== undefined && transformed.allottedLeaves !== null ? Number(transformed.allottedLeaves) : 0,
        employeeAllowances: transformed.employeeAllowances || [],
        employeeDeductions: transformed.employeeDeductions || [],
        ctcSalary: transformed.ctcSalary !== undefined && transformed.ctcSalary !== null ? Number(transformed.ctcSalary) : null,
        calculatedSalary: transformed.calculatedSalary !== undefined && transformed.calculatedSalary !== null ? Number(transformed.calculatedSalary) : null,
      };
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    res.status(200).json({
      success: true,
      dataSource: settings.dataSource,
      data: employee,
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Create employee
 * @route   POST /api/employees
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.createEmployee = async (req, res) => {
  try {
    const { passwordMode, notificationChannels, ...employeeData } = req.body;
    normalizePushSubscriptionsPayload(employeeData);

    const settings = await getEmployeeSettings();
    const autoGenerate = settings.auto_generate_employee_number === true;
    const empNoBlank = employeeData.emp_no == null || String(employeeData.emp_no || '').trim() === '';

    if (autoGenerate && empNoBlank) {
      employeeData.emp_no = await getNextEmpNo();
    } else if (!autoGenerate && empNoBlank) {
      return res.status(400).json({
        success: false,
        message: 'Employee number (emp_no) is required when auto-generate is off',
      });
    }

    if (!employeeData.employee_name) {
      return res.status(400).json({
        success: false,
        message: 'Employee name is required',
      });
    }

    if (!employeeData.division_id) {
      return res.status(400).json({
        success: false,
        message: 'Division is required for new employees',
      });
    }

    await enforceSecondSalaryOnPayload(req.user, employeeData);

    // Check if employee already exists in MongoDB
    const existingMongo = await Employee.findOne({ emp_no: String(employeeData.emp_no || '').toUpperCase() });
    if (existingMongo) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this employee number already exists',
      });
    }

    // Validate department if provided
    if (employeeData.department_id) {
      const dept = await Department.findById(employeeData.department_id);
      if (!dept) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department ID',
        });
      }
    }

    // Validate designation if provided
    if (employeeData.designation_id) {
      const desig = await Designation.findById(employeeData.designation_id);
      if (!desig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid designation ID',
        });
      }

      // Check if division is valid
      if (employeeData.division_id) {
        const div = await Division.findById(employeeData.division_id);
        if (!div) {
          return res.status(400).json({
            success: false,
            message: 'Invalid division ID',
          });
        }
      }

      // Auto-link designation to department if not already linked
      if (employeeData.department_id) {
        const department = await Department.findById(employeeData.department_id);
        const designationIdStr = employeeData.designation_id.toString();
        const isLinked = department.designations.some(d => d.toString() === designationIdStr);

        if (department && !isLinked) {
          await Department.findByIdAndUpdate(
            employeeData.department_id,
            { $addToSet: { designations: employeeData.designation_id } }
          );
          console.log(`[createEmployee] Auto-linked designation ${desig.name} to department ${department.name}`);
        }
      }
    }

    await stripEmployeeGroupIfDisabled(employeeData);
    const groupErrCreate = await validateEmployeeGroupIfEnabled(employeeData.employee_group_id);
    if (groupErrCreate) {
      return res.status(400).json({
        success: false,
        message: groupErrCreate.error,
      });
    }

    // Separate permanent fields and dynamicFields
    const permanentFields = extractPermanentFields(employeeData);

    // 1. Extract dynamic fields from root level
    const extractedDynamic = extractDynamicFields(employeeData, permanentFields);

    // 2. Parse dynamicFields object if present
    let dynamicFields = {};
    if (employeeData.dynamicFields) {
      try {
        const nested = typeof employeeData.dynamicFields === 'string'
          ? JSON.parse(employeeData.dynamicFields)
          : employeeData.dynamicFields;
        dynamicFields = { ...nested };
      } catch (e) {
        console.warn('Failed to parse dynamicFields in createEmployee:', e.message);
      }
    }

    // 3. Merge: root-level fields take precedence
    dynamicFields = { ...dynamicFields, ...extractedDynamic };

    // 4. Parse specific Fields that should be arrays
    const arrayFields = ['reporting_to', 'reporting_to_'];
    arrayFields.forEach(field => {
      if (dynamicFields[field] && typeof dynamicFields[field] === 'string') {
        try {
          dynamicFields[field] = JSON.parse(dynamicFields[field]);
        } catch (e) {
          console.warn(`Failed to parse ${field} in dynamicFields:`, e.message);
        }
      }
    });

    // 5. Normalize: Always use 'reporting_to', eliminate 'reporting_to_'
    if (dynamicFields.reporting_to_ && Array.isArray(dynamicFields.reporting_to_) && dynamicFields.reporting_to_.length > 0) {
      if (!dynamicFields.reporting_to || !Array.isArray(dynamicFields.reporting_to) || dynamicFields.reporting_to.length === 0) {
        dynamicFields.reporting_to = dynamicFields.reporting_to_;
      }
    }
    delete dynamicFields.reporting_to_;

    // 6. Generic JSON Parsing for any other array/object fields (from multipart/form-data)
    Object.keys(dynamicFields).forEach(key => {
      if (typeof dynamicFields[key] === 'string') {
        const val = dynamicFields[key].trim();
        if (val.startsWith('[') || val.startsWith('{')) {
          try {
            dynamicFields[key] = JSON.parse(val);
            console.log(`[createEmployee] Parsed dynamic field "${key}" from JSON string`);
          } catch (e) {
            // keep as string if parsing fails
          }
        }
      }
    });

    // Normalize bank details from camelCase to snake_case if present
    const bankFields = [
      { snake: 'bank_account_no', camel: 'bankAccountNo' },
      { snake: 'bank_name', camel: 'bankName' },
      { snake: 'bank_place', camel: 'bankPlace' },
      { snake: 'ifsc_code', camel: 'ifscCode' },
      { snake: 'salary_mode', camel: 'salaryMode' },
      { snake: 'second_salary', camel: 'secondSalary' }
    ];

    bankFields.forEach(({ snake, camel }) => {
      // Check permanentFields first, then dynamicFields, then input root
      let value = permanentFields[snake];

      // If not in permanentFields (snake), checks input under camelCase
      if (value === undefined && employeeData[camel] !== undefined) {
        value = employeeData[camel];
      }

      // Also check dynamicFields for both versions
      if (value === undefined) {
        value = dynamicFields[snake] || dynamicFields[camel];
      }

      if (value !== undefined && value !== null && value !== '') {
        permanentFields[snake] = value;
        // Remove from dynamicFields to avoid duplication
        delete dynamicFields[snake];
        delete dynamicFields[camel];
      }
    });

    const { salaries: normalizedSalaries, dynamicFields: dynamicFieldsAfterSalaries } =
      await normalizeEmployeeSalariesPayload(employeeData, dynamicFields, {});
    dynamicFields = dynamicFieldsAfterSalaries;
    permanentFields.salaries = normalizedSalaries;

    // Lift any permanent schema values stuck in dynamicFields onto root, then strip them from dynamic
    const promotedCreate = promotePermanentFieldsFromDynamic({ ...permanentFields, dynamicFields });
    for (const name of getPermanentFieldNames()) {
      if (
        (permanentFields[name] === undefined || permanentFields[name] === null || permanentFields[name] === '') &&
        promotedCreate[name] !== undefined &&
        promotedCreate[name] !== null &&
        promotedCreate[name] !== ''
      ) {
        permanentFields[name] = promotedCreate[name];
      }
    }
    dynamicFields = stripPromotedPermanentFieldsFromDynamic(dynamicFields);

    const normalizeOverrides = (list) => {
      try {
        const parsed = typeof list === 'string' ? JSON.parse(list) : (list || []);
        return Array.isArray(parsed)
          ? parsed
            .filter((item) => item && (item.masterId || item.name))
            .map((item) => ({
              masterId: item.masterId || null,
              code: item.code || null,
              name: item.name || '',
              category: item.category || null,
              type: item.type || null,
              amount: item.amount ?? item.overrideAmount ?? null,
              percentage: item.percentage ?? null,
              percentageBase: item.percentageBase ?? null,
              minAmount: item.minAmount ?? null,
              maxAmount: item.maxAmount ?? null,
              basedOnPresentDays: item.basedOnPresentDays ?? false,
              isOverride: true,
            }))
          : [];
      } catch (e) { return []; }
    };

    const employeeAllowances = normalizeOverrides(employeeData.employeeAllowances);
    const employeeDeductions = normalizeOverrides(employeeData.employeeDeductions);

    // Resolve Qualification Labels & Uploads
    let qualifications = [];
    try {
      const divId = permanentFields.division_id || employeeData.division_id;
      const deptId = permanentFields.department_id || employeeData.department_id;
      const desId = permanentFields.designation_id || employeeData.designation_id;
      const settings = await getQualificationSettingsForScope(divId, deptId, desId);
      qualifications = await processQualifications(req, settings);
      console.log('[createEmployee] Final Qualifications:', JSON.stringify(qualifications));
    } catch (err) {
      console.error('Error processing qualifications:', err);
    }

    // Generate password
    const rawPassword = await generatePassword(employeeData, passwordMode || null);

    try {
      await Employee.create({
        ...permanentFields,
        qualifications, // Explicitly save resolved qualifications
        dynamicFields: Object.keys(dynamicFields).length > 0 ? dynamicFields : {},
        emp_no: String(employeeData.emp_no || '').toUpperCase(),
        employeeAllowances,
        employeeDeductions,
        password: rawPassword, // Will be hashed by pre-save hook
        plain_password: rawPassword, // Store raw password for credential resend
      });
    } catch (mongoError) {
      console.error('MongoDB create error:', mongoError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create employee',
        error: mongoError.message,
      });
    }

    // Fetch the created employee
    const createdEmployee = await Employee.findOne({ emp_no: String(employeeData.emp_no || '').toUpperCase() })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .populate('employee_group_id', 'name code isActive');

    try {
      const { ensureInitialTimeline } = require('../services/employeeTimelineService');
      const raw = await Employee.findById(createdEmployee._id);
      if (raw) {
        ensureInitialTimeline(raw);
        // Prefer hire source on first segment
        if (raw.orgHistory?.[0]) raw.orgHistory[0].source = 'hire';
        if (raw.salaryHistory?.[0]) raw.salaryHistory[0].source = 'hire';
        await raw.save();
      }
    } catch (tlErr) {
      console.warn('[createEmployee] timeline seed failed:', tlErr.message);
    }

    // Initialize prorated leave balances for the new employee
    const leaveInitResults = await initializeEmployeeLeaves(createdEmployee._id);
    console.log('[createEmployee] Leave initialization results:', leaveInitResults);

    // Send notifications
    const notificationResults = await sendCredentials(
      createdEmployee,
      rawPassword,
      notificationChannels || { email: true, sms: true }
    );

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      leaveInitialization: leaveInitResults,
      notificationResults,
      data: createdEmployee,
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:empNo
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.updateEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const employeeData = req.body;
    const { stripLegacyWeekdayFromDynamicFields } = require('../../shared/utils/weekdayShiftScheduleUtils');
    normalizePushSubscriptionsPayload(employeeData);

    // Weekday shift pattern is captured on application only — not editable after verify
    delete employeeData.weekdayShiftSchedule;
    if (employeeData.dynamicFields) {
      try {
        const parsedDynamic =
          typeof employeeData.dynamicFields === 'string'
            ? JSON.parse(employeeData.dynamicFields)
            : employeeData.dynamicFields;
        employeeData.dynamicFields = stripLegacyWeekdayFromDynamicFields(parsedDynamic);
      } catch (e) {
        // Parsed again later if needed
      }
    }

    // Check if employee exists
    const existingEmployee = await Employee.findOne({ emp_no: empNo });
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    await stripEmployeeGroupIfDisabled(employeeData);
    const groupErrUpdate = await validateEmployeeGroupIfEnabled(employeeData.employee_group_id);
    if (groupErrUpdate) {
      return res.status(400).json({
        success: false,
        message: groupErrUpdate.error,
      });
    }

    await enforceSecondSalaryOnPayload(req.user, employeeData);

    // NEW Profile Request Logic: 
    // If not super_admin and not the employee themselves, create a request instead of direct update
    // We check both role (string) and roles (array) for robust permission check
    const isSuperAdmin = req.user.role === 'super_admin' || (req.user.roles && req.user.roles.includes('super_admin'));
    const isOwner = req.user.employeeRef && req.user.employeeRef.toString() === existingEmployee._id.toString();

    // Division/department: workspace cannot change; use Promotions & Transfers with effectDate.
    // Superadmin may change with acknowledgeOrgTimelineRisk + effectDate (writes timeline).
    {
      const { sameId, applyOrgChange, startOfUtcDay } = require('../services/employeeTimelineService');
      const nextDiv = employeeData.division_id;
      const nextDept = employeeData.department_id;
      const divChanging =
        nextDiv !== undefined &&
        nextDiv !== null &&
        nextDiv !== '' &&
        !sameId(existingEmployee.division_id, nextDiv);
      const deptChanging =
        nextDept !== undefined &&
        nextDept !== null &&
        nextDept !== '' &&
        !sameId(existingEmployee.department_id, nextDept);

      if (divChanging || deptChanging) {
        if (!isSuperAdmin) {
          delete employeeData.division_id;
          delete employeeData.department_id;
          return res.status(403).json({
            success: false,
            message:
              'Division and department cannot be edited here. Use Promotions & Transfers with an effect date.',
            code: 'ORG_EDIT_VIA_TRANSFER',
          });
        }
        if (!employeeData.acknowledgeOrgTimelineRisk) {
          return res.status(400).json({
            success: false,
            message:
              'Changing division/department bypasses the transfer workflow. Confirm with acknowledgeOrgTimelineRisk=true and provide effectDate (prefer Promotions & Transfers).',
            code: 'ORG_EDIT_NEEDS_ACK',
          });
        }
        const effectRaw = employeeData.effectDate || new Date();
        const effectDate = startOfUtcDay(effectRaw);
        if (!effectDate) {
          return res.status(400).json({ success: false, message: 'Invalid effectDate' });
        }
        applyOrgChange(existingEmployee, {
          division_id: divChanging ? nextDiv : existingEmployee.division_id,
          department_id: deptChanging ? nextDept : existingEmployee.department_id,
          designation_id:
            employeeData.designation_id !== undefined && employeeData.designation_id !== null && employeeData.designation_id !== ''
              ? employeeData.designation_id
              : existingEmployee.designation_id,
          effectiveFrom: effectDate,
          source: 'manual_superadmin',
          applyMaster: true,
        });
        // Prevent double-apply via generic assign; timeline already set master
        delete employeeData.division_id;
        delete employeeData.department_id;
        delete employeeData.acknowledgeOrgTimelineRisk;
        delete employeeData.effectDate;
        // Keep designation in payload if provided for other validation paths
      }
    }

    // Check if user has explicit EMPLOYEES:edit permission (grants direct update without review queue)
    const User = require('../../users/model/User');
    const requestingUser = await User.findById(req.user._id).select('featureControl').lean();
    const hasEditPermission = !!(requestingUser?.featureControl?.includes('EMPLOYEES:edit'));

    if (!isSuperAdmin && !isOwner && !hasEditPermission) {
      console.log(`[updateEmployee] Redirecting to Profile Request for user: ${req.user.name} (${req.user.role})`);

      const existingObj = existingEmployee.toObject({ virtuals: false });
      const requestedChanges = {};
      const previousValues = {};

      // Fields to explicitly exclude from profile requests (internal or large objects)
      const excludeFields = [
        'AllData', 'AllAllowanceDeductions', 'GenQualifications',
        'allData', 'division', 'department', 'designation', 'employeeGroup', 'employee_group',
        '_id', 'createdAt', 'updatedAt', '__v', 'dynamicFields',
        'payroll_stats', 'leave_stats', 'password', 'plain_password',
        'isProfileRequest', 'status', 'is_active', 'weekdayShiftSchedule'
      ];

      for (const key in employeeData) {
        if (excludeFields.includes(key)) continue;

        // Field mapping for comparison (e.g. proposedSalary should be checked against gross_salary)
        const targetKey = (key === 'proposedSalary') ? 'gross_salary' : key;

        // Determine the actual stored value for comparison
        let currentValue = existingObj[targetKey];
        if (currentValue === undefined && existingObj.dynamicFields) {
          currentValue = existingObj.dynamicFields[targetKey];
        }

        const newValue = employeeData[key];

        // Special Handling: If newValue is a JSON string (e.g. from FormData), parse it for comparison
        let processedNewValue = newValue;
        if (typeof newValue === 'string' && (newValue.trim().startsWith('[') || newValue.trim().startsWith('{'))) {
          try {
            processedNewValue = JSON.parse(newValue);
          } catch (e) {
            // Keep as string if not valid JSON
          }
        }

        // Normalize values for comparison (handle null, undefined, empty string/array/object as same)
        // Also handle ObjectIds to string conversion for consistent comparison
        const normalize = (v) => {
          if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
          if (v && typeof v === 'object' && v._id) return v._id.toString();
          if (v && v.constructor && v.constructor.name === 'ObjectID') return v.toString();

          // Treat numeric strings as numbers for comparison
          if (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '') return Number(v);
          
          // Treat empty arrays/objects as null (phantom changes)
          if (Array.isArray(v) && v.length === 0) return null;
          if (v && typeof v === 'object' && Object.keys(v).length === 0 && !(v instanceof Date)) return null;
          
          return v;
        };
        
        const normCurrent = normalize(currentValue);
        const normNew = normalize(processedNewValue);

        // Comparison logic (handling objects/arrays simply but more robustly)
        const isChanged = JSON.stringify(normCurrent) !== JSON.stringify(normNew);

        if (isChanged) {
          requestedChanges[key] = processedNewValue;
          previousValues[key] = currentValue !== undefined ? currentValue : null;
        }
      }

      // If no actual changes found after filtering, just return success
      if (Object.keys(requestedChanges).length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No changes detected in profile'
        });
      }

      // Create the update request
      const request = await EmployeeUpdateApplication.create({
        employeeId: existingEmployee._id,
        emp_no: existingEmployee.emp_no,
        requestedChanges,
        previousValues,
        status: 'pending',
        type: 'profile',
        createdBy: req.user._id,
        comments: 'Employee profile edit submitted for approval'
      });

      return res.status(200).json({
        success: true,
        message: 'Profile update request has been submitted for approval',
        requestId: request._id,
        isRequest: true
      });
    }

    // Validate department if provided
    if (employeeData.department_id) {
      const dept = await Department.findById(employeeData.department_id);
      if (!dept) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department ID',
        });
      }
    }

    // Validate designation if provided
    if (employeeData.designation_id) {
      const desig = await Designation.findById(employeeData.designation_id);
      if (!desig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid designation ID',
        });
      }

      // Auto-link designation to department if designation or department changed
      const departmentId = employeeData.department_id || existingEmployee.department_id;
      if (departmentId) {
        const department = await Department.findById(departmentId);
        const designationIdStr = employeeData.designation_id.toString();
        const isLinked = department.designations.some(d => d.toString() === designationIdStr);

        if (department && !isLinked) {
          await Department.findByIdAndUpdate(
            departmentId,
            { $addToSet: { designations: employeeData.designation_id } }
          );
          console.log(`[updateEmployee] Auto-linked designation ${desig.name} to department ${department.name}`);
        }
      }
    }

    // Validate dynamicFields if form settings exist
    // Only validate if dynamicFields are being updated and validation is explicitly needed
    // Skip validation for updates that only change permanent fields (like allowances/deductions/salary)
    const hasDynamicFieldsUpdate = employeeData.dynamicFields && Object.keys(employeeData.dynamicFields).length > 0;
    const hasOnlyPermanentFieldsUpdate = !hasDynamicFieldsUpdate && (
      employeeData.employeeAllowances !== undefined ||
      employeeData.employeeDeductions !== undefined ||
      employeeData.gross_salary !== undefined ||
      employeeData.ctcSalary !== undefined ||
      employeeData.calculatedSalary !== undefined ||
      employeeData.paidLeaves !== undefined ||
      employeeData.second_salary !== undefined ||
      employeeData.salaries !== undefined
    );

    // Only validate if dynamicFields are being updated (not for simple permanent field updates)
    if (hasDynamicFieldsUpdate && !hasOnlyPermanentFieldsUpdate) {
      const settings = await EmployeeApplicationFormSettings.getActiveSettings();
      if (settings) {
        // Merge existing employee data with update data for validation
        const mergedData = {
          ...existingEmployee.toObject(),
          ...employeeData,
          // Ensure proposedSalary satisfies validation if required by settings (since it's a UI field)
          proposedSalary: employeeData.proposedSalary || employeeData.gross_salary || existingEmployee.gross_salary
        };

        const validation = await validateFormData(mergedData, settings);
        if (!validation.isValid) {
          console.error('Validation errors:', validation.errors);
          return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: validation.errors,
          });
        }
      }
    }

    // CRITICAL: Exclude proposedSalary from updates AFTER validation to prevent it from being saved 
    // as a dynamic field or overwriting salary data unintentionally.
    if (employeeData.proposedSalary) {
      delete employeeData.proposedSalary;
    }

    // Separate permanent fields and dynamicFields
    const permanentFields = extractPermanentFields(employeeData);
    delete permanentFields.weekdayShiftSchedule;

    // 1. Extract dynamic fields from root level
    const extractedDynamic = extractDynamicFields(employeeData, permanentFields);

    // 2. Parse dynamicFields object if present
    let dynamicFields = {};
    if (employeeData.dynamicFields) {
      try {
        const nested = typeof employeeData.dynamicFields === 'string'
          ? JSON.parse(employeeData.dynamicFields)
          : employeeData.dynamicFields;
        dynamicFields = stripLegacyWeekdayFromDynamicFields(nested);
      } catch (e) {
        console.warn('Failed to parse dynamicFields in updateEmployee:', e.message);
      }
    }

    // 3. Merge: root-level fields take precedence
    dynamicFields = stripLegacyWeekdayFromDynamicFields({ ...dynamicFields, ...extractedDynamic });

    // 4. Parse specific Fields that should be arrays
    const arrayFields = ['reporting_to', 'reporting_to_'];
    arrayFields.forEach(field => {
      if (dynamicFields[field] && typeof dynamicFields[field] === 'string') {
        try {
          dynamicFields[field] = JSON.parse(dynamicFields[field]);
        } catch (e) {
          console.warn(`Failed to parse ${field} in dynamicFields:`, e.message);
        }
      }
    });

    // 5. Normalize: Always use 'reporting_to', eliminate 'reporting_to_'
    if (dynamicFields.reporting_to_ && Array.isArray(dynamicFields.reporting_to_) && dynamicFields.reporting_to_.length > 0) {
      if (!dynamicFields.reporting_to || !Array.isArray(dynamicFields.reporting_to) || dynamicFields.reporting_to.length === 0) {
        dynamicFields.reporting_to = dynamicFields.reporting_to_;
      }
    }
    delete dynamicFields.reporting_to_;

    // 6. Generic JSON Parsing for any other array/object fields (from multipart/form-data)
    Object.keys(dynamicFields).forEach(key => {
      if (typeof dynamicFields[key] === 'string') {
        const val = dynamicFields[key].trim();
        if (val.startsWith('[') || val.startsWith('{')) {
          try {
            dynamicFields[key] = JSON.parse(val);
            console.log(`[updateEmployee] Parsed dynamic field "${key}" from JSON string`);
          } catch (e) {
            // keep as string if parsing fails
          }
        }
      }
    });

    // Normalize bank details from camelCase to snake_case if present
    const bankFields = [
      { snake: 'bank_account_no', camel: 'bankAccountNo' },
      { snake: 'bank_name', camel: 'bankName' },
      { snake: 'bank_place', camel: 'bankPlace' },
      { snake: 'ifsc_code', camel: 'ifscCode' },
      { snake: 'salary_mode', camel: 'salaryMode' },
      { snake: 'second_salary', camel: 'secondSalary' }
    ];

    bankFields.forEach(({ snake, camel }) => {
      // Check permanentFields first, then dynamicFields, then input root
      let value = permanentFields[snake];

      // If not in permanentFields (snake), checks input under camelCase
      if (value === undefined && employeeData[camel] !== undefined) {
        value = employeeData[camel];
      }

      // Also check dynamicFields for both versions
      if (value === undefined) {
        value = dynamicFields[snake] || dynamicFields[camel];
      }

      if (value !== undefined && value !== null && value !== '') {
        permanentFields[snake] = value;
        // Remove from dynamicFields to avoid duplication
        delete dynamicFields[snake];
        delete dynamicFields[camel];
      }
    });

    const existingSalariesFlat =
      existingEmployee.salaries && typeof existingEmployee.salaries === 'object' && !Array.isArray(existingEmployee.salaries)
        ? { ...existingEmployee.salaries }
        : {};
    const {
      salaries: normalizedSalaries,
      dynamicFields: dynamicFieldsAfterSalaries,
      fieldIds: salaryFieldIds,
    } = await normalizeEmployeeSalariesPayload(employeeData, dynamicFields, existingSalariesFlat);
    dynamicFields = dynamicFieldsAfterSalaries;
    permanentFields.salaries = normalizedSalaries;

    // Lift permanent fields wrongly stored only in existing/incoming dynamic onto root, then strip
    const existingPlain = existingEmployee.toObject({ virtuals: false });
    const promotedUpdate = promotePermanentFieldsFromDynamic({
      ...existingPlain,
      ...permanentFields,
      dynamicFields: {
        ...(existingPlain.dynamicFields || {}),
        ...dynamicFields,
      },
    });
    for (const name of getPermanentFieldNames()) {
      // Prefer explicit update payload; otherwise lift from dynamic if root was empty
      if (permanentFields[name] !== undefined && permanentFields[name] !== null) continue;
      if (
        (existingPlain[name] === undefined || existingPlain[name] === null || existingPlain[name] === '') &&
        promotedUpdate[name] !== undefined &&
        promotedUpdate[name] !== null &&
        promotedUpdate[name] !== ''
      ) {
        permanentFields[name] = promotedUpdate[name];
      }
    }
    dynamicFields = stripPromotedPermanentFieldsFromDynamic(dynamicFields);

    // Normalize employee allowances and deductions
    const normalizeOverrides = (list) => {
      try {
        const parsed = typeof list === 'string' ? JSON.parse(list) : (list || []);
        return Array.isArray(parsed)
          ? parsed
            .filter((item) => item && (item.masterId || item.name))
            .map((item) => ({
              masterId: item.masterId || null,
              code: item.code || null,
              name: item.name || '',
              category: item.category || null,
              type: item.type || null,
              amount: item.amount ?? item.overrideAmount ?? null,
              percentage: item.percentage ?? null,
              percentageBase: item.percentageBase ?? null,
              minAmount: item.minAmount ?? null,
              maxAmount: item.maxAmount ?? null,
              basedOnPresentDays: item.basedOnPresentDays ?? false,
              isOverride: true,
            }))
          : [];
      } catch (e) { return []; }
    };

    const employeeAllowances = normalizeOverrides(employeeData.employeeAllowances);
    const employeeDeductions = normalizeOverrides(employeeData.employeeDeductions);
    const ctcSalary = employeeData.ctcSalary ?? null;
    const calculatedSalary = employeeData.calculatedSalary ?? null;

    // Resolve Qualification Labels & Uploads
    let qualifications = [];
    try {
      const divId =
        permanentFields.division_id ||
        employeeData.division_id ||
        existingEmployee.division_id;
      const deptId =
        permanentFields.department_id ||
        employeeData.department_id ||
        existingEmployee.department_id;
      const desId =
        permanentFields.designation_id ||
        employeeData.designation_id ||
        existingEmployee.designation_id;
      const settings = await getQualificationSettingsForScope(divId, deptId, desId);
      qualifications = await processQualifications(req, settings);

      // If no new qualifications in request, merge with existing?
      // Logic: if req.body.qualifications is provided (even empty array), we replace. 
      // If it's undefined/null, we keep existing? 
      // With FormData, missing field usually means undefined.
      // But if user deleted all qualifications, it might send "[]". 
      // Let's rely on what processQualifications returns. 
      // If req.body.qualifications was undefined, helper returns [].
      // We should check if the key existed in body to decide whether to update.
      if (req.body.qualifications === undefined && !req.files?.length) {
        qualifications = existingEmployee.qualifications || [];
      }

    } catch (err) {
      console.error('Error processing qualifications:', err);
      qualifications = existingEmployee.qualifications || [];
    }

    try {
      const updateData = {
        ...permanentFields,
        updated_at: new Date(),
      };

      // Only overwrite qualifications when the client explicitly sent them (partial edit safe)
      const qualificationsProvided =
        req.body.qualifications !== undefined ||
        (Array.isArray(req.files) && req.files.some((f) => String(f.fieldname || '').startsWith('qualification_cert_')));
      if (qualificationsProvided) {
        updateData.qualifications = qualifications;
      }

      // Handle allowances, deductions and salary fields ONLY if provided in request to avoid partial-update wipes
      if (employeeData.employeeAllowances !== undefined) {
        updateData.employeeAllowances = employeeAllowances;
      }
      if (employeeData.employeeDeductions !== undefined) {
        updateData.employeeDeductions = employeeDeductions;
      }
      if (employeeData.ctcSalary !== undefined) {
        updateData.ctcSalary = ctcSalary;
      }
      if (employeeData.calculatedSalary !== undefined) {
        updateData.calculatedSalary = calculatedSalary;
      }

      // Handle dynamicFields carefully to prevent wiping; always strip permanent schema keys
      // On partial updates with no dynamic payload, still strip permanent keys stuck in dynamicFields
      const hasIncomingDynamic = Object.keys(dynamicFields).length > 0;
      const hasExistingDynamic =
        existingEmployee.dynamicFields && Object.keys(existingEmployee.dynamicFields).length > 0;

      if (hasIncomingDynamic || hasExistingDynamic) {
        const cleanedExistingDynamic = { ...(existingEmployee.dynamicFields || {}) };

        // Explicitly remove bank fields from existing dynamic fields to fix stale data
        const bankFieldsToCleanup = [
          'bank_account_no', 'bankAccountNo',
          'bank_name', 'bankName',
          'bank_place', 'bankPlace',
          'ifsc_code', 'ifscCode',
          'salary_mode', 'salaryMode',
          'second_salary', 'secondSalary',
          'proposedSalary' // Also cleanup proposedSalary if it was accidentally saved
        ];
        bankFieldsToCleanup.forEach(f => delete cleanedExistingDynamic[f]);

        const sids = Array.isArray(salaryFieldIds) && salaryFieldIds.length > 0
          ? salaryFieldIds
          : await getSalariesGroupFieldIds();
        const cleanedExistingNoSalaries = stripSalaryKeysFromDynamicField(cleanedExistingDynamic, sids);

        updateData.dynamicFields = stripPromotedPermanentFieldsFromDynamic({
          ...cleanedExistingNoSalaries,
          ...dynamicFields
        });
      } else if (existingEmployee.dynamicFields && typeof existingEmployee.dynamicFields === 'object') {
        const sidsFallback = Array.isArray(salaryFieldIds) && salaryFieldIds.length > 0
          ? salaryFieldIds
          : await getSalariesGroupFieldIds();
        const hadLegacySalaries =
          existingEmployee.dynamicFields.salaries != null ||
          sidsFallback.some((id) => existingEmployee.dynamicFields[id] !== undefined);
        if (hadLegacySalaries) {
          updateData.dynamicFields = stripPromotedPermanentFieldsFromDynamic(
            stripSalaryKeysFromDynamicField(
              { ...existingEmployee.dynamicFields },
              sidsFallback
            )
          );
        } else {
          // Still strip any permanent keys stuck in dynamic even when no other changes
          const stripped = stripPromotedPermanentFieldsFromDynamic({
            ...(existingEmployee.dynamicFields || {}),
          });
          if (JSON.stringify(stripped) !== JSON.stringify(existingEmployee.dynamicFields || {})) {
            updateData.dynamicFields = stripped;
          }
        }
      }

      // Explicitly handle paidLeaves to ensure it's saved even if 0
      if (employeeData.paidLeaves !== undefined && employeeData.paidLeaves !== null) {
        updateData.paidLeaves = Number(employeeData.paidLeaves);
      }
      // Explicitly handle allottedLeaves to ensure it's saved even if 0
      if (employeeData.allottedLeaves !== undefined && employeeData.allottedLeaves !== null) {
        updateData.allottedLeaves = Number(employeeData.allottedLeaves);
      }

      // Explicitly handle second_salary to ensure it's saved correctly as Number
      // Check for both snake_case (standard) and camelCase (frontend payload)
      if (employeeData.second_salary !== undefined && employeeData.second_salary !== null && employeeData.second_salary !== '') {
        updateData.second_salary = Number(employeeData.second_salary);
      } else if (employeeData.secondSalary !== undefined && employeeData.secondSalary !== null && employeeData.secondSalary !== '') {
        updateData.second_salary = Number(employeeData.secondSalary);
      }

      // Persist timeline mutations from superadmin org edit (applyOrgChange on existingEmployee)
      if (Array.isArray(existingEmployee.orgHistory) && existingEmployee.orgHistory.length) {
        updateData.orgHistory = existingEmployee.orgHistory;
        if (existingEmployee.division_id) updateData.division_id = existingEmployee.division_id;
        if (existingEmployee.department_id) updateData.department_id = existingEmployee.department_id;
        if (existingEmployee.designation_id) updateData.designation_id = existingEmployee.designation_id;
      }
      if (Array.isArray(existingEmployee.salaryHistory) && existingEmployee.salaryHistory.length) {
        updateData.salaryHistory = existingEmployee.salaryHistory;
      }

      await Employee.findOneAndUpdate(
        { emp_no: empNo },
        updateData,
        { new: true }
      );
    } catch (mongoError) {
      console.error('MongoDB update error:', mongoError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update employee',
        error: mongoError.message,
      });
    }

    // Fetch updated employee
    const updatedEmployeeDoc = await Employee.findOne({ emp_no: empNo })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .populate('employee_group_id', 'name code isActive');

    // Transform employee with user population
    const updatedEmployee = await transformEmployeeForResponse(updatedEmployeeDoc, true);
    if (updatedEmployee) {
      updatedEmployee.paidLeaves = updatedEmployee.paidLeaves !== undefined && updatedEmployee.paidLeaves !== null
        ? Number(updatedEmployee.paidLeaves)
        : 0;
      updatedEmployee.allottedLeaves = updatedEmployee.allottedLeaves !== undefined && updatedEmployee.allottedLeaves !== null
        ? Number(updatedEmployee.allottedLeaves)
        : 0;
    }

    // Employee history: profile updated (human-readable previous/current for changed fields)
    try {
      const before = existingEmployee.toObject();
      const after = updatedEmployeeDoc ? updatedEmployeeDoc.toObject() : null;
      if (after) {
        const skipFields = new Set(['__v', 'getQualifications', 'allData', 'created_at', 'updated_at', 'password', 'plain_password']);
        const requestedFields = Object.keys(employeeData || {}).filter((f) => !skipFields.has(f));
        const rawChanges = requestedFields
          .map((field) => ({
            field,
            previous: before[field],
            current: after[field],
          }))
          .filter((c) => {
            const prev = c.previous;
            const curr = c.current;
            if (prev === undefined && curr === undefined) return false;
            try {
              return JSON.stringify(prev) !== JSON.stringify(curr);
            } catch {
              return prev !== curr;
            }
          });

        // Resolve refs and complex values to human-readable strings for display
        const toDisplay = async (value, field) => {
          if (value === undefined || value === null) return '—';
          if (field === 'division_id') {
            const id = value?._id || value;
            if (!id) return '—';
            const doc = await Division.findById(id).select('name').lean();
            return doc ? doc.name : String(id);
          }
          if (field === 'department_id') {
            const id = value?._id || value;
            if (!id) return '—';
            const doc = await Department.findById(id).select('name').lean();
            return doc ? doc.name : String(id);
          }
          if (field === 'designation_id') {
            const id = value?._id || value;
            if (!id) return '—';
            const doc = await Designation.findById(id).select('name').lean();
            return doc ? doc.name : String(id);
          }
          if (field === 'qualifications') {
            const arr = Array.isArray(value) ? value : [];
            return arr.length ? `${arr.length} row(s)` : '—';
          }
          if (field === 'dynamicFields') {
            const obj = value && typeof value === 'object' ? value : {};
            const keys = Object.keys(obj).filter((k) => !k.startsWith('_'));
            return keys.length ? `${keys.length} field(s)` : '—';
          }
          if (value instanceof Date) return value.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
          if (typeof value === 'object') return '[updated]';
          return String(value);
        };

        const changes = [];
        for (const c of rawChanges) {
          changes.push({
            field: c.field,
            previous: await toDisplay(c.previous, c.field),
            current: await toDisplay(c.current, c.field),
          });
        }

        if (changes.length > 0) {
          await EmployeeHistory.create({
            emp_no: existingEmployee.emp_no,
            event: 'employee_updated',
            performedBy: req.user._id,
            performedByName: req.user.name,
            performedByRole: req.user.role,
            details: {
              changes,
            },
            comments: 'Employee profile updated',
          });
        }
      }
    } catch (err) {
      console.error('Failed to log employee update history:', err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: updatedEmployee,
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete employee
 * @route   DELETE /api/employees/:empNo
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;

    const existingEmployee = await Employee.findOne({ emp_no: empNo });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    await Employee.findOneAndDelete({ emp_no: empNo });

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Get employee count
 * @route   GET /api/employees/count
 * @access  Private
 */
exports.getEmployeeCount = async (req, res) => {
  try {
    const { is_active } = req.query;
    const query = {};

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    const count = await Employee.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('Error getting employee count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting employee count',
      error: error.message,
    });
  }
};

/**
 * @desc    Get employee settings
 * @route   GET /api/employees/settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await getEmployeeSettings();

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error getting employee settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting employee settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Update employee settings (dataSource, deleteTarget, auto_generate_employee_number)
 * @route   PUT /api/employees/settings
 * @access  Private (Super Admin, Sub Admin, Manager)
 */
exports.updateSettings = async (req, res) => {
  try {
    const { auto_generate_employee_number } = req.body;

    const updates = [
      auto_generate_employee_number != null && { key: 'auto_generate_employee_number', value: !!auto_generate_employee_number },
    ].filter(Boolean);

    for (const { key, value } of updates) {
      await Settings.findOneAndUpdate(
        { key },
        { key, value, category: 'employee' },
        { new: true, upsert: true }
      );
    }

    const settings = await getEmployeeSettings();
    res.status(200).json({
      success: true,
      message: 'Employee settings updated',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating employee settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Get next employee number (for UI when auto-generate is ON)
 * @route   GET /api/employees/next-emp-no
 * @access  Private
 */
exports.getNextEmpNo = async (req, res) => {
  try {
    const nextEmpNo = await getNextEmpNo();
    res.status(200).json({
      success: true,
      data: { nextEmpNo },
    });
  } catch (error) {
    console.error('Error getting next employee number:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting next employee number',
      error: error.message,
    });
  }
};

/**
 * @desc    Get resolved allowance/deduction components for a department/gross salary (with optional employee overrides)
 * @route   GET /api/employees/components/defaults
 * @access  Private
 */
/**
 * @desc    Set employee left date (deactivate employee)
 * @route   PUT /api/employees/:empNo/left-date
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.setLeftDate = async (req, res) => {
  try {
    const { empNo } = req.params;
    const { leftDate, leftReason } = req.body;

    if (!leftDate) {
      return res.status(400).json({
        success: false,
        message: 'Left date is required',
      });
    }

    // Validate date format
    const leftDateObj = new Date(leftDate);
    if (isNaN(leftDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid left date format',
      });
    }

    // Find employee
    const employee = await Employee.findOne({ emp_no: empNo.toUpperCase() });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Update left date and deactivate immediately for manual operation
    employee.leftDate = leftDateObj;
    employee.leftReason = leftReason || null;
    employee.is_active = false; // Manual left-date API keeps behaviour: deactivate now

    closeCurrentTenure(employee, leftDateObj, leftReason || null, 'manual');

    await employee.save();

    // Employee history: left date set manually
    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'left_date_set',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          leftDate: employee.leftDate,
          leftReason: employee.leftReason,
          source: 'manual_api',
        },
        comments: leftReason || 'Left date set manually',
      });
    } catch (err) {
      console.error('Failed to log left date set history:', err.message);
    }

    // Biometric: offboard on LWD+1 (immediate if leftDate already past)
    try {
      const { isPastLastWorkingDay, scheduleBiometricDeviceOffboard } = require('../../attendance/services/biometricDeviceLifecycleService');
      if (isPastLastWorkingDay(employee.leftDate)) {
        scheduleBiometricDeviceOffboard(employee.emp_no);
      }
    } catch (bioErr) {
      console.error('Failed to schedule biometric offboard after setLeftDate:', bioErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Employee left date set successfully',
      data: {
        emp_no: employee.emp_no,
        employee_name: employee.employee_name,
        leftDate: employee.leftDate,
        leftReason: employee.leftReason,
        is_active: employee.is_active,
      },
    });
  } catch (error) {
    console.error('Error setting left date:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting left date',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove employee left date (reactivate employee)
 * @route   DELETE /api/employees/:empNo/left-date
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.removeLeftDate = async (req, res) => {
  try {
    return res.status(403).json({
      success: false,
      message: 'Direct reactivation is disabled. Please use the Rejoin workflow from Employees or Resignations.',
    });
  } catch (error) {
    console.error('Error removing left date:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing left date',
      error: error.message,
    });
  }
};

/**
 * @desc    Get employee history timeline
 * @route   GET /api/employees/:empNo/history
 * @access  Private (Super Admin only for now)
 */
exports.getEmployeeHistory = async (req, res) => {
  try {
    const { empNo } = req.params;
    const empNoUpper = String(empNo || '').toUpperCase();

    if (!empNoUpper) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required',
      });
    }

    const history = await EmployeeHistory.find({ emp_no: empNoUpper })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching employee history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee history',
      error: error.message,
    });
  }
};

exports.getAllowanceDeductionDefaults = async (req, res) => {
  try {
    const { departmentId, grossSalary, empNo } = req.query;

    if (!departmentId || !grossSalary) {
      return res.status(400).json({
        success: false,
        message: 'departmentId and grossSalary are required',
      });
    }

    let employeeAllowances = [];
    let employeeDeductions = [];

    if (empNo) {
      const existingEmployee = await Employee.findOne({ emp_no: empNo.toUpperCase() });
      if (existingEmployee) {
        employeeAllowances = Array.isArray(existingEmployee.employeeAllowances) ? existingEmployee.employeeAllowances : [];
        employeeDeductions = Array.isArray(existingEmployee.employeeDeductions) ? existingEmployee.employeeDeductions : [];
      }
    }

    const resolved = await resolveForEmployee({
      departmentId,
      grossSalary: Number(grossSalary),
      employeeAllowances,
      employeeDeductions,
    });

    return res.status(200).json({
      success: true,
      data: resolved,
    });
  } catch (error) {
    console.error('Error resolving allowance/deduction defaults:', error);
    res.status(500).json({
      success: false,
      message: 'Error resolving allowance/deduction defaults',
      error: error.message,
    });
  }
};

/**
 * @desc    Resend employee credentials
 * @route   POST /api/employees/:empNo/resend-credentials
 * @access  Private (Super Admin)
 */
exports.resendEmployeePassword = async (req, res) => {
  try {
    const { empNo } = req.params;

    // Force both channels for resend as per requirement
    const notificationChannels = { email: true, sms: true };

    console.log(`[EmployeeController] Resending credentials for ${empNo}. Channels forced:`, notificationChannels);

    // Explicitly select fields used by notification service to ensure they aren't missing
    const employee = await Employee.findOne({ emp_no: empNo.toUpperCase() })
      .select('+plain_password emp_no employee_name email phone_number');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    console.log(`[EmployeeController] Found employee: ${employee.employee_name}, Email: ${employee.email}, Phone: ${employee.phone_number}`);

    let passwordToSend = employee.plain_password;

    if (!passwordToSend) {
      const { passwordMode } = req.body;
      passwordToSend = await generatePassword(employee, passwordMode || null);
      employee.password = passwordToSend;
      employee.plain_password = passwordToSend;
      await employee.save();

      // Sync to User if linked
      try {
        const linkedUser = await User.findOne({
          $or: [
            { employeeRef: employee._id },
            { employeeId: employee.emp_no }
          ]
        });
        if (linkedUser) {
          linkedUser.password = passwordToSend;
          await linkedUser.save();
          console.log(`[EmployeeController] Syncing resent password to user ${linkedUser.email}`);
        }
      } catch (userSyncErr) {
        console.error('[EmployeeController] Failed to sync password to User collection:', userSyncErr.message);
      }
    }

    const notificationResults = await sendCredentials(
      employee,
      passwordToSend,
      notificationChannels,
      false
    );

    // Employee history: credentials resent
    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'credentials_resent',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          channels: notificationChannels,
        },
        comments: 'Login credentials resent to employee',
      });
    } catch (err) {
      console.error('Failed to log credentials resent history:', err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Credentials resent successfully',
      notificationResults
    });
  } catch (error) {
    console.error('Error resending credentials:', error);
    res.status(500).json({ success: false, message: 'Error resending credentials', error: error.message });
  }
};

/**
 * @desc    Reset employee credentials (generate new and send via config matrix)
 * @route   POST /api/employees/:empNo/reset-credentials
 * @access  Private (Super Admin)
 */
exports.resetEmployeeCredentials = async (req, res) => {
  try {
    const { empNo } = req.params;

    const employee = await Employee.findOne({ emp_no: empNo.toUpperCase() })
      .select('+plain_password emp_no employee_name email phone_number');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    console.log(`[EmployeeController] Resetting credentials for ${empNo}. Using config matrix delivery strategy.`);

    const { passwordMode, customPassword } = req.body;

    let passwordToSend;
    if (customPassword && customPassword.trim().length > 0) {
      passwordToSend = customPassword.trim();
    } else {
      passwordToSend = await generatePassword(employee, passwordMode || null);
    }
    employee.password = passwordToSend;
    employee.plain_password = passwordToSend;
    await employee.save();

    // Sync to User if linked
    try {
      const linkedUser = await User.findOne({
        $or: [
          { employeeRef: employee._id },
          { employeeId: employee.emp_no }
        ]
      });
      if (linkedUser) {
        linkedUser.password = passwordToSend;
        await linkedUser.save();
        console.log(`[EmployeeController] Syncing reset credentials to user ${linkedUser.email}`);
      }
    } catch (userSyncErr) {
      console.error('[EmployeeController] Failed to sync password to User collection:', userSyncErr.message);
    }

    const notificationResults = await sendCredentials(
      employee,
      passwordToSend,
      null,
      true
    );

    // Employee history: credentials reset
    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'password_reset',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          mode: 'manual_reset',
        },
        comments: 'Login credentials reset and sent to employee',
      });
    } catch (err) {
      console.error('Failed to log credentials reset history:', err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Credentials reset and sent successfully',
      notificationResults
    });
  } catch (error) {
    console.error('Error resetting credentials:', error);
    res.status(500).json({ success: false, message: 'Error resetting credentials', error: error.message });
  }
};

/**
 * @desc    Bulk export employee passwords
 * @route   POST /api/employees/bulk-export-passwords
 * @access  Private (Super Admin)
 */
exports.bulkExportEmployeePasswords = async (req, res) => {
  try {
    const { empNos, passwordMode } = req.body; // Array of emp_nos to reset/export

    const query = empNos && empNos.length > 0 ? { emp_no: { $in: empNos } } : { is_active: true };
    const employees = await Employee.find(query);

    const exportData = [];

    for (const emp of employees) {
      const newPassword = await generatePassword(emp, passwordMode || null);
      emp.password = newPassword;
      await emp.save();

      // Sync to User if linked
      try {
        const linkedUser = await User.findOne({
          $or: [
            { employeeRef: emp._id },
            { employeeId: emp.emp_no }
          ]
        });
        if (linkedUser) {
          linkedUser.password = newPassword;
          await linkedUser.save();
          console.log(`[EmployeeController] Syncing bulk export password to user ${linkedUser.email}`);
        }
      } catch (userSyncErr) {
        console.error('[EmployeeController] Failed to sync password to User collection during bulk export:', userSyncErr.message);
      }

      exportData.push({
        emp_no: emp.emp_no,
        employee_name: emp.employee_name,
        email: emp.email,
        phone: emp.phone_number,
        password: newPassword
      });

      // Employee history: credentials exported / reset as part of bulk operation
      try {
        await EmployeeHistory.create({
          emp_no: emp.emp_no,
          event: 'password_reset',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: {
            mode: 'bulk_export',
          },
          comments: 'Password reset as part of bulk export operation',
        });
      } catch (err) {
        console.error('Failed to log bulk password reset history:', err.message);
      }
    }

    // Convert to CSV for response
    const { Parser } = require('json2csv');
    const fields = ['emp_no', 'employee_name', 'email', 'phone', 'password'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(exportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employee_credentials.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error('Error in bulk password export:', error);
    res.status(500).json({ success: false, message: 'Error in bulk password export', error: error.message });
  }
};

/**
 * @desc    Bulk resend credentials to filtered employees
 * @route   POST /api/employees/bulk-resend-credentials
 * @access  Private (Super Admin)
 */
exports.bulkResendCredentials = async (req, res) => {
  try {
    const {
      search,
      divisionId,
      departmentId,
      designationId,
      includeLeft
    } = req.body;

    // Reuse filter logic similar to getAllEmployees
    const filters = { ...req.scopeFilter };

    if (divisionId) filters.division_id = divisionId;
    if (departmentId) filters.department_id = departmentId;
    if (designationId) filters.designation_id = designationId;

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filters.$or = [
        { emp_no: searchRegex },
        { employee_name: searchRegex },
        { phone_number: searchRegex },
        { email: searchRegex }
      ];
    }

    if (includeLeft !== 'true') {
      filters.leftDate = null;
    }

    // Force both channels
    const notificationChannels = { email: true, sms: true };

    console.log('[EmployeeController] Bulk resending credentials with filters:', filters);

    // Fetch all matching employees
    const employees = await Employee.find(filters)
      .select('+plain_password emp_no employee_name email phone_number');

    if (!employees || employees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No employees found matching the filters',
        count: 0
      });
    }

    console.log(`[EmployeeController] Found ${employees.length} employees for bulk resend`);

    const results = {
      total: employees.length,
      successCount: 0,
      failCount: 0,
      details: []
    };

    // Process each employee
    for (const employee of employees) {
      try {
        let passwordToSend = employee.plain_password;

        if (!passwordToSend) {
          // Fallback if plain_password missing
          passwordToSend = await generatePassword(employee, null);
          employee.password = passwordToSend;
          employee.plain_password = passwordToSend;
          await employee.save();

          // Sync to User if linked
          try {
            const linkedUser = await User.findOne({
              $or: [
                { employeeRef: employee._id },
                { employeeId: employee.emp_no }
              ]
            });
            if (linkedUser) {
              linkedUser.password = passwordToSend;
              await linkedUser.save();
              console.log(`[EmployeeController] Syncing bulk resent password fallback to user ${linkedUser.email}`);
            }
          } catch (userSyncErr) {
            console.error('[EmployeeController] Failed to sync password to User collection during bulk resend:', userSyncErr.message);
          }
        }

        await sendCredentials(
          employee,
          passwordToSend,
          notificationChannels,
          false
        );

        // Employee history: credentials resent (bulk)
        try {
          await EmployeeHistory.create({
            emp_no: employee.emp_no,
            event: 'credentials_resent',
            performedBy: req.user._id,
            performedByName: req.user.name,
            performedByRole: req.user.role,
            details: {
              channels: notificationChannels,
              mode: 'bulk',
            },
            comments: 'Login credentials resent (bulk operation)',
          });
        } catch (err) {
          console.error('Failed to log bulk credentials resent history:', err.message);
        }

        results.successCount++;
      } catch (err) {
        console.error(`[EmployeeController] Failed to resend for ${employee.emp_no}:`, err.message);
        results.failCount++;
        results.details.push({ emp_no: employee.emp_no, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk resend complete. Sent: ${results.successCount}, Failed: ${results.failCount}`,
      data: results
    });

  } catch (error) {
    console.error('Error in bulk resend credentials:', error);
    res.status(500).json({ success: false, message: 'Error in bulk resend credentials', error: error.message });
  }
};

/**
 * @desc    Export employees to CSV
 * @route   POST /api/employees/export
 * @access  Private
 */
exports.exportEmployees = async (req, res) => {
  try {
    const { fields, filters: queryFilters, empNo } = req.body;
    const { scopeFilter } = req;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one field to export' });
    }

    // Build filters
    let filters = { ...scopeFilter };
    if (empNo) {
      filters.emp_no = empNo;
    } else if (queryFilters) {
      if (queryFilters.is_active !== undefined) filters.is_active = queryFilters.is_active === 'true' || queryFilters.is_active === true;
      if (queryFilters.division_id) filters.division_id = queryFilters.division_id;
      if (queryFilters.department_id) filters.department_id = queryFilters.department_id;
      if (queryFilters.designation_id) filters.designation_id = queryFilters.designation_id;
      if (queryFilters.employee_group_id) filters.employee_group_id = queryFilters.employee_group_id;

      if (queryFilters.search) {
        const searchRegex = new RegExp(queryFilters.search, 'i');
        filters.$or = [
          { emp_no: searchRegex },
          { employee_name: searchRegex },
          { phone_number: searchRegex },
          { email: searchRegex }
        ];
      }

      if (queryFilters.includeLeft !== 'true') {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);
        filters.$and = filters.$and || [];
        filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: startOfToday } }] });
      }
    }

    // Fetch form settings to get labels
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(500).json({ success: false, message: 'Form settings not found' });
    }

    // Create lookup Maps for labels and groupings
    const fieldMap = {};
    settings.groups.forEach(group => {
      group.fields.forEach(field => {
        fieldMap[field.id] = field.label;
      });
    });

    // Preparation for CSV headers/extraction
    const csvFields = fields.map(fId => ({
      label: fieldMap[fId] || fId,
      value: (row) => {
        let val = row[fId];
        // If not at root, check dynamicFields (common in this HRMS for custom fields)
        if ((val === undefined || val === null) && row.dynamicFields) {
          val = row.dynamicFields[fId];
        }

        if (val === undefined || val === null) return '';

        // Formatting logic
        if (fId === 'is_active') return val ? 'Active' : 'Inactive';
        if (fId === 'division_id' || fId === 'department_id' || fId === 'designation_id' || fId === 'employee_group_id') {
          return val?.name || val || '';
        }
        if (Array.isArray(val)) {
          return val.map(v => (typeof v === 'object' ? (v.name || v._id || JSON.stringify(v)) : String(v))).join(', ');
        }
        if (val instanceof Date || (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val))) {
          const d = new Date(val);
          return isNaN(d.getTime()) ? val : d.toLocaleDateString();
        }
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }
    }));

    const cursor = Employee.find(filters)
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .populate('employee_group_id', 'name')
      .cursor();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=employees_export_${Date.now()}.csv`);

    const parser = streamingExportService.streamToCSV(cursor, csvFields);
    parser.pipe(res);

  } catch (error) {
    console.error('Error exporting employees:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error exporting employees', error: error.message });
    }
  }
};

// Exported for performance unit tests
exports.buildActiveEmployeeFilters = buildActiveEmployeeFilters;
exports.mapSummaryEmployeeRow = mapSummaryEmployeeRow;
exports.mapListEmployeeRow = mapListEmployeeRow;
exports.EMPLOYEE_LIST_SELECT = EMPLOYEE_LIST_SELECT;
exports.applyDepartmentIdFilter = applyDepartmentIdFilter;
exports.buildUserMapForEmployeeDocs = buildUserMapForEmployeeDocs;
