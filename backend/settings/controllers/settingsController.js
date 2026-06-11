const Settings = require('../model/Settings');
const { invalidateSecondSalaryFeatureCache } = require('../secondSalaryFeatureGate');
const {
  DEFAULT_COMPANY_PROFILE,
  mergeCompanyProfile,
  validateCompanyProfile,
} = require('../../shared/utils/companyProfile');
const {
  SETTING_KEY: FILE_STORAGE_SETTING_KEY,
  sanitizeForClient,
  validateFileStorageConfig,
  invalidateFileStorageCache,
  mergeConfig,
} = require('../../shared/utils/fileStorageConfig');
const fileStorageService = require('../../shared/services/fileStorageService');

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private
exports.getAllSettings = async (req, res) => {
  try {
    const { category } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    const settings = await Settings.find(query).sort({ category: 1, key: 1 });

    res.status(200).json({
      success: true,
      count: settings.length,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message,
    });
  }
};

// @desc    Get single setting
// @route   GET /api/settings/:key
// @access  Private
exports.getSetting = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: req.params.key });

    if (!setting) {
      // Return default values for known payroll settings to avoid 404 errors on first load
      const defaults = {
        'include_missing_employee_components': true,
        'enable_absent_deduction': false,
        'lop_days_per_absent': 1,
        'auto_reject_pending_requests_on_batch_complete': false,
        'allow_employee_bulk_process': false,
        'custom_employee_grouping_enabled': false,
        'auto_od_creation_enabled': false,
        'leave_attendance_reconciliation_enabled': true,
        'skip_leave_attendance_reconciliation': false,
        'payroll_cycle_start_day': '1',
        'payroll_cycle_end_day': '31',
        'qualification_statuses': [
          { value: 'verified', label: 'Verified' },
          { value: 'partial_verified', label: 'Partially verified' },
          { value: 'taken', label: 'Taken' },
          { value: 'not_submitted', label: 'Not submitted' },
        ],
        'default_apply_statutory_deductions': true,
        'default_apply_attendance_deductions': true,
        'enable_second_salary': true,
        company_profile: DEFAULT_COMPANY_PROFILE,
        [FILE_STORAGE_SETTING_KEY]: sanitizeForClient(mergeConfig(null)),
      };

      if (defaults[req.params.key] !== undefined) {
        const defaultCategory =
          req.params.key === 'company_profile'
            ? 'company'
            : req.params.key === FILE_STORAGE_SETTING_KEY
              ? 'general'
            : ['allow_employee_bulk_process', 'custom_employee_grouping_enabled'].includes(req.params.key)
            ? 'employee'
            : 'payroll';
        return res.status(200).json({
          success: true,
          data: {
            key: req.params.key,
            value: defaults[req.params.key],
            category: defaultCategory,
            isDefault: true
          }
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Setting not found',
      });
    }

    const responseData = setting.toObject ? setting.toObject() : { ...setting };
    if (responseData.key === FILE_STORAGE_SETTING_KEY) {
      responseData.value = sanitizeForClient(responseData.value);
    }

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching setting',
      error: error.message,
    });
  }
};

// @desc    Test file storage connection (S3 or local)
// @route   POST /api/settings/file-storage/test
// @access  Private (Super Admin, Sub Admin)
exports.testFileStorage = async (req, res) => {
  try {
    const payload = req.body?.config;
    let configToTest;

    if (payload && typeof payload === 'object') {
      const existing = await Settings.findOne({ key: FILE_STORAGE_SETTING_KEY }).lean();
      const validation = validateFileStorageConfig(payload, existing?.value);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join('; '),
        });
      }
      configToTest = mergeConfig(validation.normalized);
    } else {
      configToTest = await mergeConfig((await Settings.findOne({ key: FILE_STORAGE_SETTING_KEY }))?.value);
    }

    const result = await fileStorageService.testConnection(configToTest);
    res.status(200).json({
      success: true,
      message:
        configToTest.provider === 'local'
          ? 'Local storage path is writable'
          : 'S3 connection successful',
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'File storage connection test failed',
    });
  }
};

