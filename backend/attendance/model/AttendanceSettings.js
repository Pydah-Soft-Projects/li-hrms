/**
 * Attendance Settings Model
 * Stores attendance processing and feature configuration
 */

const mongoose = require('mongoose');

const attendanceSettingsSchema = new mongoose.Schema(
  {
    dataSource: {
      type: String,
      enum: ['mongodb'],
      default: 'mongodb',
    },

    // Previous Day Linking (Settings enabled)
    previousDayLinking: {
      enabled: {
        type: Boolean,
        default: false,
      },
      requireConfirmation: {
        type: Boolean,
        default: true, // Require admin confirmation for linked records
      },
    },

    // Processing Mode (Dual-Mode: multi_shift vs single_shift)
    processingMode: {
      mode: {
        type: String,
        enum: ['multi_shift', 'single_shift'],
        default: 'multi_shift',
      },
      strictCheckInOutOnly: {
        type: Boolean,
        default: true, // Only CHECK-IN/CHECK-OUT used for pairing; others stored but ignored
      },
      continuousSplitThresholdHours: {
        type: Number,
        default: 14,
        min: 10,
        max: 24,
      },
      splitMinGapHours: {
        type: Number,
        default: 3,
        min: 0,
        max: 12,
      },
      maxShiftsPerDay: {
        type: Number,
        default: 3,
        min: 1,
        max: 3,
      },
      rosterStrictWhenPresent: {
        type: Boolean,
        default: true, // When roster exists, use ONLY roster; else hierarchy
      },
      // When strict is OFF: OUT window extends post shift end by this many hours (for OT)
      postShiftOutMarginHours: {
        type: Number,
        default: 4,
        min: 0,
        max: 8,
      },
    },

    // Feature flags: control visibility/enabling of editing and upload on attendance pages
    featureFlags: {
      allowInTimeEditing: { type: Boolean, default: true },
      allowOutTimeEditing: { type: Boolean, default: true },
      allowAttendanceUpload: { type: Boolean, default: true },
      allowShiftChange: { type: Boolean, default: true },
      /** When true AND processingMode.mode is single_shift, PARTIAL days floor payable at 0.5 in monthly summary calc */
      partialDaysContributeToPayableShifts: { type: Boolean, default: false },
    },

    // Which Complete-table aggregate columns all users see (workspace + superadmin attendance grid)
    completeSummaryColumns: {
      present: { type: Boolean, default: true },
      leaves: { type: Boolean, default: true },
      od: { type: Boolean, default: true },
      partial: { type: Boolean, default: true },
      absent: { type: Boolean, default: true },
      weekOffs: { type: Boolean, default: true },
      holidays: { type: Boolean, default: true },
      otHours: { type: Boolean, default: true },
      extraHours: { type: Boolean, default: true },
      permissions: { type: Boolean, default: true },
      lateEarly: { type: Boolean, default: true },
      attDed: { type: Boolean, default: true },
      payableShifts: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// Only one settings document should exist
attendanceSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Returns processingMode with defaults applied (handles existing docs without processingMode)
attendanceSettingsSchema.statics.getProcessingMode = function(doc) {
  const pm = doc?.processingMode || {};
  return {
    mode: pm.mode || 'multi_shift',
    // Multi-shift always uses strict (CHECK-IN/OUT only); strict toggle only applies when single_shift
    strictCheckInOutOnly: pm.mode === 'multi_shift' ? true : (pm.strictCheckInOutOnly !== false),
    continuousSplitThresholdHours: pm.continuousSplitThresholdHours ?? 14,
    splitMinGapHours: pm.splitMinGapHours ?? 3,
    maxShiftsPerDay: pm.maxShiftsPerDay ?? 3,
    rosterStrictWhenPresent: pm.rosterStrictWhenPresent !== false,
    postShiftOutMarginHours: pm.postShiftOutMarginHours ?? 4,
  };
};

module.exports = mongoose.models.AttendanceSettings || mongoose.model('AttendanceSettings', attendanceSettingsSchema);
