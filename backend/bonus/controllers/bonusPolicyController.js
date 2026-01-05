const BonusPolicy = require('../model/BonusPolicy');

// @desc    Get all bonus policies
// @route   GET /api/bonus/policies
exports.getPolicies = async (req, res) => {
  try {
    const policies = await BonusPolicy.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get single policy
// @route   GET /api/bonus/policies/:id
exports.getPolicyById = async (req, res) => {
  try {
    const policy = await BonusPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.status(200).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create policy
// @route   POST /api/bonus/policies
exports.createPolicy = async (req, res) => {
  try {
    const policy = await BonusPolicy.create({
      ...req.body,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update policy
// @route   PUT /api/bonus/policies/:id
exports.updatePolicy = async (req, res) => {
  try {
    const policy = await BonusPolicy.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.status(200).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete policy
// @route   DELETE /api/bonus/policies/:id
exports.deletePolicy = async (req, res) => {
  try {
    const policy = await BonusPolicy.findByIdAndDelete(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
