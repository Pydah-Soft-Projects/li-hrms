const Asset = require('../model/Asset');
const AssetAssignment = require('../model/AssetAssignment');
const Employee = require('../../employees/model/Employee');
const Division = require('../../departments/model/Division');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');

const MANAGEMENT_ROLES = ['manager', 'super_admin', 'sub_admin', 'hr', 'hod'];

function isGlobalAccess(user) {
  return user?.role === 'super_admin' || user?.dataScope === 'all';
}

function getMappedDivisionIds(user) {
  if (!user?.divisionMapping || !Array.isArray(user.divisionMapping)) return [];
  return user.divisionMapping
    .map((mapping) => (mapping?.division?._id || mapping?.division || null))
    .filter(Boolean)
    .map((id) => id.toString());
}

function buildAssetScopeFilter(user) {
  if (!user) return { _id: null };
  if (isGlobalAccess(user)) return {};

  const divisionIds = getMappedDivisionIds(user);
  if (divisionIds.length === 0) {
    return { visibilityScope: 'universal' };
  }

  return {
    $or: [
      { visibilityScope: 'universal' },
      { visibilityScope: 'division', division_id: { $in: divisionIds } },
    ],
  };
}

async function assertDivisionExists(divisionId) {
  if (!divisionId) return;
  const division = await Division.findById(divisionId).select('_id');
  if (!division) {
    const error = new Error('Division not found');
    error.statusCode = 404;
    throw error;
  }
}

function normalizeAssetInput(body) {
  const visibilityScope = body.visibilityScope === 'division' ? 'division' : 'universal';
  return {
    name: body.name?.trim(),
    details: body.details?.trim() || '',
    assetPhotoUrl: body.assetPhotoUrl || null,
    billUrl: body.billUrl || null,
    price: body.price === '' || body.price == null ? null : Number(body.price),
    expiryDate: body.expiryDate || null,
    visibilityScope,
    division_id: visibilityScope === 'division' ? body.division_id || null : null,
    status: body.status && ['available', 'assigned', 'retired'].includes(body.status) ? body.status : undefined,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
  };
}

async function getAccessibleAssetOrThrow(assetId, scopedUser) {
  const filter = buildAssetScopeFilter(scopedUser);
  const asset = await Asset.findOne({ _id: assetId, ...filter });
  if (!asset) {
    const error = new Error('Asset not found or outside your scope');
    error.statusCode = 404;
    throw error;
  }
  return asset;
}

exports.getAssets = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const conditions = [buildAssetScopeFilter(scopedUser)];
    if (req.query.status) conditions.push({ status: req.query.status });
    if (req.query.visibilityScope) conditions.push({ visibilityScope: req.query.visibilityScope });
    if (req.query.isActive !== undefined) conditions.push({ isActive: req.query.isActive === 'true' });
    if (req.query.search) {
      conditions.push({
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { details: { $regex: req.query.search, $options: 'i' } },
        ],
      });
    }
    const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };

    const assets = await Asset.find(filter)
      .populate('division_id', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: assets });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch assets',
    });
  }
};

exports.createAsset = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const payload = normalizeAssetInput(req.body);

    if (!payload.name) {
      return res.status(400).json({ success: false, message: 'Asset name is required' });
    }

    if (payload.visibilityScope === 'division' && !payload.division_id) {
      return res.status(400).json({ success: false, message: 'Division is required for division assets' });
    }

    await assertDivisionExists(payload.division_id);

    const allowedDivisionIds = getMappedDivisionIds(scopedUser);
    if (
      payload.visibilityScope === 'division' &&
      !isGlobalAccess(scopedUser) &&
      (!payload.division_id || !allowedDivisionIds.includes(payload.division_id.toString()))
    ) {
      return res.status(403).json({ success: false, message: 'You cannot create assets for that division' });
    }

    const asset = await Asset.create({
      ...payload,
      createdBy: req.user.userId,
      updatedBy: req.user.userId,
    });

    const populated = await Asset.findById(asset._id).populate('division_id', 'name code');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create asset',
    });
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const asset = await getAccessibleAssetOrThrow(req.params.id, scopedUser);
    const payload = normalizeAssetInput(req.body);

    if (payload.name !== undefined && !payload.name) {
      return res.status(400).json({ success: false, message: 'Asset name is required' });
    }

    if (payload.visibilityScope === 'division' && !payload.division_id) {
      return res.status(400).json({ success: false, message: 'Division is required for division assets' });
    }

    if (payload.status === 'assigned' && asset.status !== 'assigned') {
      return res.status(400).json({ success: false, message: 'Assigned status is controlled by asset assignments' });
    }

    await assertDivisionExists(payload.division_id);

    const allowedDivisionIds = getMappedDivisionIds(scopedUser);
    if (
      payload.visibilityScope === 'division' &&
      payload.division_id &&
      !isGlobalAccess(scopedUser) &&
      !allowedDivisionIds.includes(payload.division_id.toString())
    ) {
      return res.status(403).json({ success: false, message: 'You cannot move assets to that division' });
    }

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined) {
        asset[key] = value;
      }
    });
    asset.updatedBy = req.user.userId;

    await asset.save();
    const populated = await Asset.findById(asset._id).populate('division_id', 'name code');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update asset',
    });
  }
};