// @desc    Create or update setting
// @route   POST /api/settings
// @route   PUT /api/settings/:key
// @access  Private (Super Admin, Sub Admin)
exports.upsertSetting = async (req, res) => {
  try {
    const { key, value, description, category } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Setting key is required',
      });
    }

    // Validate shift_durations value
    if (key === 'shift_durations') {
      if (!Array.isArray(value)) {
        return res.status(400).json({
          success: false,
          message: 'shift_durations must be an array of numbers',
        });
      }

      // Validate all values are positive numbers
      const invalidValues = value.filter((v) => typeof v !== 'number' || v <= 0);
      if (invalidValues.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'All duration values must be positive numbers',
        });
      }
    }

    // Validate include_missing_employee_components: must be boolean
    if (key === 'include_missing_employee_components') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'include_missing_employee_components must be a boolean',
        });
      }
    }

    // Validate absent deduction settings
    if (key === 'enable_absent_deduction') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enable_absent_deduction must be a boolean',
        });
      }
    }
    if (key === 'lop_days_per_absent') {
      if (typeof value !== 'number' || value < 0) {
        return res.status(400).json({
          success: false,
          message: 'lop_days_per_absent must be a non-negative number',
        });
      }
    }

    if (key === 'auto_reject_pending_requests_on_batch_complete') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'auto_reject_pending_requests_on_batch_complete must be a boolean',
        });
      }
    }

    if (key === 'allow_employee_bulk_process') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'allow_employee_bulk_process must be a boolean',
        });
      }
    }
    if (key === 'custom_employee_grouping_enabled') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'custom_employee_grouping_enabled must be a boolean',
        });
      }
    }
    if (key === 'auto_od_creation_enabled') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'auto_od_creation_enabled must be a boolean',
        });
      }
    }
    if (key === 'leave_attendance_reconciliation_enabled' || key === 'skip_leave_attendance_reconciliation') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: `${key} must be a boolean`,
        });
      }
    }
    if (key === 'enable_second_salary') {
      if (typeof value !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enable_second_salary must be a boolean',
        });
      }
    }

    let valueToSave = value;
    if (key === 'company_profile') {
      const validation = validateCompanyProfile(value);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join('; '),
        });
      }
      valueToSave = validation.normalized;
    }

    if (key === FILE_STORAGE_SETTING_KEY) {
      const existing = await Settings.findOne({ key: FILE_STORAGE_SETTING_KEY }).lean();
      const validation = validateFileStorageConfig(value, existing?.value);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join('; '),
        });
      }
      valueToSave = validation.normalized;
    }

    const setting = await Settings.findOneAndUpdate(
      { key },
      {
        key,
        value: valueToSave,
        description: description || `Setting for ${key}`,
        category:
          category ||
          (key === 'company_profile'
            ? 'company'
            : key === FILE_STORAGE_SETTING_KEY
              ? 'general'
            : ['include_missing_employee_components', 'enable_absent_deduction', 'lop_days_per_absent', 'auto_reject_pending_requests_on_batch_complete', 'enable_second_salary'].includes(key)
            ? 'payroll'
            : ['allow_employee_bulk_process', 'custom_employee_grouping_enabled'].includes(key)
              ? 'employee'
              : [
                  'auto_od_creation_enabled',
                  'leave_attendance_reconciliation_enabled',
                  'skip_leave_attendance_reconciliation',
                ].includes(key)
                ? 'general'
              : 'general'),
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    if (key === 'enable_second_salary') {
      invalidateSecondSalaryFeatureCache();
    }

    if (key === FILE_STORAGE_SETTING_KEY) {
      invalidateFileStorageCache();
    }

    const responseData = setting.toObject ? setting.toObject() : { ...setting };
    if (responseData.key === FILE_STORAGE_SETTING_KEY) {
      responseData.value = sanitizeForClient(responseData.value);
    }

    res.status(200).json({
      success: true,
      message: 'Setting saved successfully',
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error saving setting',
      error: error.message,
    });
  }
};

// @desc    Delete setting
// @route   DELETE /api/settings/:key
// @access  Private (Super Admin)
exports.deleteSetting = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: req.params.key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found',
      });
    }

    await setting.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Setting deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting setting',
      error: error.message,
    });
  }
};

