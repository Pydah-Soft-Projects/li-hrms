const Shift = require('../model/Shift');
const ShiftDuration = require('../model/ShiftDuration');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const User = require('../../users/model/User');
const mongoose = require('mongoose');

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  Private
exports.getAllShifts = async (req, res) => {
  try {
    const { isActive } = req.query;
    const cacheService = require('../../shared/services/cacheService');
    const cacheKey = `shifts:all:${isActive || 'any'}`;

    // Try to get from cache
    const cachedShifts = await cacheService.get(cacheKey);
    if (cachedShifts) {
      console.log(`[Cache] Serving shifts from cache: ${cacheKey}`);
      return res.status(200).json({
        success: true,
        count: cachedShifts.length,
        data: cachedShifts,
        _cached: true
      });
    }

    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const shifts = await Shift.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Store in cache for 10 minutes
    await cacheService.set(cacheKey, shifts, 600);

    res.status(200).json({
      success: true,
      count: shifts.length,
      data: shifts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching shifts',
      error: error.message,
    });
  }
};

// @desc    Get scoped structured shift data (Divisions -> Departments -> Designations)
// @route   GET /api/shifts/scoped
// @access  Private
exports.getScopedShiftData = async (req, res) => {
  try {
    const userId = req.user.userId;
    // We assume req.user has role, but we need full data scope details
    const user = await User.findById(userId)
      .select('role dataScope divisionMapping')
      .populate('divisionMapping.division')
      .populate('divisionMapping.departments');

    if (!user) {
      // Fallback for Employee login if needed, though they usually use simple views
      return res.status(200).json({
        success: true,
        data: { divisions: [], departments: [], designations: [] }
      });
    }

    const { role, dataScope } = user;
    const isGlobal = ['super_admin', 'sub_admin'].includes(role);

    let divisions = [];
    let departments = [];
    let designations = [];

    let divQuery = { isActive: true };
    // If NOT global AND has divisionMapping, then restrict. 
    // If divisionMapping is empty/null, show all (per user request).
    if (!isGlobal && user.divisionMapping && user.divisionMapping.length > 0) {
      const allowedDivIds = new Set(
        user.divisionMapping.map(dm => (dm.division?._id || dm.division)?.toString()).filter(Boolean)
      );
      if (allowedDivIds.size > 0) divQuery._id = { $in: Array.from(allowedDivIds) };
      else divQuery._id = { $in: [] };
    }

    // Fetch divisions with correctly populated shifts
    divisions = await Division.find(divQuery)
      .populate('shifts.shiftId')
      .lean();

    let deptQuery = { isActive: true };
    if (!isGlobal && user.divisionMapping && user.divisionMapping.length > 0) {
      const allowedDeptIds = user.divisionMapping.flatMap(dm =>
        (dm.departments || []).map(d => d?._id || d)
      ).filter(Boolean);

      if (allowedDeptIds.length > 0) {
        deptQuery._id = { $in: allowedDeptIds };
      } else if (divisions.length > 0) {
        // If divMapping has divisions but no specific departments, allowed all depts in those divisions
        deptQuery.divisions = { $in: divisions.map(d => d._id) };
      } else {
        deptQuery._id = { $in: [] };
      }
    }

    // Fetch departments with correctly populated shifts
    departments = await Department.find(deptQuery)
      .populate('shifts.shiftId')
      .populate('divisionDefaults.shifts.shiftId')
      .populate('designations')
      .lean();

    // 3. DESIGNATIONS
    const deptIds = departments.map(d => d._id);
    let desQuery = { isActive: true };

    if (!isGlobal && user.divisionMapping && user.divisionMapping.length > 0) {
      if (deptIds.length > 0) {
        desQuery.department = { $in: deptIds };
      } else {
        desQuery._id = { $in: [] };
      }
    }

    designations = await Designation.find(desQuery)
      .populate('shifts.shiftId')
      .populate('departmentShifts.shifts.shiftId')
      .populate('divisionDefaults.shifts.shiftId')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        divisions,
        departments,
        designations
      }
    });

  } catch (error) {
    console.error('Error fetching scoped shift data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scoped shift data',
      error: error.message
    });
  }
};

