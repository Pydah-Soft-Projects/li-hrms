/**
 * Employee Controller
 * Handles dual database operations (MongoDB + MSSQL) based on settings
 */

const Employee = require('../model/Employee');
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
} = require('../../employee-applications/services/fieldMappingService');
const { resolveForEmployee } = require('../../payroll/services/allowanceDeductionResolverService');
const mongoose = require('mongoose');
const {
  isHRMSConnected,
  createEmployeeMSSQL,
  getAllEmployeesMSSQL,
  getEmployeeByIdMSSQL,
  updateEmployeeMSSQL,
  deleteEmployeeMSSQL,
  employeeExistsMSSQL,
} = require('../config/sqlHelper');
const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
const s3UploadService = require('../../shared/services/s3UploadService');

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
          const uploadResult = await s3UploadService.uploadToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            'hrms/certificates'
          );

          // s3UploadService returns the URL directly (or check if it returns { Location })
          // Looking at s3UploadService.js: return result.Location; 
          // So uploadResult is the URL string.
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

/**
 * Get employee settings from database
 */
const getEmployeeSettings = async () => {
  try {
    const dataSourceSetting = await Settings.findOne({ key: 'employee_data_source' });
    const deleteTargetSetting = await Settings.findOne({ key: 'employee_delete_target' });

    return {
      dataSource: dataSourceSetting?.value || 'mongodb', // 'mongodb' | 'mssql' | 'both'
      deleteTarget: deleteTargetSetting?.value || 'both', // 'mongodb' | 'mssql' | 'both'
    };
  } catch (error) {
    console.error('Error getting employee settings:', error);
    return { dataSource: 'mongodb', deleteTarget: 'both' };
  }
};

/**
 * Resolve department and designation names for employees
 */
const resolveEmployeeReferences = async (employees) => {
  // Get unique department and designation IDs
  const deptIds = [...new Set(employees.map(e => e.department_id).filter(Boolean))];
  const desigIds = [...new Set(employees.map(e => e.designation_id).filter(Boolean))];

  // Fetch departments, designations, and divisions
  const [departments, designations, divisions] = await Promise.all([
    Department.find({ _id: { $in: deptIds } }).select('_id name code'),
    Designation.find({ _id: { $in: desigIds } }).select('_id name code'),
    Division.find({ _id: { $in: employees.map(e => e.division_id).filter(Boolean) } }).select('_id name code'),
  ]);

  // Create lookup maps
  const deptMap = new Map(departments.map(d => [d._id.toString(), d]));
  const desigMap = new Map(designations.map(d => [d._id.toString(), d]));
  const divMap = new Map(divisions.map(d => [d._id.toString(), d]));

  // Resolve references
  return employees.map(emp => ({
    ...emp,
    division: emp.division_id ? divMap.get(emp.division_id.toString()) : null,
    department: emp.department_id ? deptMap.get(emp.department_id.toString()) : null,
    designation: emp.designation_id ? desigMap.get(emp.designation_id.toString()) : null,
  }));
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
const populateUsersInDynamicFields = async (dynamicFields) => {
  if (!dynamicFields || typeof dynamicFields !== 'object') {
    return dynamicFields || {};
  }

  const populated = { ...dynamicFields };

  // Check if reporting_to or reporting_to_ exists and is an array of ObjectIds
  // Handle both field names (reporting_to and reporting_to_)
  const reportingToField = populated.reporting_to || populated.reporting_to_;

  if (reportingToField && Array.isArray(reportingToField) && reportingToField.length > 0) {
    try {
      const fieldName = populated.reporting_to ? 'reporting_to' : 'reporting_to_';
      console.log(`Found ${fieldName} field:`, JSON.stringify(reportingToField));
      // Check if already populated (has user objects with name property)
      const isAlreadyPopulated = reportingToField[0] && typeof reportingToField[0] === 'object' && reportingToField[0].name;
      console.log('Is already populated:', isAlreadyPopulated);

      if (!isAlreadyPopulated) {
        // Filter valid ObjectIds and convert to strings
        const userIds = [];
        for (const id of reportingToField) {
          if (typeof id === 'string') {
            if (mongoose.Types.ObjectId.isValid(id)) {
              userIds.push(id);
            }
          } else if (id && typeof id === 'object') {
            if (id._id && mongoose.Types.ObjectId.isValid(id._id)) {
              userIds.push(id._id.toString());
            } else if (mongoose.Types.ObjectId.isValid(id)) {
              userIds.push(id.toString());
            }
          } else if (id && id.toString && typeof id.toString === 'function') {
            const idStr = id.toString();
            if (mongoose.Types.ObjectId.isValid(idStr)) {
              userIds.push(idStr);
            }
          }
        }

        if (userIds.length > 0) {
          // Convert string ObjectIds to mongoose ObjectIds for query
          const objectIds = userIds.map(id => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch (e) {
              return null;
            }
          }).filter(Boolean);

          if (objectIds.length > 0) {
            // Fetch users
            const users = await User.find({ _id: { $in: objectIds } })
              .select('_id name email role')
              .lean();

            // Create a map for quick lookup (using both string and ObjectId keys)
            const userMap = new Map();
            users.forEach(u => {
              const idStr = u._id.toString();
              userMap.set(idStr, u);
              // Also add with ObjectId key for matching
              userMap.set(u._id, u);
            });

            // Replace ObjectIds with populated user objects, preserving order
            populated[fieldName] = reportingToField.map(id => {
              let idStr;
              if (typeof id === 'string') {
                idStr = id;
              } else if (id && typeof id === 'object') {
                if (id._id) {
                  idStr = id._id.toString();
                } else if (id.toString && typeof id.toString === 'function') {
                  idStr = id.toString();
                } else {
                  idStr = String(id);
                }
              } else {
                idStr = String(id);
              }

              // Try to find user by string ID
              const user = userMap.get(idStr);
              if (user) {
                return user;
              }

              // Try to find by ObjectId if id is an object
              if (typeof id === 'object' && id._id) {
                const userById = userMap.get(id._id);
                if (userById) return userById;
              }

              // If not found, return original ID
              return id;
            });

            console.log(`Populated ${users.length} of ${userIds.length} users for ${fieldName} field`);
            console.log(`Populated ${fieldName}:`, JSON.stringify(populated[fieldName]));
          } else {
            console.log('No valid ObjectIds could be created from userIds array. userIds:', userIds);
          }
        } else {
          console.log(`No valid ObjectIds found in ${fieldName} array. Original array:`, JSON.stringify(reportingToField));
        }
      }
    } catch (error) {
      console.error('Error populating users in reporting_to:', error);
      console.error('Error details:', error.message, error.stack);
      // Keep original IDs if population fails
    }
  }

  return populated;
};

