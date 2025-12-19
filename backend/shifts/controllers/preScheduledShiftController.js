/**
 * Pre-Scheduled Shift Controller
 * Handles pre-scheduled shift assignments for employees
 */

const PreScheduledShift = require('../model/PreScheduledShift');
const Shift = require('../model/Shift');
const Employee = require('../../employees/model/Employee');
const RosterMeta = require('../model/RosterMeta');

/**
 * @desc    Create pre-scheduled shift
 * @route   POST /api/shifts/pre-schedule
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.createPreScheduledShift = async (req, res) => {
  try {
    const { employeeNumber, shiftId, date, notes } = req.body;

    if (!employeeNumber || !shiftId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee number, shift ID, and date are required',
      });
    }

    // Validate employee exists
    const employee = await Employee.findOne({ emp_no: employeeNumber.toUpperCase() });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Validate shift exists
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    // Check if already scheduled
    const existing = await PreScheduledShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Shift already scheduled for this employee on this date',
      });
    }

    const preScheduled = await PreScheduledShift.create({
      employeeNumber: employeeNumber.toUpperCase(),
      shiftId,
      date,
      scheduledBy: req.user._id,
      notes: notes || null,
    });

    await preScheduled.populate([
      { path: 'shiftId', select: 'name startTime endTime duration' },
      { path: 'scheduledBy', select: 'name email' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Pre-scheduled shift created successfully',
      data: preScheduled,
    });

  } catch (error) {
    console.error('Error creating pre-scheduled shift:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Shift already scheduled for this employee on this date',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create pre-scheduled shift',
    });
  }
};

/**
 * @desc    Get pre-scheduled shifts
 * @route   GET /api/shifts/pre-schedule
 * @access  Private
 */
