const Division = require('../model/Division');
const DivisionWorkflowSettings = require('../model/DivisionWorkflowSettings');

/**
 * @desc Get division workflow overrides (empty workflows = all inherit global)
 * @route GET /api/divisions/:id/workflow-settings
 */
exports.getDivisionWorkflowSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const division = await Division.findById(id);
    if (!division) {
      return res.status(404).json({ success: false, message: 'Division not found' });
    }
    let doc = await DivisionWorkflowSettings.findOne({ division: id })
      .populate('division', 'name code')
      .populate('updatedBy', 'name email')
      .populate('createdBy', 'name email')
      .lean();

    if (!doc) {
      doc = {
        division: id,
        workflows: {},
      };
    }

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('getDivisionWorkflowSettings:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load workflow settings' });
  }
};

/**
 * @desc Upsert division workflow overrides
 * @route PUT /api/divisions/:id/workflow-settings
 * Body: { workflows: { leave?: object|null, od?: object|null, ... } }
 */
exports.updateDivisionWorkflowSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { workflows } = req.body;

    const division = await Division.findById(id);
    if (!division) {
      return res.status(404).json({ success: false, message: 'Division not found' });
    }

    if (workflows === undefined || workflows === null || typeof workflows !== 'object') {
      return res.status(400).json({ success: false, message: 'Request body must include a workflows object' });
    }

    const allowed = ['leave', 'od', 'ccl', 'loan', 'salary_advance', 'permission', 'ot'];
    const $set = { updatedBy: req.user?._id };
    const $unset = {};

    if (workflows && typeof workflows === 'object') {
      for (const k of allowed) {
        if (!Object.prototype.hasOwnProperty.call(workflows, k)) continue;
        const v = workflows[k];
        if (v === null) {
          $unset[`workflows.${k}`] = '';
        } else if (v !== undefined && typeof v === 'object') {
          $set[`workflows.${k}`] = v;
        }
      }
    }

    const update = {
      $set,
      $setOnInsert: {
        division: id,
        createdBy: req.user?._id,
      },
    };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }

    const doc = await DivisionWorkflowSettings.findOneAndUpdate({ division: id }, update, {
      upsert: true,
      new: true,
      runValidators: true,
    })
      .populate('division', 'name code')
      .populate('updatedBy', 'name email')
      .populate('createdBy', 'name email');

    res.status(200).json({ success: true, data: doc, message: 'Division workflow settings saved' });
  } catch (error) {
    console.error('updateDivisionWorkflowSettings:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save workflow settings' });
  }
};