// @desc    Get single shift
// @route   GET /api/shifts/:id
// @access  Private
exports.getShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id).populate('createdBy', 'name email');

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching shift',
      error: error.message,
    });
  }
};

// @desc    Create new shift
// @route   POST /api/shifts
// @access  Private (Super Admin, Sub Admin, HR)
exports.createShift = async (req, res) => {
  try {
    const {
      name,
      startTime,
      endTime,
      duration,
      payableShifts,
      color,
      gracePeriod,
      firstHalf,
      break: breakSegment,
      secondHalf,
    } = req.body;

    const parseTimeToMinutes = (time) => {
      if (!time) return null;
      const [hour, min] = time.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(min)) return null;
      return hour * 60 + min;
    };

    const calculateDurationFromTimes = (start, end) => {
      if (!start || !end) return null;
      const startMinutes = parseTimeToMinutes(start);
      const endMinutes = parseTimeToMinutes(end);
      if (startMinutes === null || endMinutes === null) return null;
      let diff = endMinutes - startMinutes;
      if (diff <= 0) diff += 24 * 60;
      return Math.round((diff / 60) * 100) / 100;
    };

    const normalizeHalfSegment = (segment) => {
      if (!segment || typeof segment !== 'object') return null;
      const normalized = {
        startTime: segment.startTime || null,
        endTime: segment.endTime || null,
        duration: segment.duration !== undefined ? Number(segment.duration) : undefined,
        minDuration: segment.minDuration !== undefined ? Number(segment.minDuration) : undefined,
        gracePeriod: segment.gracePeriod !== undefined ? Number(segment.gracePeriod) : 15,
        payableShifts: segment.payableShifts !== undefined ? Number(segment.payableShifts) : 0,
      };

      if (normalized.startTime && normalized.endTime && normalized.duration == null) {
        normalized.duration = calculateDurationFromTimes(normalized.startTime, normalized.endTime);
      }

      return normalized;
    };

    const normalizeBreakSegment = (segment) => {
      if (!segment || typeof segment !== 'object') return null;
      return {
        startTime: segment.startTime || null,
        endTime: segment.endTime || null,
      };
    };

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Shift name is required',
      });
    }

    let finalDuration = duration;
    let finalStartTime = startTime;
    let finalEndTime = endTime;

    if (duration && startTime && !endTime) {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = startMinutes + Number(duration) * 60;
      const endHours = Math.floor(endMinutes / 60) % 24;
      const endMins = endMinutes % 60;
      finalEndTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
    } else if (startTime && endTime && !duration) {
      finalDuration = calculateDurationFromTimes(startTime, endTime);
    }

    const firstHalfData = normalizeHalfSegment(firstHalf);
    const secondHalfData = normalizeHalfSegment(secondHalf);
    const breakData = normalizeBreakSegment(breakSegment);

    if (!finalStartTime || !finalEndTime || !finalDuration) {
      return res.status(400).json({
        success: false,
        message: 'Either provide (name, startTime, endTime) or (name, startTime, duration)',
      });
    }

    if (firstHalfData && firstHalfData.startTime && !firstHalfData.endTime) {
      return res.status(400).json({
        success: false,
        message: 'First half endTime is required when first half startTime is provided',
      });
    }
    if (firstHalfData && firstHalfData.endTime && !firstHalfData.startTime) {
      return res.status(400).json({
        success: false,
        message: 'First half startTime is required when first half endTime is provided',
      });
    }
    if (secondHalfData && secondHalfData.startTime && !secondHalfData.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Second half endTime is required when second half startTime is provided',
      });
    }
    if (secondHalfData && secondHalfData.endTime && !secondHalfData.startTime) {
      return res.status(400).json({
        success: false,
        message: 'Second half startTime is required when second half endTime is provided',
      });
    }
    if (breakData && breakData.startTime && !breakData.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Break endTime is required when break startTime is provided',
      });
    }
    if (breakData && breakData.endTime && !breakData.startTime) {
      return res.status(400).json({
        success: false,
        message: 'Break startTime is required when break endTime is provided',
      });
    }

    // Get allowed durations from ShiftDuration model
    let allowedDurations = [];
    try {
      const durationDocs = await ShiftDuration.find({ isActive: true }).select('duration');
      allowedDurations = durationDocs.map((d) => d.duration);
    } catch (err) {
      console.warn('ShiftDuration model not available, skipping validation:', err.message);
    }

    if (allowedDurations.length > 0 && finalDuration != null) {
      const isAllowed = allowedDurations.some(
        (allowed) => Math.abs(allowed - Number(finalDuration)) < 0.01
      );
      if (!isAllowed) {
        console.warn(`Creating shift with non-standard duration: ${finalDuration} hours`);
      }
    }

    const shiftPayload = {
      name,
      startTime: finalStartTime,
      endTime: finalEndTime,
      duration: Number(finalDuration),
      payableShifts: payableShifts !== undefined ? Number(payableShifts) : 1,
      gracePeriod: gracePeriod !== undefined ? Number(gracePeriod) : 15,
      color: color || '#3b82f6',
      createdBy: req.user?.userId,
      firstHalf: firstHalfData,
      break: breakData,
      secondHalf: secondHalfData,
    };

    const shift = await Shift.create(shiftPayload);

    // Clear cache
    const cacheService = require('../../shared/services/cacheService');
    await cacheService.delByPattern('shifts:*');

    // LINK TO DIVISION IF NOT GLOBAL
    // If the user has a specific division mapping and is not a super_admin/sub_admin,
    // automatically link this new shift to their assigned divisions.
    const isGlobal = ['super_admin', 'sub_admin'].includes(req.user.role || '');
    if (!isGlobal && req.user.divisionMapping && req.user.divisionMapping.length > 0) {
      try {
        const Division = require('../../departments/model/Division');
        const divisionIds = req.user.divisionMapping.map(m => m.division);
        
        await Division.updateMany(
          { _id: { $in: divisionIds } },
          { 
            $addToSet: { 
              shifts: { 
                shiftId: shift._id, 
                gender: 'All' 
              } 
            } 
          }
        );
      } catch (linkErr) {
        console.error('Error linking new shift to divisions:', linkErr);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Shift created successfully',
      data: shift,
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Shift with this name already exists',
      });
    }

    console.error('Error creating shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating shift',
      error: error.message,
    });
  }
};