exports.getPreScheduledShifts = async (req, res) => {
  try {
    const { employeeNumber, startDate, endDate, shiftId, page = 1, limit = 50 } = req.query;

    const query = {};

    if (employeeNumber) {
      query.employeeNumber = employeeNumber.toUpperCase();
    }

    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (shiftId) {
      query.shiftId = shiftId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const preScheduledShifts = await PreScheduledShift.find(query)
      .populate('shiftId', 'name startTime endTime duration')
      .populate('scheduledBy', 'name email')
      .sort({ date: 1, employeeNumber: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PreScheduledShift.countDocuments(query);

    res.status(200).json({
      success: true,
      data: preScheduledShifts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching pre-scheduled shifts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pre-scheduled shifts',
    });
  }
};

/**
 * @desc    Bulk create pre-scheduled shifts
 * @route   POST /api/shifts/pre-schedule/bulk
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.bulkCreatePreScheduledShifts = async (req, res) => {
  try {
    const { schedules } = req.body; // Array of { employeeNumber, shiftId, date, notes? }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Schedules array is required',
      });
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: [],
    };

    for (const schedule of schedules) {
      try {
        const { employeeNumber, shiftId, date, notes } = schedule;

        if (!employeeNumber || !shiftId || !date) {
          results.errors.push(`Missing required fields: ${JSON.stringify(schedule)}`);
          results.skipped++;
          continue;
        }

        // Check if already exists
        const existing = await PreScheduledShift.findOne({
          employeeNumber: employeeNumber.toUpperCase(),
          date: date,
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        await PreScheduledShift.create({
          employeeNumber: employeeNumber.toUpperCase(),
          shiftId,
          date,
          scheduledBy: req.user._id,
          notes: notes || null,
        });

        results.created++;

      } catch (error) {
        results.errors.push(`Error creating schedule: ${error.message}`);
        results.skipped++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Created ${results.created} pre-scheduled shifts`,
      data: results,
    });

  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create pre-scheduled shifts',
    });
  }
};

/**
 * @desc    Get roster for a month
 * @route   GET /api/shifts/roster
 * @access  Private (HOD/HR/SubAdmin/SuperAdmin)
 */
exports.getRoster = async (req, res) => {
  try {
    const { month, employeeNumber, departmentId } = req.query; // month = YYYY-MM

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month (YYYY-MM) is required' });
    }

    const start = `${month}-01`;
    const endDate = new Date(parseInt(month.split('-')[0], 10), parseInt(month.split('-')[1], 10), 0).getDate();
    const end = `${month}-${String(endDate).padStart(2, '0')}`;

    const query = { date: { $gte: start, $lte: end } };
    let empNumbersFilter = null;

    if (employeeNumber) {
      query.employeeNumber = employeeNumber.toUpperCase();
    } else if (departmentId) {
      const emps = await Employee.find({ department_id: departmentId }).select('emp_no');
      empNumbersFilter = emps.map((e) => e.emp_no.toUpperCase());
      query.employeeNumber = { $in: empNumbersFilter };
    }

    const schedules = await PreScheduledShift.find(query)
      .select('employeeNumber shiftId actualShiftId isDeviation attendanceDailyId date status notes')
      .populate('shiftId', 'name code startTime endTime duration')
      .populate('actualShiftId', 'name code startTime endTime duration');

    const meta = await RosterMeta.findOne({ month });

    res.status(200).json({
      success: true,
      data: {
        month,
        strict: meta?.strict || false,
        entries: schedules.map((s) => {
          // Determine status: explicit status field, or infer from shiftId being null
          let status = s.status;
          if (!status && !s.shiftId) {
            // Legacy data: if shiftId is null and no status, check notes
            status = (s.notes && s.notes.includes('Week Off')) ? 'WO' : undefined;
          }

          return {
            employeeNumber: s.employeeNumber,
            date: s.date,
            shiftId: s.shiftId?._id || null,
            shift: s.shiftId || null,
            actualShiftId: s.actualShiftId?._id || null,
            actualShift: s.actualShiftId || null,
            isDeviation: s.isDeviation || false,
            attendanceDailyId: s.attendanceDailyId || null,
            status: status || undefined, // Return 'WO' if status is 'WO', otherwise undefined
          };
        }),
      },
    });
  } catch (error) {
    console.error('Error fetching roster:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch roster',
    });
  }
};

/**
 * @desc    Save roster for a month (replace entries)
 * @route   POST /api/shifts/roster
 * @access  Private (HOD/HR/SubAdmin/SuperAdmin)
 */
exports.saveRoster = async (req, res) => {
  try {
    const { month, strict = false, entries } = req.body; // entries: [{ employeeNumber, date, shiftId, status }]

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month (YYYY-MM) is required' });
    }
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: 'Entries array is required' });
    }

    const start = `${month}-01`;
    const endDate = new Date(parseInt(month.split('-')[0], 10), parseInt(month.split('-')[1], 10), 0).getDate();
    const end = `${month}-${String(endDate).padStart(2, '0')}`;

    // Validate shifts and employees
    const shiftIds = new Set(entries.filter((e) => e.shiftId).map((e) => e.shiftId));
    if (shiftIds.size > 0) {
      const found = await Shift.find({ _id: { $in: Array.from(shiftIds) } }).select('_id');
      if (found.length !== shiftIds.size) {
        return res.status(400).json({ success: false, message: 'One or more shiftIds are invalid' });
      }
    }

    const empNos = Array.from(new Set(entries.map((e) => (e.employeeNumber || '').toUpperCase()))).filter(Boolean);
    if (empNos.length === 0) {
      return res.status(400).json({ success: false, message: 'Employee numbers are required in entries' });
    }
    const existingEmps = await Employee.find({ emp_no: { $in: empNos } }).select('emp_no');
    const existingEmpNos = new Set(existingEmps.map((e) => e.emp_no.toUpperCase()));
    const missing = empNos.filter((x) => !existingEmpNos.has(x));
    if (missing.length) {
      return res.status(404).json({ success: false, message: `Employees not found: ${missing.join(', ')}` });
    }

    // Remove existing roster for month for provided employees
    await PreScheduledShift.deleteMany({
      employeeNumber: { $in: empNos },
      date: { $gte: start, $lte: end },
    });

    // Prepare bulk insert
    const bulk = [];
    let skippedCount = 0;
    entries.forEach((e, index) => {
      const empNo = (e.employeeNumber || '').toUpperCase();
      if (!empNo || !e.date) {
        skippedCount++;
        console.warn(`[Entry ${index}] Skipping: missing employeeNumber or date:`, e);
        return;
      }
      const day = String(e.date || '').split('T')[0];
      // skip outside month
      if (day < start || day > end) {
        skippedCount++;
        console.warn(`[Entry ${index}] Skipping: date outside month range:`, day);
        return;
      }

      // Validate: must have either shiftId or status='WO'
      if (!e.shiftId && e.status !== 'WO') {
        skippedCount++;
        console.warn(`[Entry ${index}] Skipping: no shiftId and status is not 'WO':`, e);
        return;
      }

      // Build entry object
      const entry = {
        employeeNumber: empNo,
        date: day,
        scheduledBy: req.user._id,
      };

      // Handle week off
      if (e.status === 'WO') {
        entry.shiftId = null;
        entry.status = 'WO';
        entry.notes = 'Week Off';
        console.log(`[Entry ${index}] Week off for ${empNo} on ${day}`);
      } else {
        // Regular shift - must have valid shiftId
        if (!e.shiftId) {
          skippedCount++;
          console.warn(`[Entry ${index}] Skipping: no shiftId for regular shift:`, e);
          return;
        }
        // Ensure shiftId is a valid ObjectId string
        try {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(e.shiftId)) {
            skippedCount++;
            console.warn(`[Entry ${index}] Skipping: invalid shiftId format:`, e.shiftId);
            return;
          }
          entry.shiftId = e.shiftId;
        } catch (err) {
          skippedCount++;
          console.warn(`[Entry ${index}] Skipping: error validating shiftId:`, err.message);
          return;
        }
        // Don't set status field for regular shifts (leave it undefined)
        entry.notes = null;
        console.log(`[Entry ${index}] Regular shift ${e.shiftId} for ${empNo} on ${day}`);
      }

      bulk.push(entry);
    });

    console.log(`[Save Roster] Processed ${entries.length} entries: ${bulk.length} valid, ${skippedCount} skipped`);

    let savedCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    if (bulk.length > 0) {
      console.log(`[Save Roster] Preparing to save ${bulk.length} entries for month ${month}`);
      console.log(`[Save Roster] Sample entries:`, JSON.stringify(bulk.slice(0, 3), null, 2));

      // Try saving individually to get detailed error messages
      let saved = 0;
      let failed = 0;
      let duplicateCount = 0;
      const errors = [];

      for (let i = 0; i < bulk.length; i++) {
        const entry = bulk[i];
        try {
          // Convert shiftId string to ObjectId if it's a string
          const mongoose = require('mongoose');
          if (entry.shiftId && typeof entry.shiftId === 'string') {
            entry.shiftId = new mongoose.Types.ObjectId(entry.shiftId);
          }

          // Create document instance and save (this works better with validation hooks)
          const doc = new PreScheduledShift(entry);
          await doc.save();
          saved++;
          if (i < 5) {
            console.log(`[Save Roster] Successfully saved entry ${i}:`, doc._id);
          }
        } catch (err) {
          if (err.code === 11000) {
            duplicateCount++;
            if (duplicateCount <= 5) {
              console.warn(`[Save Roster] Duplicate entry ${i}:`, entry.employeeNumber, entry.date);
            }
          } else {
            failed++;
            const errorMsg = {
              index: i,
              entry: { employeeNumber: entry.employeeNumber, date: entry.date, shiftId: entry.shiftId, status: entry.status },
              error: err.message,
              validationErrors: err.errors || null,
            };
            errors.push(errorMsg);
            if (failed <= 5) {
              console.error(`[Save Roster] Error saving entry ${i}:`, errorMsg);
            }
          }
        }
      }

      console.log(`[Save Roster] Final result: ${saved} saved, ${failed} failed, ${duplicateCount} duplicates`);
      if (errors.length > 0) {
        console.error(`[Save Roster] First 5 errors:`, errors.slice(0, 5));
      }

      // Store counts for response
      savedCount = saved;
      failedCount = failed;
      duplicateCount = duplicateCount;
    } else {
      console.warn(`[Save Roster] No entries to save for month ${month}. Total entries received: ${entries.length}`);
    }

    await RosterMeta.findOneAndUpdate(
      { month },
      { $set: { strict, updatedBy: req.user._id } },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: `Roster saved: ${savedCount} entries saved, ${failedCount} failed, ${duplicateCount} duplicates`,
      data: {
        month,
        strict,
        saved: savedCount,
        failed: failedCount,
        duplicates: duplicateCount,
        totalReceived: entries.length,
        skipped: skippedCount,
      },
    });
  } catch (error) {
    console.error('Error saving roster:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save roster',
    });
  }
};

