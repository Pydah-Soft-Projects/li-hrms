/**
 * Canonical weekday shift pattern stored on Employee and EmployeeApplication.
 * Org-level enable/disable lives on EmployeeApplicationFormSettings.weekdayShiftSchedule.isEnabled.
 * Per-employee data is only the 7-day schedule (Sunday=0 … Saturday=6).
 */

const mongoose = require('mongoose');

const weekdayShiftDaySchema = new mongoose.Schema(
  {
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    isWeekOff: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const weekdayShiftScheduleSchema = new mongoose.Schema(
  {
    schedule: {
      type: [weekdayShiftDaySchema],
      default: [],
    },
  },
  { _id: false }
);

module.exports = {
  weekdayShiftDaySchema,
  weekdayShiftScheduleSchema,
};
