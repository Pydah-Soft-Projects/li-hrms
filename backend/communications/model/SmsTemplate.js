const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema({
  template_name: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['ATTENDANCE', 'PAYROLL', 'GENERAL', 'EMERGENCY', 'GREETINGS', 'OTHER'],
    default: 'GENERAL' 
  },
  channel: { 
    type: String, 
    enum: ['SMS', 'POPUP', 'BOTH'], 
    default: 'SMS' 
  },
  subject: { type: String, trim: true, default: '' },
  body: { type: String, required: true, trim: true },
  dlt_template_id: { type: String, trim: true, default: '' },
  sender_id: { type: String, trim: true, default: 'PYDAHK' },
  placeholders: [{ type: String }],
  var_mappings: [{
    type: { type: String, enum: ['dynamic', 'static'], default: 'dynamic' },
    dynamicField: { type: String, default: 'employee_name' },
    staticValue: { type: String, default: '' }
  }],
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SmsTemplate', smsTemplateSchema);