/**
 * @desc    Update pre-scheduled shift
 * @route   PUT /api/shifts/pre-schedule/:id
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.updatePreScheduledShift = async (req, res) => {
  try {
    const { shiftId, notes } = req.body;

    const preScheduled = await PreScheduledShift.findById(req.params.id);

    if (!preScheduled) {
      return res.status(404).json({
        success: false,
        message: 'Pre-scheduled shift not found',
      });
    }

    if (shiftId) {
      const shift = await Shift.findById(shiftId);
      if (!shift) {
        return res.status(404).json({
          success: false,
          message: 'Shift not found',
        });
      }
      preScheduled.shiftId = shiftId;
    }

    if (notes !== undefined) {
      preScheduled.notes = notes;
    }

    await preScheduled.save();

    await preScheduled.populate([
      { path: 'shiftId', select: 'name startTime endTime duration' },
      { path: 'scheduledBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Pre-scheduled shift updated successfully',
      data: preScheduled,
    });

  } catch (error) {
    console.error('Error updating pre-scheduled shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update pre-scheduled shift',
    });
  }
};

/**
 * @desc    Delete pre-scheduled shift
 * @route   DELETE /api/shifts/pre-schedule/:id
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.deletePreScheduledShift = async (req, res) => {
  try {
    const preScheduled = await PreScheduledShift.findById(req.params.id);

    if (!preScheduled) {
      return res.status(404).json({
        success: false,
        message: 'Pre-scheduled shift not found',
      });
    }

    await preScheduled.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Pre-scheduled shift deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting pre-scheduled shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete pre-scheduled shift',
    });
  }
};

