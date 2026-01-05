/**
 * Employee Application Controller
 * Handles employee application workflow: HR creates → Superadmin approves/rejects
 */

const EmployeeApplication = require('../model/EmployeeApplication');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const EmployeeApplicationFormSettings = require('../model/EmployeeApplicationFormSettings');
const {
  validateFormData,
  transformFormData,
} = require('../services/formValidationService');
const {
  transformApplicationToEmployee,
} = require('../services/fieldMappingService');
const sqlHelper = require('../../employees/config/sqlHelper');
const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
const s3UploadService = require('../../shared/services/s3UploadService');
const { resolveQualificationLabels } = require('../services/fieldMappingService');

/**
 * Internal helper for creating a single application
 * Used by createApplication and bulkCreateApplications
 */
const createApplicationInternal = async (rawData, settings, creatorId) => {
  let applicationData = { ...rawData };

  // PARSE JSON fields if they are strings (usually from FormData in single creation)
  const jsonFields = ['dynamicFields', 'qualifications', 'employeeAllowances', 'employeeDeductions', 'department', 'designation'];
  jsonFields.forEach(field => {
    if (typeof applicationData[field] === 'string') {
      try {
        applicationData[field] = JSON.parse(applicationData[field]);
      } catch (e) {
        // Skip for bulk if already objects
      }
    }
  });

  // Basic validation if no settings
  if (!settings) {
    if (!applicationData.emp_no) throw new Error('Employee number (emp_no) is required');
    if (!applicationData.employee_name) throw new Error('Employee name is required');
    if (!applicationData.proposedSalary) throw new Error('Proposed salary is required');
  } else {
    const validation = await validateFormData(applicationData, settings);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${Object.values(validation.errors).flat().join(', ')}`);
    }
  }

  const empNo = String(applicationData.emp_no || '').toUpperCase();

  // Check if employee already exists
  const existingEmployee = await Employee.findOne({ emp_no: empNo });
  if (existingEmployee) {
    throw new Error(`Employee with number ${empNo} already exists`);
  }

  // Check if pending application already exists
  const existingApplication = await EmployeeApplication.findOne({
    emp_no: empNo,
    status: 'pending',
  });
  if (existingApplication) {
    throw new Error(`Pending application already exists for employee number ${empNo}`);
  }

  // Transform form data
  const { permanentFields, dynamicFields } = transformFormData(applicationData, settings);

  // Ensure qualifications (if provided) are handled and labels are resolved
  if (applicationData.qualifications) {
    if (settings && Array.isArray(applicationData.qualifications)) {
      permanentFields.qualifications = resolveQualificationLabels(applicationData.qualifications, settings);
    } else {
      permanentFields.qualifications = applicationData.qualifications;
    }
  }

  const normalizeOverrides = (list) =>
    Array.isArray(list)
      ? list
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

  const employeeAllowances = normalizeOverrides(applicationData.employeeAllowances);
  const employeeDeductions = normalizeOverrides(applicationData.employeeDeductions);

  // Create application
  const application = await EmployeeApplication.create({
    ...permanentFields,
    dynamicFields: dynamicFields,
    emp_no: empNo,
    employeeAllowances,
    employeeDeductions,
    createdBy: creatorId,
    status: 'pending',
  });

  return application;
};

/**
 * @desc    Create employee application (HR)
 * @route   POST /api/employee-applications
 * @access  Private (HR, Sub Admin, Super Admin)
 */
exports.createApplication = async (req, res) => {
  console.log('[CreateApplication] Received request');
  try {
    let applicationData = { ...req.body };

    // Handle Qualifications Files (only for single creation)
    if (req.files && applicationData.qualifications) {
      // We need to parse it first to modify
      if (typeof applicationData.qualifications === 'string') {
        applicationData.qualifications = JSON.parse(applicationData.qualifications);
      }

      if (Array.isArray(applicationData.qualifications)) {
        const fileMap = {};
        req.files.forEach(f => { fileMap[f.fieldname] = f; });

        for (let i = 0; i < applicationData.qualifications.length; i++) {
          const file = fileMap[`qualification_cert_${i}`];
          if (file) {
            try {
              const uploadResult = await s3UploadService.uploadToS3(
                file.buffer,
                file.originalname,
                file.mimetype,
                'hrms/certificates'
              );
              applicationData.qualifications[i].certificateUrl = uploadResult;
            } catch (err) {
              console.error(`[CreateApplication] S3 Upload Failed for [${i}]:`, err);
            }
          }
        }
      }
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    const application = await createApplicationInternal(applicationData, settings, req.user._id);

    await application.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'division_id', select: 'name' },
      { path: 'department_id', select: 'name code' },
      { path: 'designation_id', select: 'name code' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Employee application created successfully',
      data: application,
    });
  } catch (error) {
    console.error('Error creating employee application:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create employee application',
    });
  }
};

/**
 * @desc    Bulk create employee applications (HR)
 * @route   POST /api/employee-applications/bulk
 * @access  Private (HR, Sub Admin, Super Admin)
 */
exports.bulkCreateApplications = async (req, res) => {
  console.log('[BulkCreateApplications] Received request');
  try {
    const applications = req.body;

    if (!Array.isArray(applications) || applications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: Expected a non-empty array of applications',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    const creatorId = req.user._id;

    // 1. Pre-fetch existing and pending emp_no for duplicate checking
    const empNos = applications.map(app => String(app.emp_no || '').toUpperCase()).filter(Boolean);
    const [existingEmployees, pendingApps] = await Promise.all([
      Employee.find({ emp_no: { $in: empNos } }).select('emp_no'),
      EmployeeApplication.find({ emp_no: { $in: empNos }, status: 'pending' }).select('emp_no')
    ]);

    const existingEmpSet = new Set(existingEmployees.map(e => e.emp_no.toUpperCase()));
    const pendingAppSet = new Set(pendingApps.map(a => a.emp_no.toUpperCase()));

    const itemsToInsert = [];
    const results = {
      successCount: 0,
      failCount: 0,
      errors: [],
    };

    const normalizeOverrides = (list) =>
      Array.isArray(list)
        ? list
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

    // 2. Process and Validate in memory
    for (const appData of applications) {
      const empNo = String(appData.emp_no || '').toUpperCase();

      try {
        // Validation
        if (settings) {
          const validation = await validateFormData(appData, settings);
          if (!validation.isValid) {
            throw new Error(`Validation: ${Object.values(validation.errors).flat().join(', ')}`);
          }
        } else if (!appData.emp_no || !appData.employee_name || !appData.proposedSalary) {
          throw new Error('Basic validation failed: emp_no, employee_name, and proposedSalary are required');
        }

        // Duplicate Check
        if (existingEmpSet.has(empNo)) throw new Error(`Employee with number ${empNo} already exists`);
        if (pendingAppSet.has(empNo)) throw new Error(`Pending application already exists for employee number ${empNo}`);

        // Transformation
        const { permanentFields, dynamicFields } = transformFormData(appData, settings);

        // Qualifications
        if (appData.qualifications) {
          if (settings && Array.isArray(appData.qualifications)) {
            permanentFields.qualifications = resolveQualificationLabels(appData.qualifications, settings);
          } else {
            permanentFields.qualifications = appData.qualifications;
          }
        }

        itemsToInsert.push({
          ...permanentFields,
          dynamicFields,
          emp_no: empNo,
          employeeAllowances: normalizeOverrides(appData.employeeAllowances),
          employeeDeductions: normalizeOverrides(appData.employeeDeductions),
          createdBy: creatorId,
          status: 'pending',
        });

        // Add to "seen" set to catch duplicates within the same file
        pendingAppSet.add(empNo);

      } catch (err) {
        results.failCount++;
        results.errors.push({
          emp_no: appData.emp_no || 'Unknown',
          name: appData.employee_name || 'Unknown',
          message: err.message,
        });
      }
    }

    // 3. Batch Insert
    if (itemsToInsert.length > 0) {
      await EmployeeApplication.insertMany(itemsToInsert);
      results.successCount = itemsToInsert.length;
    }

    res.status(200).json({
      success: results.failCount === 0,
      message: `Bulk processing complete. ${results.successCount} succeeded, ${results.failCount} failed.`,
      data: results,
    });
  } catch (error) {
    console.error('Error in bulk creating applications:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error occurred during bulk processing',
    });
  }
};

/**
 * @desc    Update employee application (HR/Admin)
 * @route   PUT /api/employee-applications/:id
 * @access  Private (HR, Sub Admin, Super Admin)
 */
exports.updateApplication = async (req, res) => {
  console.log('[UpdateApplication] Received request for:', req.params.id);
  console.log('[UpdateApplication] Files:', req.files ? req.files.map(f => f.fieldname) : 'No files');

  try {
    const applicationId = req.params.id;
    let applicationData = { ...req.body };

    const existingApplication = await EmployeeApplication.findById(applicationId);
    if (!existingApplication) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // PARSE JSON STRINGIFIED FIELDS
    const jsonFields = ['dynamicFields', 'qualifications', 'employeeAllowances', 'employeeDeductions', 'department', 'designation'];
    jsonFields.forEach(field => {
      if (typeof applicationData[field] === 'string') {
        try {
          applicationData[field] = JSON.parse(applicationData[field]);
        } catch (e) {
          console.warn(`[UpdateApplication] Failed to parse JSON for field ${field}:`, e.message);
        }
      }
    });

    // Handle Qualifications Files (Replacement Logic)
    if (applicationData.qualifications && Array.isArray(applicationData.qualifications)) {
      const fileMap = {};
      if (req.files) {
        req.files.forEach(f => { fileMap[f.fieldname] = f; });
      }

      for (let i = 0; i < applicationData.qualifications.length; i++) {
        const file = fileMap[`qualification_cert_${i}`];
        // Preserve existing URL if no new file is uploaded
        // But wait, the frontend might send the 'certificateUrl' string if it wasn't valid.
        // If a new file is uploaded, we replace.

        if (file) {
          console.log(`[UpdateApplication] Replacing cert for qualification [${i}]`);

          // Check for existing URL to delete
          const oldUrl = existingApplication.qualifications[i]?.certificateUrl;

          try {
            // Upload new
            const uploadResult = await s3UploadService.uploadToS3(
              file.buffer,
              file.originalname,
              file.mimetype,
              'hrms/certificates'
            );

            // Delete old if exists
            if (oldUrl) {
              // We perform delete asynchronously or await it. Await is safer.
              await s3UploadService.deleteFromS3(oldUrl).catch(err => console.error('Failed to delete old cert:', err));
            }

            applicationData.qualifications[i].certificateUrl = uploadResult;
          } catch (err) {
            console.error(`[UpdateApplication] S3 Upload Failed for [${i}]:`, err);
          }
        } else {
          // Keep existing URL if not explicitly cleared/changed
          // The frontend should send the existing object. 
          // If the user deleted the file on frontend, 'certificateUrl' might be null in applicationData.
          // We trust applicationData's state (except for the file payload which is separate).
        }
      }
    }

    // Get form settings for validation
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    // Validate (Optional: might skip strict validation on draft updates, but let's keep it safe)
    if (settings) {
      const validation = await validateFormData(applicationData, settings);
      if (!validation.isValid) {
        console.warn('Validation warnings on update:', validation.errors);
        // We might allow partial updates or return error. 
        // Let's enforce validation for consistency.
        // return res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
      }
    }

    // Update fields
    // We explicitly map fields to avoid overwriting metadata like 'status' if not intended, 
    // but here we are basically replacing the content.
    // 'status' should generally remain 'pending' unless specific action taken? 
    // Usually editing resets approvals? Let's assume status stays 'pending'.

    // Transform / Separate Fields
    const { permanentFields, dynamicFields } = transformFormData(applicationData, settings);

    // Resolve labels for qualifications
    if (applicationData.qualifications) {
      if (settings && Array.isArray(applicationData.qualifications)) {
        permanentFields.qualifications = resolveQualificationLabels(applicationData.qualifications, settings);
      } else {
        permanentFields.qualifications = applicationData.qualifications;
      }
    }

    // Helper for allowances
    const normalizeOverrides = (list) => Array.isArray(list) ? list : [];

    // Update document
    Object.assign(existingApplication, {
      ...permanentFields,
      dynamicFields,
      employeeAllowances: normalizeOverrides(applicationData.employeeAllowances),
      employeeDeductions: normalizeOverrides(applicationData.employeeDeductions),
      // Don't update emp_no if it's unique/fixed? Usually allowed to fix typos.
      emp_no: applicationData.emp_no || existingApplication.emp_no
    });

    await existingApplication.save();

    res.status(200).json({
      success: true,
      message: 'Application updated successfully',
      data: existingApplication
    });

  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all employee applications
 * @route   GET /api/employee-applications
 * @access  Private (HR, Sub Admin, Super Admin)
 */
exports.getApplications = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    // HR can only see their own applications, Superadmin can see all
    if (req.user.role === 'hr') {
      filter.createdBy = req.user._id;
    }

    const applications = await EmployeeApplication.find(filter)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('division_id', 'name')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error('Error fetching employee applications:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch employee applications',
    });
  }
};

/**
 * @desc    Get single employee application
 * @route   GET /api/employee-applications/:id
 * @access  Private (HR, Sub Admin, Super Admin)
 */
exports.getApplication = async (req, res) => {
  try {
    const application = await EmployeeApplication.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('division_id', 'name')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Employee application not found',
      });
    }

    // HR can only see their own applications
    if (req.user.role === 'hr' && application.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application',
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error('Error fetching employee application:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch employee application',
    });
  }
};

/**
 * Helper logic for approving a single application
 * This contains the core logic to be shared between individual and bulk approval
 */
const approveSingleApplicationInternal = async (applicationId, approvalData, approverId) => {
  const { approvedSalary, doj, comments, employeeAllowances, employeeDeductions, ctcSalary, calculatedSalary } = approvalData;

  const application = await EmployeeApplication.findById(applicationId);

  if (!application) {
    throw new Error('Employee application not found');
  }

  if (application.status !== 'pending') {
    throw new Error(`Application for ${application.emp_no} is already ${application.status}`);
  }

  // Use approvedSalary if provided, otherwise use proposedSalary
  const finalSalary = approvedSalary !== undefined ? approvedSalary : application.proposedSalary;

  if (!finalSalary || finalSalary <= 0) {
    throw new Error(`Valid approved salary is required for ${application.emp_no}`);
  }

  // Determine DOJ: use provided doj, or default to current date
  const finalDOJ = doj ? new Date(doj) : new Date();

  // Set approval data but DON'T SAVE YET
  application.status = 'approved';
  application.approvedSalary = finalSalary;
  application.doj = finalDOJ;
  application.approvedBy = approverId;
  application.approvalComments = comments || null;
  application.approvedAt = new Date();

  // Normalize employee allowances and deductions
  const normalizeOverrides = (list) =>
    Array.isArray(list)
      ? list
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

  let finalEmployeeAllowances = employeeAllowances ? normalizeOverrides(employeeAllowances) : (application.employeeAllowances || []);
  let finalEmployeeDeductions = employeeDeductions ? normalizeOverrides(employeeDeductions) : (application.employeeDeductions || []);

  let finalCtcSalary = ctcSalary !== undefined && ctcSalary !== null ? ctcSalary : null;
  let finalCalculatedSalary = calculatedSalary !== undefined && calculatedSalary !== null ? calculatedSalary : null;

  if ((finalCtcSalary === null || finalCalculatedSalary === null) && (finalEmployeeAllowances.length > 0 || finalEmployeeDeductions.length > 0)) {
    const totalAllowances = (finalEmployeeAllowances || []).reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalDeductions = (finalEmployeeDeductions || []).reduce((sum, d) => sum + (d.amount || 0), 0);
    if (finalCtcSalary === null) finalCtcSalary = finalSalary + totalAllowances;
    if (finalCalculatedSalary === null) finalCalculatedSalary = finalSalary + totalAllowances - totalDeductions;
  }

  application.employeeAllowances = finalEmployeeAllowances;
  application.employeeDeductions = finalEmployeeDeductions;
  application.ctcSalary = finalCtcSalary;
  application.calculatedSalary = finalCalculatedSalary;

  // Resolve Qualification Labels if stored as IDs (for existing applications or robustness)
  const appObj = application.toObject();
  if (appObj.qualifications && Array.isArray(appObj.qualifications)) {
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (settings) {
      appObj.qualifications = resolveQualificationLabels(appObj.qualifications, settings);
    }
  }

  const { permanentFields, dynamicFields } = transformApplicationToEmployee(
    appObj,
    {
      gross_salary: finalSalary,
      doj: finalDOJ,
      ctcSalary: finalCtcSalary,
      calculatedSalary: finalCalculatedSalary,
    }
  );

  const employeeData = {
    ...permanentFields,
    dynamicFields: dynamicFields || {},
    employeeAllowances: finalEmployeeAllowances,
    employeeDeductions: finalEmployeeDeductions,
    ctcSalary: finalCtcSalary,
    calculatedSalary: finalCalculatedSalary,
  };

  const results = { mongodb: false, mssql: false };

  const password = await generatePassword(employeeData, null);
  employeeData.password = password;

  // Create in MongoDB
  try {
    await Employee.create(employeeData);
    results.mongodb = true;
    await application.save();
  } catch (mongoError) {
    console.error(`[ApproveApplication] MongoDB create error for ${employeeData.emp_no}:`, mongoError);
    throw new Error(`Failed to create employee record in MongoDB for ${employeeData.emp_no}`);
  }

  // Create in MSSQL (OPTIONAL/FAIL-SAFE)
  const { isHRMSConnected, employeeExistsMSSQL, createEmployeeMSSQL } = sqlHelper;
  if (isHRMSConnected && isHRMSConnected()) {
    try {
      const existsInMSSQL = await employeeExistsMSSQL(employeeData.emp_no);
      if (!existsInMSSQL) {
        await createEmployeeMSSQL(employeeData);
        results.mssql = true;
      }
    } catch (mssqlError) {
      console.error(`[ApproveApplication] MSSQL sync error (non-blocking) for ${employeeData.emp_no}:`, mssqlError.message);
    }
  }

  // Send credentials notification
  let notificationResults = null;
  if (results.mongodb) {
    try {
      notificationResults = await sendCredentials(
        employeeData,
        password,
        { email: true, sms: true }
      );
    } catch (notifError) {
      console.error(`[ApproveApplication] Notification error (non-blocking) for ${employeeData.emp_no}:`, notifError.message);
    }
  }

  return { application, results, notificationResults };
};

/**
 * @desc    Approve employee application (Superadmin)
 * @route   PUT /api/employee-applications/:id/approve
 * @access  Private (Super Admin, Sub Admin)
 */
exports.approveApplication = async (req, res) => {
  try {
    // Only Superadmin and Sub Admin can approve
    if (!['super_admin', 'sub_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve applications',
      });
    }

    const result = await approveSingleApplicationInternal(req.params.id, req.body, req.user._id);

    await result.application.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
      { path: 'division_id', select: 'name' },
      { path: 'department_id', select: 'name code' },
      { path: 'designation_id', select: 'name code' },
    ]);

    res.status(200).json({
      success: true,
      message: result.results.mssql
        ? 'Employee application approved and employee created successfully in both databases'
        : 'Employee application approved and employee created successfully in MongoDB. MSSQL sync skipped/failed.',
      data: result.application,
      savedTo: result.results,
      notificationResults: result.notificationResults
    });
  } catch (error) {
    console.error('Error approving employee application:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: error.message || 'Failed to approve employee application',
    });
  }
};

/**
 * @desc    Bulk approve employee applications (Superadmin)
 * @route   PUT /api/employee-applications/bulk-approve
 * @access  Private (Super Admin, Sub Admin)
 */
exports.bulkApproveApplications = async (req, res) => {
  try {
    const { applicationIds, bulkSettings } = req.body;

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No application IDs provided',
      });
    }

    // Only Superadmin and Sub Admin can approve
    if (!['super_admin', 'sub_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve applications',
      });
    }

    const results = {
      successCount: 0,
      failCount: 0,
      errors: [],
    };

    // Process applications one by one (to avoid too much concurrent load and handle individual errors)
    for (const id of applicationIds) {
      try {
        await approveSingleApplicationInternal(id, bulkSettings || {}, req.user._id);
        results.successCount++;
      } catch (error) {
        results.failCount++;
        results.errors.push({ id, message: error.message });
        console.error(`Bulk approval failed for application ${id}:`, error.message);
      }
    }

    res.status(200).json({
      success: results.failCount === 0,
      message: `Bulk approval completed: ${results.successCount} succeeded, ${results.failCount} failed.`,
      data: results,
    });
  } catch (error) {
    console.error('Error in bulk approving applications:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error occurred during bulk approval',
    });
  }
};

/**
 * @desc    Reject employee application (Superadmin)
 * @route   PUT /api/employee-applications/:id/reject
 * @access  Private (Super Admin, Sub Admin)
 */
exports.rejectApplication = async (req, res) => {
  try {
    const { comments } = req.body;

    // Only Superadmin and Sub Admin can reject
    if (!['super_admin', 'sub_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject applications',
      });
    }

    const application = await EmployeeApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Employee application not found',
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Application is already ${application.status}`,
      });
    }

    // Update application status
    application.status = 'rejected';
    application.rejectedBy = req.user._id;
    application.rejectionComments = comments || null;
    application.rejectedAt = new Date();

    await application.save();

    await application.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'rejectedBy', select: 'name email' },
      { path: 'rejectedBy', select: 'name email' },
      { path: 'division_id', select: 'name' },
      { path: 'department_id', select: 'name code' },
      { path: 'designation_id', select: 'name code' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Employee application rejected',
      data: application,
    });
  } catch (error) {
    console.error('Error rejecting employee application:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject employee application',
    });
  }
};

