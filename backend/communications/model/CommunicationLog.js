const mongoose = require('mongoose');

const communicationLogSchema = new mongoose.Schema({
  channel: { 
    type: String, 
    enum: ['SMS', 'POPUP', 'BOTH'], 
    required: true 
  },
  title: { type: String, trim: true, default: '' },
  body: { type: String, trim: true, default: '' },
  category: { type: String, default: 'GENERAL' },
  recipient_type: { 
    type: String, 
    enum: ['ALL', 'DIVISION', 'DEPARTMENT', 'EMPLOYEE_GROUP', 'SPECIFIC_EMPLOYEES', 'CUSTOM_NUMBERS', 'FILTERS'],
    required: true 
  },
  target_summary: { type: String, default: '' },
  recipient_count: { type: Number, default: 0 },
  recipients: [{
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emp_no: { type: String },
    name: { type: String },
    phone_number: { type: String },
    sms_status: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
    popup_status: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
    error_message: { type: String, default: '' }
  }],
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsTemplate' },
  status: { 
    type: String, 
    enum: ['SENT', 'PARTIAL', 'FAILED', 'SCHEDULED'],
    default: 'SENT' 
  },
  scheduled_for: { type: Date, default: null },
  sent_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

communicationLogSchema.index({ sent_at: -1 });
communicationLogSchema.index({ status: 1 });
communicationLogSchema.index({ channel: 1 });

module.exports = mongoose.model('CommunicationLog', communicationLogSchema);
