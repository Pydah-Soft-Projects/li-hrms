/**
 * Employee Application Form Settings Controller
 * Manages dynamic form configuration
 */

const EmployeeApplicationFormSettings = require('../model/EmployeeApplicationFormSettings');

/**
 * Repair in-memory: if any field's itemSchema.fields was stored as a JSON string
 * (data corruption), parse it back to an array so settings.save() doesn't throw a
 * Mongoose CastError.  Safe to call before every save â€” no-op when data is clean.
 */
function sanitizeItemSchemaFields(settings) {
  if (!settings || !Array.isArray(settings.groups)) return;
  for (const group of settings.groups) {
    if (!Array.isArray(group.fields)) continue;
    for (const field of group.fields) {
      if (!field || !field.itemSchema) continue;
      const raw = field.itemSchema.fields;
      if (!Array.isArray(raw) && raw != null) {
        // Could be a string (JSON-serialised array) or something else â€” normalise to []
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          field.itemSchema.fields = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          field.itemSchema.fields = [];
        }
      }
    }
  }
}

/**
 * @desc    Get active form settings
 * @route   GET /api/employee-applications/form-settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    const settingsObj = settings.toObject();

    // Ensure DOJ is present in basic_info for existing settings
    const basicInfoGroup = settingsObj.groups.find((g) => g.id === 'basic_info');
    if (basicInfoGroup) {
      if (!basicInfoGroup.fields.some((f) => f.id === 'doj')) {
        const dojField = {
          id: 'doj',
          label: 'Date of Joining',
          type: 'date',
          dataType: 'date',
          isRequired: false,
          isSystem: true,
          dateFormat: 'dd-mm-yyyy',
          order: 6, // Moved to 6
          isEnabled: true,
        };
        basicInfoGroup.fields.push(dojField);
      }

      // Ensure division_id is present
      if (!basicInfoGroup.fields.some((f) => f.id === 'division_id')) {
        const divisionField = {
          id: 'division_id',
          label: 'Division',
          type: 'select',
          dataType: 'string',
          isRequired: true,
          isSystem: true,
          placeholder: 'Select Division',
          order: 3,
          isEnabled: true,
        };
        basicInfoGroup.fields.push(divisionField);
      }

      // Re-order fields to accommodate new additions
      const fieldOrderMap = {
        emp_no: 1,
        employee_name: 2,
        division_id: 3,
        department_id: 4,
        designation_id: 5,
        doj: 6,
        proposedSalary: 7
      };

      basicInfoGroup.fields.forEach(f => {
        if (fieldOrderMap[f.id]) {
          f.order = fieldOrderMap[f.id];
        }
      });

      // Ensure second_salary is present in basic_info
      if (!basicInfoGroup.fields.some((f) => f.id === 'second_salary')) {
        const secondSalaryField = {
          id: 'second_salary',
          label: 'Second Salary',
          type: 'number',
          dataType: 'number',
          isRequired: false,
          isSystem: true,
          placeholder: '0.00',
          validation: { min: 0 },
          order: 8,
          isEnabled: true,
        };
        basicInfoGroup.fields.push(secondSalaryField);
      }

      basicInfoGroup.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Ensure Email is present in contact_info for existing settings
    const contactInfoGroup = settingsObj.groups.find((g) => g.id === 'contact_info');
    if (contactInfoGroup && !contactInfoGroup.fields.some((f) => f.id === 'email')) {
      const emailField = {
        id: 'email',
        label: 'Email',
        type: 'email',
        dataType: 'string',
        isRequired: false,
        isSystem: true,
        placeholder: 'example@email.com',
        order: 2,
        isEnabled: true,
      };
      contactInfoGroup.fields.push(emailField);
      contactInfoGroup.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Ensure bank_details has salary mode + optional PF/ESI fields for existing settings
    const bankDetailsGroup = settingsObj.groups.find((g) => g.id === 'bank_details');
    if (bankDetailsGroup) {
      if (!bankDetailsGroup.fields.some((f) => f.id === 'salary_mode')) {
        const salaryModeField = {
          id: 'salary_mode',
          label: 'Salary Mode',
          type: 'select',
          dataType: 'string',
          isRequired: true,
          isSystem: true,
          defaultValue: 'Bank',
          options: [
            { label: 'Bank', value: 'Bank' },
            { label: 'Cash', value: 'Cash' },
          ],
          order: 7,
          isEnabled: true,
        };
        bankDetailsGroup.fields.push(salaryModeField);
      }
      EmployeeApplicationFormSettings.ensureBankDetailsPfEsiFields(settingsObj.groups);
      bankDetailsGroup.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    if (!settingsObj.qualifications) {
      settingsObj.qualifications = { isEnabled: true, enableCertificateUpload: false, fields: [], defaultRows: [] };
    }
    if (!Array.isArray(settingsObj.qualifications.fields)) {
      settingsObj.qualifications.fields = [];
    }
    if (!Array.isArray(settingsObj.qualifications.defaultRows)) {
      settingsObj.qualifications.defaultRows = [];
    }
    settingsObj.qualifications.fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Ensure weekdayShiftSchedule is always present in the response
    if (!settingsObj.weekdayShiftSchedule) {
      settingsObj.weekdayShiftSchedule = { isEnabled: false };
    }

    res.status(200).json({
      success: true,
      data: settingsObj,
    });
  } catch (error) {
    console.error('Error fetching form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Initialize default form settings
 * @route   POST /api/employee-applications/form-settings/initialize
 * @access  Private (Super Admin, Sub Admin)
 */