exports.assignAsset = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const asset = await getAccessibleAssetOrThrow(req.params.id, scopedUser);

    if (asset.status === 'assigned') {
      return res.status(400).json({ success: false, message: 'This asset is already assigned' });
    }
    if (asset.status === 'retired') {
      return res.status(400).json({ success: false, message: 'Retired assets cannot be assigned' });
    }

    const { employeeId, assignedAt, assignmentPhotoUrl, assignmentSignatureUrl, expectedReturnDate, assignmentNotes } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee is required' });
    }
    if (!assignmentPhotoUrl || !assignmentSignatureUrl) {
      return res.status(400).json({ success: false, message: 'Assignment photo and signature are required' });
    }

    const employee = await Employee.findById(employeeId)
      .select('_id employee_name emp_no division_id department_id is_active')
      .lean();

    if (!employee || employee.is_active === false) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (!isGlobalAccess(scopedUser)) {
      const employeeIdsInScope = await getEmployeeIdsInScope(scopedUser);
      const allowedEmployeeIds = new Set(employeeIdsInScope.map((id) => id.toString()));
      if (!allowedEmployeeIds.has(employee._id.toString())) {
        return res.status(403).json({ success: false, message: 'Employee is outside your scope' });
      }
    }

    if (
      asset.visibilityScope === 'division' &&
      asset.division_id &&
      employee.division_id &&
      asset.division_id.toString() !== employee.division_id.toString()
    ) {
      const confirmMismatch =
        req.body.confirmDivisionMismatch === true ||
        req.body.confirmDivisionMismatch === 'true';

      const [assetDivisionDoc, employeeDivisionDoc] = await Promise.all([
        Division.findById(asset.division_id).select('name code').lean(),
        Division.findById(employee.division_id).select('name code').lean(),
      ]);

      if (!confirmMismatch) {
        return res.status(409).json({
          success: false,
          code: 'DIVISION_MISMATCH',
          message: 'The asset is linked to a different division than the selected employee.',
          assetName: asset.name,
          assetDivision: {
            _id: asset.division_id,
            name: assetDivisionDoc?.name || 'Unknown division',
            code: assetDivisionDoc?.code || '',
          },
          employeeDivision: {
            _id: employee.division_id,
            name: employeeDivisionDoc?.name || 'Unknown division',
            code: employeeDivisionDoc?.code || '',
          },
        });
      }
    }

    const assignment = await AssetAssignment.create({
      asset: asset._id,
      employee: employee._id,
      division_id: employee.division_id || asset.division_id || null,
      department_id: employee.department_id || null,
      assignedAt: assignedAt || new Date(),
      assignmentPhotoUrl,
      assignmentSignatureUrl,
      expectedReturnDate: expectedReturnDate || null,
      assignmentNotes: assignmentNotes?.trim() || '',
      issuedBy: req.user.userId,
    });

    asset.status = 'assigned';
    asset.updatedBy = req.user.userId;
    await asset.save();

    const populated = await AssetAssignment.findById(assignment._id)
      .populate('asset', 'name details assetPhotoUrl billUrl price expiryDate visibilityScope status division_id')
      .populate({
        path: 'employee',
        select: 'employee_name emp_no division_id department_id',
        populate: [
          { path: 'division_id', select: 'name code' },
          { path: 'department_id', select: 'name code' },
        ],
      })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to assign asset',
    });
  }
};