/**
 * Transform employee data for API response
 * Merges permanent fields and dynamicFields for unified access
 * 
 * @param {Object} employee - Employee document or plain object
 * @param {Boolean} populateUsers - Whether to populate user ObjectIds in dynamicFields
 * @returns {Object} Transformed employee data
 */
const transformEmployeeForResponse = async (employee, populateUsers = true) => {
  if (!employee) return null;

  const plainObj = toPlainObject(employee);
  const { dynamicFields, ...permanentFields } = plainObj;

  // Populate users in dynamicFields if needed
  let populatedDynamicFields = dynamicFields || {};
  if (populateUsers && dynamicFields) {
    populatedDynamicFields = await populateUsersInDynamicFields(dynamicFields);
  }

  // Merge dynamicFields into root level for easy access
  // Also keep dynamicFields separate for reference
  const merged = {
    ...permanentFields,
    ...populatedDynamicFields,
    dynamicFields: populatedDynamicFields,
  };

  // Normalize reporting_to_ to reporting_to (handle field name inconsistency)
  if (merged.reporting_to_ && !merged.reporting_to) {
    merged.reporting_to = merged.reporting_to_;
    delete merged.reporting_to_;
  }
  if (merged.dynamicFields?.reporting_to_ && !merged.dynamicFields?.reporting_to) {
    merged.dynamicFields.reporting_to = merged.dynamicFields.reporting_to_;
    delete merged.dynamicFields.reporting_to_;
  }

  // Also populate reporting_to if it exists at root level (from previous merge)
  const rootReportingTo = merged.reporting_to;
  if (populateUsers && rootReportingTo && Array.isArray(rootReportingTo) && rootReportingTo.length > 0) {
    const isAlreadyPopulated = rootReportingTo[0] && typeof rootReportingTo[0] === 'object' && rootReportingTo[0].name;
    if (!isAlreadyPopulated) {
      // Populate reporting_to at root level
      const populatedRoot = await populateUsersInDynamicFields({ reporting_to: rootReportingTo });
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
    const { is_active, division_id, department_id, designation_id, includeLeft } = req.query;
    const { scopeFilter } = req; // Get scope filter from data scope middleware
    const settings = await getEmployeeSettings();

    let employees = [];

    // Build filters - merge scope filter with query filters
    const filters = { ...scopeFilter };
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (division_id) filters.division_id = division_id;
    if (department_id) filters.department_id = department_id;
    if (designation_id) filters.designation_id = designation_id;

    // By default, exclude employees who have left (unless includeLeft=true)
    if (includeLeft !== 'true') {
      filters.leftDate = null;
    }

    console.log('[Employee Controller] Scope filters:', filters);

    // Fetch based on data source setting
    if (settings.dataSource === 'mssql' && isHRMSConnected()) {
      // Fetch from MSSQL
      const mssqlEmployees = await getAllEmployeesMSSQL(filters);
      employees = await resolveEmployeeReferences(mssqlEmployees);
    } else {
      // Fetch from MongoDB (default)
      const query = { ...filters };

      const mongoEmployees = await Employee.find(query)
        .populate('division_id', 'name code')
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code')
        .sort({ employee_name: 1 });

      // Transform employees with user population
      employees = await Promise.all(mongoEmployees.map(async (emp) => {
        const transformed = await transformEmployeeForResponse(emp, true);
        return {
          ...transformed,
          division: transformed.division_id,
          department: transformed.department_id,
          designation: transformed.designation_id,
          paidLeaves: transformed.paidLeaves !== undefined && transformed.paidLeaves !== null ? Number(transformed.paidLeaves) : 0,
          allottedLeaves: transformed.allottedLeaves !== undefined && transformed.allottedLeaves !== null ? Number(transformed.allottedLeaves) : 0,
          employeeAllowances: transformed.employeeAllowances || [],
          employeeDeductions: transformed.employeeDeductions || [],
          ctcSalary: transformed.ctcSalary !== undefined && transformed.ctcSalary !== null ? Number(transformed.ctcSalary) : null,
          calculatedSalary: transformed.calculatedSalary !== undefined && transformed.calculatedSalary !== null ? Number(transformed.calculatedSalary) : null,
        };
      }));
    }

    res.status(200).json({
      success: true,
      count: employees.length,
      dataSource: settings.dataSource,
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
 * @desc    Get single employee
 * @route   GET /api/employees/:empNo
 * @access  Private
 */
exports.getEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const settings = await getEmployeeSettings();

    let employee = null;

    if (settings.dataSource === 'mssql' && isHRMSConnected()) {
      const mssqlEmployee = await getEmployeeByIdMSSQL(empNo);
      if (mssqlEmployee) {
        const resolved = await resolveEmployeeReferences([mssqlEmployee]);
        employee = resolved[0];
      }
    } else {
      const mongoEmployee = await Employee.findOne({ emp_no: empNo })
        .populate('division_id', 'name code')
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code');

      if (mongoEmployee) {
        const transformed = await transformEmployeeForResponse(mongoEmployee, true);
        employee = {
          ...transformed,
          division: transformed.division_id,
          department: transformed.department_id,
          designation: transformed.designation_id,
          // Explicitly ensure paidLeaves and allottedLeaves are included
          paidLeaves: transformed.paidLeaves !== undefined && transformed.paidLeaves !== null ? Number(transformed.paidLeaves) : 0,
          allottedLeaves: transformed.allottedLeaves !== undefined && transformed.allottedLeaves !== null ? Number(transformed.allottedLeaves) : 0,
          // Explicitly include allowances, deductions, and calculated salaries
          employeeAllowances: transformed.employeeAllowances || [],
          employeeDeductions: transformed.employeeDeductions || [],
          ctcSalary: transformed.ctcSalary !== undefined && transformed.ctcSalary !== null ? Number(transformed.ctcSalary) : null,
          calculatedSalary: transformed.calculatedSalary !== undefined && transformed.calculatedSalary !== null ? Number(transformed.calculatedSalary) : null,
        };
      }
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

    // Validate required fields
    if (!employeeData.emp_no) {
      return res.status(400).json({
        success: false,
        message: 'Employee number (emp_no) is required',
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

    const results = { mongodb: false, mssql: false };

    // Separate permanent fields and dynamicFields
    // Separate permanent fields and dynamicFields
    const permanentFields = extractPermanentFields(employeeData);
    const dynamicFields = employeeData.dynamicFields ?
      (typeof employeeData.dynamicFields === 'string' ? JSON.parse(employeeData.dynamicFields) : employeeData.dynamicFields)
      : extractDynamicFields(employeeData, permanentFields);

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
      const settings = await EmployeeApplicationFormSettings.getActiveSettings();
      // Use helper to parse, upload, and resolve
      qualifications = await processQualifications(req, settings);
      console.log('[createEmployee] Final Qualifications:', JSON.stringify(qualifications));
    } catch (err) {
      console.error('Error processing qualifications:', err);
    }

    // Generate password
    const rawPassword = await generatePassword(employeeData, passwordMode || null);

    // Create in MongoDB (MANDATORY)
    try {
      const mongoEmployee = await Employee.create({
        ...permanentFields,
        qualifications, // Explicitly save resolved qualifications
        dynamicFields: Object.keys(dynamicFields).length > 0 ? dynamicFields : {},
        emp_no: String(employeeData.emp_no || '').toUpperCase(),
        employeeAllowances,
        employeeDeductions,
        password: rawPassword, // Will be hashed by pre-save hook
      });
      results.mongodb = true;
    } catch (mongoError) {
      console.error('MongoDB create error:', mongoError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create employee in MongoDB',
        error: mongoError.message,
      });
    }

    // Create in MSSQL (OPTIONAL/FAIL-SAFE)
    if (isHRMSConnected()) {
      try {
        await createEmployeeMSSQL({
          ...permanentFields,
          emp_no: String(employeeData.emp_no || '').toUpperCase(),
          department_id: permanentFields.department_id?.toString() || null,
          designation_id: permanentFields.designation_id?.toString() || null,
        });
        results.mssql = true;
      } catch (mssqlError) {
        console.error('MSSQL create error (non-blocking):', mssqlError.message);
        // We don't return error here because MongoDB succeeded
      }
    } else {
      console.warn('MSSQL not connected, skipping employee sync (non-blocking)');
    }

    // Fetch the created employee
    const createdEmployee = await Employee.findOne({ emp_no: String(employeeData.emp_no || '').toUpperCase() })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');

    // Send notifications
    const notificationResults = await sendCredentials(
      createdEmployee,
      rawPassword,
      notificationChannels || { email: true, sms: true }
    );

    res.status(201).json({
      success: true,
      message: results.mssql
        ? 'Employee created successfully in both databases'
        : 'Employee created successfully in MongoDB. MSSQL sync skipped/failed.',
      savedTo: results,
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

    // Check if employee exists
    const existingEmployee = await Employee.findOne({ emp_no: empNo });
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
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
      employeeData.allottedLeaves !== undefined
    );

    // Only validate if dynamicFields are being updated (not for simple permanent field updates)
    if (hasDynamicFieldsUpdate && !hasOnlyPermanentFieldsUpdate) {
      const settings = await EmployeeApplicationFormSettings.getActiveSettings();
      if (settings) {
        // Merge existing employee data with update data for validation
        const mergedData = {
          ...existingEmployee.toObject(),
          ...employeeData,
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

    // Separate permanent fields and dynamicFields
    // Separate permanent fields and dynamicFields
    const permanentFields = extractPermanentFields(employeeData);
    const dynamicFields = employeeData.dynamicFields ?
      (typeof employeeData.dynamicFields === 'string' ? JSON.parse(employeeData.dynamicFields) : employeeData.dynamicFields)
      : extractDynamicFields(employeeData, permanentFields);

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
      const settings = await EmployeeApplicationFormSettings.getActiveSettings();
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

    const results = { mongodb: false, mssql: false };

    // Update in MongoDB (MANDATORY)
    try {
      // Ensure paidLeaves is explicitly set (even if 0)
      const updateData = {
        ...permanentFields,
        qualifications, // Explicitly save resolved qualifications
        dynamicFields: Object.keys(dynamicFields).length > 0 ? dynamicFields : existingEmployee.dynamicFields || {},
        employeeAllowances,
        employeeDeductions,
        ctcSalary,
        calculatedSalary,
        updated_at: new Date(),
      };
      // Explicitly handle paidLeaves to ensure it's saved even if 0
      if (employeeData.paidLeaves !== undefined && employeeData.paidLeaves !== null) {
        updateData.paidLeaves = Number(employeeData.paidLeaves);
      }
      // Explicitly handle allottedLeaves to ensure it's saved even if 0
      if (employeeData.allottedLeaves !== undefined && employeeData.allottedLeaves !== null) {
        updateData.allottedLeaves = Number(employeeData.allottedLeaves);
      }

      await Employee.findOneAndUpdate(
        { emp_no: empNo },
        updateData,
        { new: true }
      );
      results.mongodb = true;
    } catch (mongoError) {
      console.error('MongoDB update error:', mongoError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update employee in MongoDB',
        error: mongoError.message,
      });
    }

    // Update in MSSQL (OPTIONAL/FAIL-SAFE)
    let mssqlSyncError = null;

    // Update in MSSQL (OPTIONAL/FAIL-SAFE)
    if (isHRMSConnected()) {
      try {
        const mssqlUpdateData = { ...permanentFields };
        if (permanentFields.department_id !== undefined) {
          mssqlUpdateData.department_id = permanentFields.department_id?.toString() || null;
        }
        if (permanentFields.designation_id !== undefined) {
          mssqlUpdateData.designation_id = permanentFields.designation_id?.toString() || null;
        }
        await updateEmployeeMSSQL(empNo, mssqlUpdateData);
        results.mssql = true;
      } catch (mssqlError) {
        console.error('MSSQL update error (non-blocking):', mssqlError);
        mssqlSyncError = {
          message: mssqlError.message,
          code: mssqlError.code,
          originalError: mssqlError.originalError ? mssqlError.originalError.message : null
        };
      }
    } else {
      console.warn('MSSQL not connected, skipping employee update sync (non-blocking)');
    }

    // Fetch updated employee
    const updatedEmployeeDoc = await Employee.findOne({ emp_no: empNo })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');

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

    res.status(200).json({
      success: true,
      message: results.mssql
        ? 'Employee updated successfully in both databases'
        : 'Employee updated successfully in MongoDB. MSSQL sync skipped/failed.',
      savedTo: results,
      syncError: mssqlSyncError,
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
    const settings = await getEmployeeSettings();

    // Check if employee exists
    const existingEmployee = await Employee.findOne({ emp_no: empNo });
    const existsMSSql = isHRMSConnected() ? await employeeExistsMSSQL(empNo) : false;

    if (!existingEmployee && !existsMSSql) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    const results = { mongodb: false, mssql: false };

    // Delete based on settings
    if (settings.deleteTarget === 'mongodb' || settings.deleteTarget === 'both') {
      try {
        if (existingEmployee) {
          await Employee.findOneAndDelete({ emp_no: empNo });
          results.mongodb = true;
        }
      } catch (mongoError) {
        console.error('MongoDB delete error:', mongoError);
      }
    }

    if (settings.deleteTarget === 'mssql' || settings.deleteTarget === 'both') {
      if (isHRMSConnected()) {
        try {
          await deleteEmployeeMSSQL(empNo);
          results.mssql = true;
        } catch (mssqlError) {
          console.error('MSSQL delete error:', mssqlError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
      deletedFrom: results,
      deleteTarget: settings.deleteTarget,
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
    const mssqlConnected = isHRMSConnected();

    res.status(200).json({
      success: true,
      data: {
        ...settings,
        mssqlConnected,
      },
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

    // Update left date and deactivate
    employee.leftDate = leftDateObj;
    employee.leftReason = leftReason || null;
    employee.is_active = false; // Deactivate when left date is set

    await employee.save();

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
    const { empNo } = req.params;

    // Find employee
    const employee = await Employee.findOne({ emp_no: empNo.toUpperCase() });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Remove left date and reactivate
    employee.leftDate = null;
    employee.leftReason = null;
    employee.is_active = true;

    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Employee reactivated successfully',
      data: {
        emp_no: employee.emp_no,
        employee_name: employee.employee_name,
        leftDate: employee.leftDate,
        leftReason: employee.leftReason,
        is_active: employee.is_active,
      },
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
    const { passwordMode, notificationChannels } = req.body;

    const employee = await Employee.findOne({ emp_no: empNo.toUpperCase() });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Generate a new temporary password
    const newPassword = await generatePassword(employee, passwordMode || null);
    employee.password = newPassword;
    await employee.save();

    // Send credentials
    const notificationResults = await sendCredentials(
      employee,
      newPassword,
      notificationChannels || { email: true, sms: true }
    );

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

      exportData.push({
        emp_no: emp.emp_no,
        employee_name: emp.employee_name,
        email: emp.email,
        phone: emp.phone_number,
        password: newPassword
      });
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
