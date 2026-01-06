const BonusBatch = require('../model/BonusBatch');
const BonusRecord = require('../model/BonusRecord');
const BonusPolicy = require('../model/BonusPolicy');
const Employee = require('../../employees/model/Employee');
const { calculateBonusForEmployee } = require('../services/bonusCalculationService');

// @desc    Get all bonus batches (with filtering)
// @route   GET /api/bonus/batches
exports.getBatches = async (req, res) => {
  try {
    const { startMonth, endMonth, department, division } = req.query;
    const query = {};
    if (startMonth) query.startMonth = { $gte: startMonth }; // Simplified filter logic
    if (department) query.department = department;
    if (division) query.division = division;

    const batches = await BonusBatch.find(query)
      .populate('policy', 'name')
      .populate('department', 'name')
      .populate('division', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create new bonus batch (Calculate)
// @route   POST /api/bonus/batches
exports.createBatch = async (req, res) => {
  try {
    const { startMonth, endMonth, departmentId, divisionId, policyId } = req.body;

    // 1. Validation
    if (!startMonth || !endMonth || !policyId) {
      return res.status(400).json({ success: false, error: 'Start Month, End Month and Policy are required' });
    }

    if (startMonth > endMonth) {
      return res.status(400).json({ success: false, error: 'Start Month cannot be after End Month' });
    }

    // Check existing
    const existingBatch = await BonusBatch.findOne({
      startMonth,
      endMonth,
      department: departmentId,
      division: divisionId,
      policy: policyId
    });

    if (existingBatch) {
      return res.status(400).json({ success: false, error: 'A batch already exists for these criteria. Please view/edit it.' });
    }

    const policy = await BonusPolicy.findById(policyId);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    // 2. Fetch Employees
    const empQuery = { is_active: true };
    if (departmentId) empQuery.department_id = departmentId;
    if (divisionId) empQuery.division_id = divisionId;

    const employees = await Employee.find(empQuery);
    if (!employees.length) {
      return res.status(404).json({ success: false, error: 'No active employees found for criteria' });
    }

    // 3. Calculate Bonus for Each Employee
    const records = [];
    let totalAmount = 0;

    for (const emp of employees) {
      try {
        const result = await calculateBonusForEmployee(emp, policy, startMonth, endMonth);
        if (result) {
          records.push(result);
          totalAmount += result.finalBonus;
        }
      } catch (err) {
        console.warn(`Bonus calc skipped for ${emp.emp_no}: ${err.message}`);
        // Optionally store error or skip
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not calculate bonus for any employee (Check Pay Registers)' });
    }

    // 4. Create Batch
    const batchName = `BONUS-${startMonth}_${endMonth}-${policy.name.substring(0, 5).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const [yearStr, monthStr] = startMonth.split('-');

    const batch = await BonusBatch.create({
      batchName,
      startMonth,
      endMonth,
      year: parseInt(yearStr),
      division: divisionId,
      department: departmentId,
      policy: policyId,
      status: 'pending',
      totalEmployees: records.length,
      totalBonusAmount: totalAmount,
      createdBy: req.user._id
    });

    // 5. Create Records
    const recordsToSave = records.map(r => ({
      ...r,
      batchId: batch._id
    }));
    await BonusRecord.insertMany(recordsToSave);

    res.status(201).json({ success: true, data: batch });

  } catch (error) {
    console.error('Create Batch Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get batch details with records
// @route   GET /api/bonus/batches/:id
exports.getBatchById = async (req, res) => {
  try {
    const batch = await BonusBatch.findById(req.params.id)
      .populate('policy')
      .populate('department')
      .populate('division')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('frozenBy', 'name');

    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    const records = await BonusRecord.find({ batchId: batch._id }).populate('employeeId', 'employee_name emp_no');

    res.status(200).json({ success: true, data: { batch, records } });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update batch status (Approve/Freeze)
// @route   PUT /api/bonus/batches/:id/status
exports.updateBatchStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const batch = await BonusBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    // State transitions
    if (status === 'approved') {
      if (batch.status !== 'pending') return res.status(400).json({ error: 'Can only approve pending batches' });
      batch.status = 'approved';
      batch.approvedBy = req.user._id;
    } else if (status === 'frozen') {
      if (batch.status !== 'approved') return res.status(400).json({ error: 'Can only freeze approved batches' });
      batch.status = 'frozen';
      batch.frozenBy = req.user._id;
    } else {
      return res.status(400).json({ error: 'Invalid status transition' });
    }

    await batch.save();
    res.status(200).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Request Recalculation
// @route   POST /api/bonus/batches/:id/recalculate-request
exports.requestRecalculation = async (req, res) => {
  try {
    const { reason } = req.body;
    const batch = await BonusBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    batch.recalculationRequest = {
      isRequested: true,
      requestedBy: req.user._id,
      requestedAt: new Date(),
      reason: reason,
      status: 'pending'
    };

    // If getting approval automatically or simple flow, we might just set status back to pending?
    // User requirement: "hr and hod can raise a recalcualtion request and also if it is frezzed they there will be no req option"

    if (batch.status === 'frozen') {
      return res.status(400).json({ error: 'Cannot request recalculation for frozen batches' });
    }

    await batch.save();
    res.status(200).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update single record (Manual Override)
// @route   PUT /api/bonus/records/:id
exports.updateRecord = async (req, res) => {
  try {
    const { finalBonus, remarks } = req.body;
    const record = await BonusRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const batch = await BonusBatch.findById(record.batchId);
    if (batch.status === 'frozen') return res.status(400).json({ error: 'Cannot update frozen batch' });

    record.finalBonus = finalBonus;
    record.remarks = remarks;
    record.isManualOverride = true;
    await record.save();

    // Update batch totals
    // This is expensive if loop, better to use aggregate
    // For now, simple consistent increment/decrement if needed, or just re-sum on load
    // Let's re-sum
    const aggr = await BonusRecord.aggregate([
      { $match: { batchId: batch._id } },
      { $group: { _id: null, total: { $sum: "$finalBonus" } } }
    ]);
    batch.totalBonusAmount = aggr.length ? aggr[0].total : 0;
    await batch.save();

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
