/**
 * Attendance Settings Model
 * Stores MSSQL configuration and sync settings
 */

const mongoose = require('mongoose');

const attendanceSettingsSchema = new mongoose.Schema(
  {
    // Data Source Selection
    dataSource: {
      type: String,
      enum: ['mssql', 'mongodb'],
      default: 'mongodb',
    },
    
    // MSSQL Configuration
    mssqlConfig: {
      databaseName: {
        type: String,
        trim: true,
        default: null,
      },
      tableName: {
        type: String,
        trim: true,
        default: null,
      },
      columnMapping: {
        employeeNumberColumn: {
          type: String,
          trim: true,
          default: null,
        },
        timestampColumn: {
          type: String,
          trim: true,
          default: null,
        },
        typeColumn: {
          type: String,
          trim: true,
          default: null, // Optional: column that indicates IN/OUT
        },
        hasTypeColumn: {
          type: Boolean,
          default: false, // Does table have separate IN/OUT type column?
        },
      },
    },
    
    // Sync Settings
    syncSettings: {
      autoSyncEnabled: {
        type: Boolean,
        default: false,
      },
      syncIntervalHours: {
        type: Number,
        default: 1, // Default: sync every 1 hour
        min: 0.5, // Minimum: 30 minutes
        max: 24, // Maximum: 24 hours
      },
      lastSyncAt: {
        type: Date,
        default: null,
      },
      lastSyncStatus: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        default: null,
      },
      lastSyncMessage: {
        type: String,
        default: null,
      },
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

module.exports = mongoose.models.AttendanceSettings || mongoose.model('AttendanceSettings', attendanceSettingsSchema);