/**
 * @desc    Bulk reject employee applications (Superadmin)
 * @route   PUT /api/employee-applications/bulk-reject
 * @access  Private (Super Admin, Sub Admin)
 */
exports.bulkRejectApplications = async (req, res) => {
  try {
    const { applicationIds, comments } = req.body;

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No application IDs provided',
      });
    }

    // Only Superadmin and Sub Admin can reject
    if (!['super_admin', 'sub_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject applications',
      });
    }

    const results = {
      successCount: 0,
      failCount: 0,
      errors: [],
    };

    // Process applications one by one
    for (const id of applicationIds) {
      try {
        const application = await EmployeeApplication.findById(id);

        if (!application) {
          throw new Error(`Application ${id} not found`);
        }

        if (application.status !== 'pending') {
          throw new Error(`Application for ${application.emp_no} is already ${application.status}`);
        }

        application.status = 'rejected';
        application.rejectedBy = req.user._id;
        application.rejectionComments = comments || 'Bulk rejected';
        application.rejectedAt = new Date();

        await application.save();
        results.successCount++;
      } catch (error) {
        results.failCount++;
        results.errors.push({ id, message: error.message });
        console.error(`Bulk rejection failed for application ${id}:`, error.message);
      }
    }

    res.status(200).json({
      success: results.failCount === 0,
      message: `Bulk rejection completed: ${results.successCount} succeeded, ${results.failCount} failed.`,
      data: results,
    });
  } catch (error) {
    console.error('Error in bulk rejecting applications:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error occurred during bulk rejection',
    });
  }
};