exports.getAssignments = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    if (req.query.assetId) filter.asset = req.query.assetId;

    if (!isGlobalAccess(scopedUser)) {
      const employeeIdsInScope = await getEmployeeIdsInScope(scopedUser);
      const allowedIds = employeeIdsInScope.map((id) => id.toString());
      if (filter.employee && !allowedIds.includes(String(filter.employee))) {
        return res.json({ success: true, data: [] });
      }
      filter.employee = filter.employee ? filter.employee : { $in: employeeIdsInScope };
    }

    const assignments = await AssetAssignment.find(filter)
      .populate({
        path: 'asset',
        populate: { path: 'division_id', select: 'name code' },
      })
      .populate({
        path: 'employee',
        select: 'employee_name emp_no division_id department_id',
        populate: [
          { path: 'division_id', select: 'name code' },
          { path: 'department_id', select: 'name code' },
        ],
      })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('issuedBy', 'name email role')
      .populate('returnedBy', 'name email role')
      .sort({ assignedAt: -1 })
      .lean();

    res.json({ success: true, data: assignments });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch asset assignments',
    });
  }
};

exports.getMyAssignments = async (req, res) => {
  try {
    const employeeId = req.user.employeeRef || req.user.userId;
    const assignments = await AssetAssignment.find({ employee: employeeId })
      .populate({
        path: 'asset',
        populate: { path: 'division_id', select: 'name code' },
      })
      .populate({
        path: 'employee',
        select: 'employee_name emp_no division_id department_id',
        populate: [
          { path: 'division_id', select: 'name code' },
          { path: 'department_id', select: 'name code' },
        ],
      })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('issuedBy', 'name email role')
      .populate('returnedBy', 'name email role')
      .sort({ assignedAt: -1 })
      .lean();

    res.json({ success: true, data: assignments });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch your asset assignments',
    });
  }
};

exports.returnAssignment = async (req, res) => {
  try {
    const assignment = await AssetAssignment.findById(req.params.id)
      .populate('asset')
      .populate('employee', '_id division_id');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Asset assignment not found' });
    }

    if (assignment.status === 'returned') {
      return res.status(400).json({ success: false, message: 'Asset is already returned' });
    }

    const isSelfReturn = req.user.role === 'employee';
    if (isSelfReturn && assignment.employee._id.toString() !== String(req.user.employeeRef || req.user.userId)) {
      return res.status(403).json({ success: false, message: 'You can only return your own asset' });
    }

    if (!isSelfReturn) {
      const scopedUser = req.scopedUser || req.user;
      if (!isGlobalAccess(scopedUser)) {
        const employeeIdsInScope = await getEmployeeIdsInScope(scopedUser);
        const allowedEmployeeIds = new Set(employeeIdsInScope.map((id) => id.toString()));
        if (!allowedEmployeeIds.has(assignment.employee._id.toString())) {
          return res.status(403).json({ success: false, message: 'This assignment is outside your scope' });
        }
      }
    }

    const { returnedAt, returnPhotoUrl, returnSignatureUrl, returnNotes } = req.body;
    if (!returnPhotoUrl || !returnSignatureUrl) {
      return res.status(400).json({ success: false, message: 'Return photo and signature are required' });
    }

    assignment.status = 'returned';
    assignment.returnedAt = returnedAt || new Date();
    assignment.returnPhotoUrl = returnPhotoUrl;
    assignment.returnSignatureUrl = returnSignatureUrl;
    assignment.returnNotes = returnNotes?.trim() || '';
    assignment.returnedBy = req.user.userId;
    await assignment.save();

    await Asset.findByIdAndUpdate(assignment.asset._id, {
      status: 'available',
      updatedBy: req.user.userId,
    });

    const populated = await AssetAssignment.findById(assignment._id)
      .populate({
        path: 'asset',
        populate: { path: 'division_id', select: 'name code' },
      })
      .populate({
        path: 'employee',
        select: 'employee_name emp_no division_id department_id',
        populate: [
          { path: 'division_id', select: 'name code' },
          { path: 'department_id', select: 'name code' },
        ],
      })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code');

    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to return asset',
    });
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const asset = await getAccessibleAssetOrThrow(req.params.id, scopedUser);

    const activeAssignment = await AssetAssignment.findOne({
      asset: asset._id,
      status: 'assigned',
    }).select('_id');

    if (activeAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Assigned assets cannot be deleted until they are returned',
      });
    }

    await AssetAssignment.deleteMany({ asset: asset._id });
    await Asset.findByIdAndDelete(asset._id);

    res.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete asset',
    });
  }
};

exports.getMetadata = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const divisionFilter = isGlobalAccess(scopedUser)
      ? { isActive: true }
      : { _id: { $in: getMappedDivisionIds(scopedUser) }, isActive: true };

    const divisions = await Division.find(divisionFilter).select('name code').sort({ name: 1 }).lean();
    res.json({
      success: true,
      data: {
        canManage: MANAGEMENT_ROLES.includes(req.user.role),
        divisions,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch asset metadata',
    });
  }
};