// @desc    Update shift
// @route   PUT /api/shifts/:id
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateShift = async (req, res) => {
  try {
    const { name, startTime, endTime, duration, payableShifts, isActive, color, gracePeriod, firstHalf, break: breakSegment, secondHalf } = req.body;

    const parseTimeToMinutes = (time) => {
      if (!time) return null;
      const [hour, min] = time.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(min)) return null;
      return hour * 60 + min;
    };

    const calculateDurationFromTimes = (start, end) => {
      if (!start || !end) return null;
      const startMinutes = parseTimeToMinutes(start);
      const endMinutes = parseTimeToMinutes(end);
      if (startMinutes === null || endMinutes === null) return null;
      let diff = endMinutes - startMinutes;
      if (diff <= 0) diff += 24 * 60;
      return Math.round((diff / 60) * 100) / 100;
    };

    const normalizeHalfSegment = (segment) => {
      if (segment === undefined) return undefined;
      if (!segment || typeof segment !== 'object') return null;
      const normalized = {
        startTime: segment.startTime || null,
        endTime: segment.endTime || null,
        duration: segment.duration !== undefined ? Number(segment.duration) : undefined,
        minDuration: segment.minDuration !== undefined ? Number(segment.minDuration) : undefined,
        gracePeriod: segment.gracePeriod !== undefined ? Number(segment.gracePeriod) : 15,
        payableShifts: segment.payableShifts !== undefined ? Number(segment.payableShifts) : 0,
      };

      if (normalized.startTime && normalized.endTime && normalized.duration == null) {
        normalized.duration = calculateDurationFromTimes(normalized.startTime, normalized.endTime);
      }

      return normalized;
    };

    const normalizeBreakSegment = (segment) => {
      if (segment === undefined) return undefined;
      if (!segment || typeof segment !== 'object') return null;
      return {
        startTime: segment.startTime || null,
        endTime: segment.endTime || null,
      };
    };

    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    if (firstHalf !== undefined) {
      shift.firstHalf = normalizeHalfSegment(firstHalf);
    }
    if (breakSegment !== undefined) {
      shift.break = normalizeBreakSegment(breakSegment);
    }
    if (secondHalf !== undefined) {
      shift.secondHalf = normalizeHalfSegment(secondHalf);
    }

    const finalFirstHalf = shift.firstHalf;
    const finalSecondHalf = shift.secondHalf;
    const finalBreak = shift.break;

    if (finalFirstHalf && finalFirstHalf.startTime && !finalFirstHalf.endTime) {
      return res.status(400).json({
        success: false,
        message: 'First half endTime is required when first half startTime is provided',
      });
    }
    if (finalFirstHalf && finalFirstHalf.endTime && !finalFirstHalf.startTime) {
      return res.status(400).json({
        success: false,
        message: 'First half startTime is required when first half endTime is provided',
      });
    }
    if (finalSecondHalf && finalSecondHalf.startTime && !finalSecondHalf.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Second half endTime is required when second half startTime is provided',
      });
    }
    if (finalSecondHalf && finalSecondHalf.endTime && !finalSecondHalf.startTime) {
      return res.status(400).json({
        success: false,
        message: 'Second half startTime is required when second half endTime is provided',
      });
    }
    if (finalBreak && finalBreak.startTime && !finalBreak.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Break endTime is required when break startTime is provided',
      });
    }
    if (finalBreak && finalBreak.endTime && !finalBreak.startTime) {
      return res.status(400).json({
        success: false,
        message: 'Break startTime is required when break endTime is provided',
      });
    }

    // Get allowed durations from ShiftDuration model
    let allowedDurations = [];
    try {
      const durationDocs = await ShiftDuration.find({ isActive: true }).select('duration');
      allowedDurations = durationDocs.map((d) => d.duration);
    } catch (err) {
      console.warn('ShiftDuration model not available, skipping validation:', err.message);
    }

    // Update fields
    if (name) shift.name = name;
    if (startTime) shift.startTime = startTime;
    if (endTime) shift.endTime = endTime;
    if (payableShifts !== undefined) shift.payableShifts = Number(payableShifts);
    if (isActive !== undefined) shift.isActive = isActive;
    if (color) shift.color = color;
    if (gracePeriod !== undefined) shift.gracePeriod = Number(gracePeriod);

    // Recalculate duration if times changed
    if (startTime || endTime) {
      const finalStartTime = startTime || shift.startTime;
      const finalEndTime = endTime || shift.endTime;

      const [startHour, startMin] = finalStartTime.split(':').map(Number);
      const [endHour, endMin] = finalEndTime.split(':').map(Number);

      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
      }

      const durationMinutes = endMinutes - startMinutes;
      shift.duration = Math.round((durationMinutes / 60) * 100) / 100;
    } else if (duration !== undefined) {
      shift.duration = duration;
    }

    // Validate duration (Warning only)
    if (allowedDurations.length > 0) {
      const isAllowed = allowedDurations.some(
        (allowed) => Math.abs(allowed - shift.duration) < 0.01
      );

      if (!isAllowed) {
        console.warn(`Updating shift with non-standard duration: ${shift.duration} hours`);
      }
    }

    await shift.save();

    // Clear cache
    const cacheService = require('../../shared/services/cacheService');
    await cacheService.delByPattern('shifts:*');

    res.status(200).json({
      success: true,
      message: 'Shift updated successfully',
      data: shift,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Shift with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating shift',
      error: error.message,
    });
  }
};

// @desc    Delete shift
// @route   DELETE /api/shifts/:id
// @access  Private (Super Admin, Sub Admin)
exports.deleteShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    await shift.deleteOne();

    // Clear cache
    const cacheService = require('../../shared/services/cacheService');
    await cacheService.delByPattern('shifts:*');

    res.status(200).json({
      success: true,
      message: 'Shift deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting shift',
      error: error.message,
    });
  }
};

// @desc    Get allowed shift durations
// @route   GET /api/shifts/durations
// @access  Private
exports.getAllowedDurations = async (req, res) => {
  try {
    const durationDocs = await ShiftDuration.find({ isActive: true }).sort({ duration: 1 });
    const allowedDurations = durationDocs.map((d) => d.duration);

    res.status(200).json({
      success: true,
      data: allowedDurations,
      durations: durationDocs, // Full objects with labels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching allowed durations',
      error: error.message,
    });
  }
};