exports.initializeSettings = async (req, res) => {
  try {
    const settings = await EmployeeApplicationFormSettings.initializeDefault(req.user._id);

    res.status(201).json({
      success: true,
      message: 'Form settings initialized successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error initializing form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Update form settings
 * @route   PUT /api/employee-applications/form-settings
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateSettings = async (req, res) => {
  try {
    const { groups } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    // Validate groups structure
    if (groups && Array.isArray(groups)) {
      settings.groups = groups;
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Form settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Add new group
 * @route   POST /api/employee-applications/form-settings/groups
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addGroup = async (req, res) => {
  try {
    const { id, label, description, isArray, order, fields } = req.body;

    if (!id || !label) {
      return res.status(400).json({
        success: false,
        message: 'Group ID and label are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    // Check if group already exists
    if (settings.groups.some((g) => g.id === id)) {
      return res.status(400).json({
        success: false,
        message: 'Group with this ID already exists',
      });
    }

    const newGroup = {
      id,
      label,
      description: description || '',
      isSystem: false,
      isArray: isArray || false,
      order: order !== undefined ? order : settings.groups.length + 1,
      isEnabled: true,
      fields: fields || [],
    };

    settings.groups.push(newGroup);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Group added successfully',
      data: newGroup,
    });
  } catch (error) {
    console.error('Error adding group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add group',
      error: error.message,
    });
  }
};

/**
 * @desc    Update group
 * @route   PUT /api/employee-applications/form-settings/groups/:groupId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { label, description, isArray, order, isEnabled } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // All groups can be fully modified
    if (label !== undefined) group.label = label;
    if (description !== undefined) group.description = description;
    if (isArray !== undefined) group.isArray = isArray;
    if (order !== undefined) group.order = order;
    if (isEnabled !== undefined) group.isEnabled = isEnabled;

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: group,
    });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update group',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete group
 * @route   DELETE /api/employee-applications/form-settings/groups/:groupId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const groupIndex = settings.groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // All groups can be deleted

    settings.groups.splice(groupIndex, 1);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete group',
      error: error.message,
    });
  }
};

/**
 * @desc    Add field to group
 * @route   POST /api/employee-applications/form-settings/groups/:groupId/fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addField = async (req, res) => {
  try {
    const { groupId } = req.params;
    const fieldData = req.body;

    if (!fieldData.id || !fieldData.label || !fieldData.type || !fieldData.dataType) {
      return res.status(400).json({
        success: false,
        message: 'Field ID, label, type, and dataType are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Allow adding fields to all groups (including system groups); new fields are isSystem: false
    // Check if field already exists
    if (group.fields.some((f) => f.id === fieldData.id)) {
      return res.status(400).json({
        success: false,
        message: 'Field with this ID already exists in this group',
      });
    }

    const newField = {
      ...fieldData,
      isSystem: false,
      isEnabled: fieldData.isEnabled !== undefined ? fieldData.isEnabled : true,
      order: fieldData.order !== undefined ? fieldData.order : group.fields.length + 1,
    };

    group.fields.push(newField);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Field added successfully',
      data: newField,
    });
  } catch (error) {
    console.error('Error adding field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update field in group
 * @route   PUT /api/employee-applications/form-settings/groups/:groupId/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateField = async (req, res) => {
  try {
    const { groupId, fieldId } = req.params;
    const fieldData = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const fieldIndex = group.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Field not found',
      });
    }

    const field = group.fields[fieldIndex];

    // All fields can be fully modified
    Object.keys(fieldData).forEach((key) => {
      if (key !== 'id') {
        field[key] = fieldData[key];
      }
    });

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Field updated successfully',
      data: field,
    });
  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update field',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete field from group
 * @route   DELETE /api/employee-applications/form-settings/groups/:groupId/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteField = async (req, res) => {
  try {
    const { groupId, fieldId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const fieldIndex = group.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Field not found',
      });
    }

    // All fields can be deleted

    group.fields.splice(fieldIndex, 1);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update qualifications configuration (enable/disable and certificate upload)
 * @route   PUT /api/employee-applications/form-settings/qualifications
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateQualificationsConfig = async (req, res) => {
  try {
    const { isEnabled, enableCertificateUpload } = req.body;

    // Build a targeted $set so we never run full-document validation.
    // This avoids a ValidationError from pre-existing corrupt itemSchema.fields data
    // in unrelated groups (same root cause as weekdayShiftSchedule toggle).
    const setFields = { updatedBy: req.user._id };

    if (isEnabled !== undefined) {
      setFields['qualifications.isEnabled'] = !!isEnabled;
    }
    if (enableCertificateUpload !== undefined) {
      setFields['qualifications.enableCertificateUpload'] = !!enableCertificateUpload;
    }
    if (Array.isArray(req.body.defaultRows)) {
      setFields['qualifications.defaultRows'] = req.body.defaultRows;
    }

    const result = await EmployeeApplicationFormSettings.updateOne(
      { isActive: true },
      { $set: setFields, $inc: { version: 1 } },
      { runValidators: false }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Form settings not found' });
    }

    // Fetch just the qualifications sub-doc to return in the response
    const updated = await EmployeeApplicationFormSettings.findOne({ isActive: true })
      .select('qualifications')
      .lean();

    console.log('[Form Settings] Qualifications config updated:', {
      isEnabled: updated?.qualifications?.isEnabled,
      enableCertificateUpload: updated?.qualifications?.enableCertificateUpload,
    });

    res.status(200).json({
      success: true,
      message: 'Qualifications configuration updated successfully',
      data: updated?.qualifications || {},
    });
  } catch (error) {
    console.error('Error updating qualifications config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update qualifications configuration',
      error: error.message,
    });
  }
};

/**
 * @desc    Add field to qualifications
 * @route   POST /api/employee-applications/form-settings/qualifications/fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addQualificationsField = async (req, res) => {
  try {
    const { id, label, type, isRequired, isEnabled, placeholder, validation, options, order } = req.body;

    if (!id || !label || !type) {
      return res.status(400).json({
        success: false,
        message: 'Field id, label, and type are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications) {
      settings.qualifications = { isEnabled: true, fields: [] };
    }

    // Check if field already exists
    const existingField = settings.qualifications.fields.find((f) => f.id === id);
    if (existingField) {
      return res.status(400).json({
        success: false,
        message: 'Field with this id already exists',
      });
    }

    const newField = {
      id,
      label,
      type,
      isRequired: isRequired || false,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      placeholder: placeholder || '',
      validation: validation || {},
      options: options || [],
      order: order || settings.qualifications.fields.length + 1,
    };

    settings.qualifications.fields.push(newField);
    settings.qualifications.fields.sort((a, b) => a.order - b.order);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Qualifications field added successfully',
      data: newField,
    });
  } catch (error) {
    console.error('Error adding qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update qualifications field
 * @route   PUT /api/employee-applications/form-settings/qualifications/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateQualificationsField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { label, type, isRequired, isEnabled, placeholder, validation, options, order } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications || !settings.qualifications.fields) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications fields not found',
      });
    }

    const field = settings.qualifications.fields.find((f) => f.id === fieldId);
    if (!field) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications field not found',
      });
    }

    // Update allowed fields
    if (label !== undefined) field.label = label;
    if (type !== undefined) field.type = type;
    if (isRequired !== undefined) field.isRequired = isRequired;
    if (isEnabled !== undefined) field.isEnabled = isEnabled;
    if (placeholder !== undefined) field.placeholder = placeholder;
    if (validation !== undefined) field.validation = { ...field.validation, ...validation };
    if (options !== undefined) field.options = options;
    if (order !== undefined) {
      field.order = order;
      settings.qualifications.fields.sort((a, b) => a.order - b.order);
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Qualifications field updated successfully',
      data: field,
    });
  } catch (error) {
    console.error('Error updating qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Add qualifications field
 * @route   POST /api/employee-applications/form-settings/qualifications/fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addQualificationsField = async (req, res) => {
  try {
    const { id, label, type, isRequired, isEnabled, placeholder, validation, options, order } = req.body;

    if (!id || !label || !type) {
      return res.status(400).json({
        success: false,
        message: 'id, label, and type are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications) {
      settings.qualifications = { isEnabled: true, enableCertificateUpload: false, fields: [], defaultRows: [] };
    }

    // Check if ID already exists
    if (settings.qualifications.fields.some((f) => f.id === id)) {
      return res.status(400).json({
        success: false,
        message: `Field ID "${id}" already exists in qualifications`,
      });
    }

    const newField = {
      id,
      label,
      type,
      isRequired: isRequired !== undefined ? isRequired : false,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      placeholder: placeholder || '',
      validation: validation || {},
      options: options || [],
      order: order || (settings.qualifications.fields.length + 1),
    };

    settings.qualifications.fields.push(newField);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Qualifications field added successfully',
      data: newField,
    });
  } catch (error) {
    console.error('Error adding qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete qualifications field
 * @route   DELETE /api/employee-applications/form-settings/qualifications/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteQualificationsField = async (req, res) => {
  try {
    const { fieldId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications || !settings.qualifications.fields) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications fields not found',
      });
    }

    const fieldIndex = settings.qualifications.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications field not found',
      });
    }

    settings.qualifications.fields.splice(fieldIndex, 1);
    // Remove this field from every default row so stored data stays consistent
    if (settings.qualifications.defaultRows && Array.isArray(settings.qualifications.defaultRows)) {
      settings.qualifications.defaultRows.forEach((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, fieldId)) {
          delete row[fieldId];
        }
      });
    }
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    sanitizeItemSchemaFields(settings);

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Qualifications field deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Reorder groups
 * @route   PUT /api/employee-applications/form-settings/reorder-groups
 * @access  Private (Super Admin, Sub Admin)
 */
exports.reorderGroups = async (req, res) => {
  try {
    const { groupIds } = req.body;
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ success: false, message: 'groupIds array is required' });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Form settings not found' });
    }

    groupIds.forEach((id, index) => {
      const group = settings.groups.find((g) => g.id === id);
      if (group) group.order = index + 1;
    });

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;
    sanitizeItemSchemaFields(settings);
    await settings.save();

    res.status(200).json({ success: true, message: 'Groups reordered successfully' });
  } catch (error) {
    console.error('Error reordering groups:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder groups', error: error.message });
  }
};

/**
 * @desc    Reorder fields within a group
 * @route   PUT /api/employee-applications/form-settings/groups/:groupId/reorder-fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.reorderFields = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fieldIds } = req.body;
    if (!Array.isArray(fieldIds)) {
      return res.status(400).json({ success: false, message: 'fieldIds array is required' });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Form settings not found' });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    fieldIds.forEach((id, index) => {
      const field = group.fields.find((f) => f.id === id);
      if (field) field.order = index + 1;
    });

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;
    sanitizeItemSchemaFields(settings);
    await settings.save();

    res.status(200).json({ success: true, message: 'Fields reordered successfully' });
  } catch (error) {
    console.error('Error reordering fields:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder fields', error: error.message });
  }
};
/**
 * @desc    Reorder qualification fields
 * @route   PUT /api/employee-applications/form-settings/qualifications/reorder-fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.reorderQualificationsFields = async (req, res) => {
  try {
    const { fieldIds } = req.body;
    if (!Array.isArray(fieldIds)) {
      return res.status(400).json({ success: false, message: 'fieldIds array is required' });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Form settings not found' });
    }

    if (!settings.qualifications || !settings.qualifications.fields) {
      return res.status(404).json({ success: false, message: 'Qualifications fields not found' });
    }

    fieldIds.forEach((id, index) => {
      const field = settings.qualifications.fields.find((f) => f.id === id);
      if (field) field.order = index + 1;
    });

    // Re-sort the fields array in the document to ensure it's saved in order if needed
    settings.qualifications.fields.sort((a, b) => (a.order || 0) - (b.order || 0));

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;
    sanitizeItemSchemaFields(settings);
    await settings.save();

    res.status(200).json({ success: true, message: 'Qualification fields reordered successfully' });
  } catch (error) {
    console.error('Error reordering qualification fields:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder qualification fields', error: error.message });
  }
};

/**
 * @desc    Update weekday shift schedule configuration (enable / disable)
 * @route   PUT /api/employee-applications/form-settings/weekday-shift-schedule
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateWeekdayShiftScheduleConfig = async (req, res) => {
  try {
    const { isEnabled } = req.body;

    if (isEnabled === undefined || typeof isEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isEnabled (boolean) is required' });
    }

    // Use a targeted updateOne so Mongoose never hydrates or validates the whole document.
    // This avoids a ValidationError caused by pre-existing corrupt itemSchema.fields data in
    // unrelated groups â€” which would fail a full document.save() even though we only need to
    // touch weekdayShiftSchedule.isEnabled.
    const result = await EmployeeApplicationFormSettings.updateOne(
      { isActive: true },
      {
        $set: {
          'weekdayShiftSchedule.isEnabled': isEnabled,
          updatedBy: req.user._id,
        },
        $inc: { version: 1 },
      },
      { runValidators: false }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Form settings not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Weekday shift schedule configuration updated successfully',
      data: { isEnabled },
    });
  } catch (error) {
    console.error('Error updating weekday shift schedule config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update weekday shift schedule configuration',
      error: error.message,
    });
  }
};

