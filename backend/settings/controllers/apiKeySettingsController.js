const crypto = require('crypto');
const ApiKey = require('../../security/model/ApiKey');

const AVAILABLE_FIELDS = [
  { id: 'emp_no', label: 'Employee ID (emp_no / empNo)', group: 'Basic Info', defaultSelected: true },
  { id: 'employee_name', label: 'Full Name (employee_name / name)', group: 'Basic Info', defaultSelected: true },
  { id: 'status', label: 'Employment Status (status / isActive)', group: 'Basic Info', defaultSelected: true },
  { id: 'email', label: 'Email Address', group: 'Contact', defaultSelected: false },
  { id: 'phone_number', label: 'Phone Number', group: 'Contact', defaultSelected: false },
  { id: 'division', label: 'Division Name (division / division_name)', group: 'Organization', defaultSelected: false },
  { id: 'department', label: 'Department Name (department / department_name)', group: 'Organization', defaultSelected: false },
  { id: 'designation', label: 'Designation Name (designation / designation_name)', group: 'Organization', defaultSelected: false },
  { id: 'gender', label: 'Gender', group: 'Personal', defaultSelected: false },
  { id: 'dob', label: 'Date of Birth', group: 'Personal', defaultSelected: false },
  { id: 'doj', label: 'Date of Joining', group: 'Organization', defaultSelected: false },
  { id: 'blood_group', label: 'Blood Group', group: 'Personal', defaultSelected: false },
  { id: 'marital_status', label: 'Marital Status', group: 'Personal', defaultSelected: false },
];

/**
 * @desc    Get all public API keys
 * @route   GET /api/settings/api-keys
 * @access  Private (Admin / Manager)
 */
exports.getAllApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      count: keys.length,
      data: keys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve API keys' });
  }
};

/**
 * @desc    Get selectable employee fields
 * @route   GET /api/settings/api-keys/fields
 * @access  Private (Admin / Manager)
 */
exports.getAvailableFields = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: AVAILABLE_FIELDS,
    });
  } catch (error) {
    console.error('Error fetching available fields:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve fields' });
  }
};

/**
 * @desc    Create a new API Key with selected fields
 * @route   POST /api/settings/api-keys
 * @access  Private (Admin)
 */
exports.createApiKey = async (req, res) => {
  try {
    const { clientName, allowedFields, description } = req.body;

    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ success: false, message: 'Client name is required' });
    }

    const rawKey = crypto.randomBytes(32).toString('hex');
    const apiKey = `lihrms_${rawKey}`;

    const fields = Array.isArray(allowedFields) && allowedFields.length > 0
      ? allowedFields
      : ['emp_no', 'employee_name', 'status'];

    const newKey = new ApiKey({
      key: apiKey,
      clientName: clientName.trim(),
      allowedFields: fields,
      description: description ? description.trim() : '',
      isActive: true,
    });

    await newKey.save();

    res.status(201).json({
      success: true,
      message: 'API Key generated successfully',
      data: newKey,
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({ success: false, message: 'Failed to generate API key' });
  }
};

/**
 * @desc    Update an API Key (isActive, allowedFields, clientName, description)
 * @route   PUT /api/settings/api-keys/:id
 * @access  Private (Admin)
 */
exports.updateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientName, allowedFields, isActive, description } = req.body;

    const keyDoc = await ApiKey.findById(id);
    if (!keyDoc) {
      return res.status(404).json({ success: false, message: 'API Key not found' });
    }

    if (clientName !== undefined) keyDoc.clientName = clientName.trim();
    if (isActive !== undefined) keyDoc.isActive = !!isActive;
    if (description !== undefined) keyDoc.description = description.trim();
    if (Array.isArray(allowedFields)) keyDoc.allowedFields = allowedFields;

    await keyDoc.save();

    res.status(200).json({
      success: true,
      message: 'API Key updated successfully',
      data: keyDoc,
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, message: 'Failed to update API key' });
  }
};

/**
 * @desc    Delete / Revoke an API Key
 * @route   DELETE /api/settings/api-keys/:id
 * @access  Private (Super Admin)
 */
exports.deleteApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ApiKey.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'API Key not found' });
    }

    res.status(200).json({
      success: true,
      message: 'API Key deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, message: 'Failed to delete API key' });
  }
};
