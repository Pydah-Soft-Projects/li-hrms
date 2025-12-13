const mongoose = require('mongoose');

/**
 * Stores roster-level metadata per month (e.g., strict flag)
 */
const rosterMetaSchema = new mongoose.Schema(
  {
    month: {
      type: String, // YYYY-MM
      required: true,
      unique: true,
      index: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format'],
    },
    strict: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RosterMeta', rosterMetaSchema);

