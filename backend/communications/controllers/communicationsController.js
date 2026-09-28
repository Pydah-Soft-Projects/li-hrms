const SmsTemplate = require('../model/SmsTemplate');
const CommunicationLog = require('../model/CommunicationLog');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const EmployeeGroup = require('../../employees/model/EmployeeGroup');
const { sendSmsThroughBulkSmsApps } = require('../../shared/services/bulkSms.service');
const { createNotifications } = require('../../notifications/services/notificationService');

// Helper to replace variables in message template (handles {#var#} and named tags)
function formatMessage(templateStr, data = {}, varMappings = []) {
  if (!templateStr) return '';
  const dateStr = new Date().toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });

  let formatted = templateStr;

  // Replace {#var#} sequentially using varMappings configuration
  if (Array.isArray(varMappings) && varMappings.length > 0) {
    let varIndex = 0;
    formatted = formatted.replace(/\{#var#\}/gi, () => {
      const mapping = varMappings[varIndex] || { type: 'dynamic', dynamicField: 'employee_name' };
      varIndex++;

      if (mapping.type === 'static') {
        return mapping.staticValue !== undefined ? mapping.staticValue : '';
      }

      const field = mapping.dynamicField || 'employee_name';
      if (field === 'employee_name') return data.employee_name || data.name || 'Employee';
      if (field === 'emp_no') return data.emp_no || '';
      if (field === 'department') return data.department || '';
      if (field === 'company_name') return data.company_name || 'Pydah Group';
      if (field === 'date') return dateStr;
      return '';
    });
  }

  return formatted
    .replace(/\{employee_name\}/gi, data.employee_name || data.name || 'Employee')
    .replace(/\{emp_no\}/gi, data.emp_no || '')
    .replace(/\{department\}/gi, data.department || '')
    .replace(/\{company_name\}/gi, data.company_name || 'Pydah Group')
    .replace(/\{date\}/gi, dateStr);
}

// ----------------------------------------------------
// BROADCAST MESSAGES (SMS & POPUP NOTIFICATIONS)
// ----------------------------------------------------
exports.sendBroadcast = async (req, res) => {
  try {
    const {
      channel = 'SMS', // 'SMS', 'POPUP', 'BOTH'
      recipientType = 'ALL', // 'ALL', 'DIVISION', 'DEPARTMENT', 'EMPLOYEE_GROUP', 'SPECIFIC_EMPLOYEES', 'CUSTOM_NUMBERS'
      divisionIds = [],
      departmentIds = [],
      groupIds = [],
      employeeIds = [],
      customNumbers = [],
      title = 'Announcement',
      body = '',
      templateId = null,
      scheduledFor = null,
      dltTemplateId = '',
      senderId = 'PYDAHK',
      varMappings = []
    } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    let targetSummary = '';
    let targetEmployees = [];
    let customPhoneList = [];

    // Resolve Recipients
    if (recipientType === 'CUSTOM_NUMBERS') {
      const numbersRaw = Array.isArray(customNumbers) ? customNumbers : String(customNumbers).split(/[\n,;]+/);
      customPhoneList = numbersRaw
        .map(n => String(n).trim().replace(/[^\d+]/g, ''))
        .filter(n => n.length >= 10);

      if (customPhoneList.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid phone numbers provided.' });
      }
      targetSummary = `${customPhoneList.length} Custom Phone Number(s)`;
    } else {
      let query = { is_active: { $ne: false } };

      if (recipientType === 'SPECIFIC_EMPLOYEES' && employeeIds.length > 0) {
        query = { is_active: { $ne: false }, _id: { $in: employeeIds } };
        targetSummary = `${employeeIds.length} Selected Employee(s)`;
      } else {
        const summaries = [];
        if (Array.isArray(divisionIds) && divisionIds.length > 0) {
          query.division_id = { $in: divisionIds };
          const divs = await Division.find({ _id: { $in: divisionIds } }).select('name division_name').lean();
          summaries.push(`Divisions: ${divs.map(d => d.name || d.division_name || 'Division').join(', ')}`);
        }
        if (Array.isArray(departmentIds) && departmentIds.length > 0) {
          query.department_id = { $in: departmentIds };
          const depts = await Department.find({ _id: { $in: departmentIds } }).select('department_name name').lean();
          summaries.push(`Departments: ${depts.map(d => d.department_name || d.name || 'Dept').join(', ')}`);
        }
        if (Array.isArray(groupIds) && groupIds.length > 0) {
          query.$or = [
            { employee_group: { $in: groupIds } },
            { employee_group_id: { $in: groupIds } }
          ];
          const groups = await EmployeeGroup.find({ _id: { $in: groupIds } }).select('name').lean();
          summaries.push(`Groups: ${groups.map(g => g.name).join(', ')}`);
        }
        targetSummary = summaries.length > 0 ? summaries.join(' | ') : 'All Active Employees';
      }

      targetEmployees = await Employee.find(query)
        .select('_id emp_no employee_name phone_number mobile_number department_id')
        .populate('department_id', 'department_name')
        .lean();

      if (targetEmployees.length === 0) {
        return res.status(400).json({ success: false, message: 'No active employees found matching criteria.' });
      }
    }

    const recipientLogs = [];
    let smsSuccessCount = 0;
    let smsFailCount = 0;
    let popupSuccessCount = 0;
    let popupFailCount = 0;

    let activeVarMappings = varMappings;
    if ((!activeVarMappings || activeVarMappings.length === 0) && templateId) {
      const tmpl = await SmsTemplate.findById(templateId).select('category dlt_template_id sender_id var_mappings').lean();
      if (tmpl) {
        if (tmpl.var_mappings && tmpl.var_mappings.length > 0) {
          activeVarMappings = tmpl.var_mappings;
        }
        if (tmpl.dlt_template_id) dltTemplateId = dltTemplateId || tmpl.dlt_template_id;
        if (tmpl.sender_id) senderId = senderId || tmpl.sender_id;
      }
    }

    // ------------------------------------------------
    // 1. PROCESS SMS BROADCAST
    // ------------------------------------------------
    if (channel === 'SMS' || channel === 'BOTH') {
      if (recipientType === 'CUSTOM_NUMBERS') {
        try {
          const smsRes = await sendSmsThroughBulkSmsApps({
            numbers: customPhoneList,
            message: formatMessage(body, {}, activeVarMappings),
            senderId: senderId || 'PYDAHK',
            templateId: dltTemplateId || undefined,
          });

          for (const num of customPhoneList) {
            recipientLogs.push({
              name: 'Custom Recipient',
              phone_number: num,
              sms_status: smsRes.success ? 'SENT' : 'FAILED',
              popup_status: 'NOT_APPLICABLE',
              error_message: smsRes.success ? '' : (smsRes.responseText || 'SMS delivery failed')
            });
            if (smsRes.success) smsSuccessCount++;
            else smsFailCount++;
          }
        } catch (err) {
          for (const num of customPhoneList) {
            recipientLogs.push({
              name: 'Custom Recipient',
              phone_number: num,
              sms_status: 'FAILED',
              popup_status: 'NOT_APPLICABLE',
              error_message: err.message
            });
            smsFailCount++;
          }
        }
      } else {
        // Employees SMS sending
        const hasPersonalizedVars = /\{#var#\}|\{employee_name\}|\{emp_no\}|\{department\}/i.test(body) ||
          (Array.isArray(activeVarMappings) && activeVarMappings.some(v => v.type === 'dynamic'));

        if (!hasPersonalizedVars) {
          // Send in bulk to save time
          const validEmps = targetEmployees.filter(e => {
            const phone = e.phone_number || e.mobile_number;
            return phone && String(phone).replace(/[^\d]/g, '').length >= 10;
          });

          const phoneMap = new Map();
          validEmps.forEach(e => {
            const rawPhone = String(e.phone_number || e.mobile_number).replace(/[^\d+]/g, '');
            phoneMap.set(e._id.toString(), rawPhone);
          });

          const phoneNumbers = Array.from(new Set(Array.from(phoneMap.values())));

          if (phoneNumbers.length > 0) {
            try {
              const smsRes = await sendSmsThroughBulkSmsApps({
                numbers: phoneNumbers,
                message: formatMessage(body, {}, activeVarMappings),
                senderId: senderId || 'PYDAHK',
                templateId: dltTemplateId || undefined,
              });

              for (const emp of targetEmployees) {
                const phone = phoneMap.get(emp._id.toString());
                const isSent = phone && smsRes.success;

                recipientLogs.push({
                  employee_id: emp._id,
                  emp_no: emp.emp_no,
                  name: emp.employee_name,
                  phone_number: phone || '',
                  sms_status: phone ? (smsRes.success ? 'SENT' : 'FAILED') : 'SKIPPED',
                  popup_status: 'NOT_APPLICABLE',
                  error_message: !phone ? 'Missing phone number' : (smsRes.success ? '' : (smsRes.responseText || 'Failed'))
                });

                if (phone) {
                  if (smsRes.success) smsSuccessCount++;
                  else smsFailCount++;
                }
              }
            } catch (err) {
              for (const emp of targetEmployees) {
                const phone = phoneMap.get(emp._id.toString());
                recipientLogs.push({
                  employee_id: emp._id,
                  emp_no: emp.emp_no,
                  name: emp.employee_name,
                  phone_number: phone || '',
                  sms_status: phone ? 'FAILED' : 'SKIPPED',
                  popup_status: 'NOT_APPLICABLE',
                  error_message: !phone ? 'Missing phone number' : err.message
                });
                if (phone) smsFailCount++;
              }
            }
          } else {
            for (const emp of targetEmployees) {
              recipientLogs.push({
                employee_id: emp._id,
                emp_no: emp.emp_no,
                name: emp.employee_name,
                phone_number: '',
                sms_status: 'SKIPPED',
                popup_status: 'NOT_APPLICABLE',
                error_message: 'Missing phone number'
              });
            }
          }
        } else {
          // Personalized per employee
          for (const emp of targetEmployees) {
            const phone = String(emp.phone_number || emp.mobile_number || '').replace(/[^\d+]/g, '');
            if (phone.length >= 10) {
              try {
                const personalizedMsg = formatMessage(body, {
                  employee_name: emp.employee_name,
                  emp_no: emp.emp_no,
                  department: emp.department_id?.department_name || '',
                }, activeVarMappings);

                const smsRes = await sendSmsThroughBulkSmsApps({
                  numbers: [phone],
                  message: personalizedMsg,
                  senderId: senderId || 'PYDAHK',
                  templateId: dltTemplateId || undefined,
                });

                recipientLogs.push({
                  employee_id: emp._id,
                  emp_no: emp.emp_no,
                  name: emp.employee_name,
                  phone_number: phone,
                  sms_status: smsRes.success ? 'SENT' : 'FAILED',
                  popup_status: 'NOT_APPLICABLE',
                  error_message: smsRes.success ? '' : (smsRes.responseText || 'Failed')
                });

                if (smsRes.success) smsSuccessCount++;
                else smsFailCount++;
              } catch (err) {
                recipientLogs.push({
                  employee_id: emp._id,
                  emp_no: emp.emp_no,
                  name: emp.employee_name,
                  phone_number: phone,
                  sms_status: 'FAILED',
                  popup_status: 'NOT_APPLICABLE',
                  error_message: err.message
                });
                smsFailCount++;
              }
            } else {
              recipientLogs.push({
                employee_id: emp._id,
                emp_no: emp.emp_no,
                name: emp.employee_name,
                phone_number: phone,
                sms_status: 'SKIPPED',
                popup_status: 'NOT_APPLICABLE',
                error_message: 'Invalid or missing phone number'
              });
            }
          }
        }
      }
    }

    // ------------------------------------------------
    // 2. PROCESS POPUP NOTIFICATION BROADCAST
    // ------------------------------------------------
    if (recipientType !== 'CUSTOM_NUMBERS') {
      const empIds = targetEmployees.map(e => e._id);
      const empNos = targetEmployees.map(e => e.emp_no).filter(Boolean);
      const empEmails = targetEmployees.map(e => e.email).filter(Boolean).map(email => email.toLowerCase());

      const userDocs = await User.find({
        $or: [
          { employeeRef: { $in: empIds } },
          { employeeId: { $in: empNos } },
          { emp_no: { $in: empNos } },
          { email: { $in: empEmails } }
        ]
      }).select('_id employeeRef employeeId emp_no email').lean();

      const userMap = new Map();
      userDocs.forEach(u => {
        if (u.employeeRef) userMap.set(u.employeeRef.toString(), u._id.toString());
        if (u.employeeId) userMap.set(u.employeeId, u._id.toString());
        if (u.emp_no) userMap.set(u.emp_no, u._id.toString());
        if (u.email) userMap.set(u.email.toLowerCase(), u._id.toString());
      });

      for (const emp of targetEmployees) {
        let userId = userMap.get(emp._id.toString()) || 
                     (emp.emp_no ? userMap.get(emp.emp_no) : null) ||
                     (emp.email ? userMap.get(emp.email.toLowerCase()) : null);

        // Auto-provision user account for employee if missing, so popup notifications work!
        if (!userId) {
          try {
            const defaultEmail = emp.email ? emp.email.toLowerCase() : `${emp.emp_no.toLowerCase()}@pydah.edu.in`;
            const newUser = await User.create({
              email: defaultEmail,
              password: 'Password@123',
              name: emp.employee_name,
              role: 'employee',
              roles: ['employee'],
              employeeId: emp.emp_no,
              employeeRef: emp._id,
              scope: 'global',
              dataScope: 'own'
            });
            userId = newUser._id.toString();
            userMap.set(emp._id.toString(), userId);
            if (emp.emp_no) userMap.set(emp.emp_no, userId);
            if (emp.email) userMap.set(emp.email.toLowerCase(), userId);
            console.log(`[Communications] Auto-created user account for employee ${emp.emp_no} (${emp.employee_name})`);
          } catch (createErr) {
            console.warn(`[Communications] Auto-user creation failed for ${emp.emp_no}:`, createErr.message);
          }
        }

        const hasUser = Boolean(userId);

        if (hasUser) {
          try {
            const personalizedMsg = formatMessage(body, {
              employee_name: emp.employee_name,
              emp_no: emp.emp_no,
              department: emp.department_id?.department_name || '',
            }, activeVarMappings);

            await createNotifications({
              recipientUserIds: [userId || emp._id],
              module: 'communications',
              eventType: 'broadcast_message',
              title: title || 'Broadcast Notification',
              message: personalizedMsg,
              priority: 'high',
              createdBy: req.user?._id || null
            });

            popupSuccessCount++;
          } catch (err) {
            popupFailCount++;
            console.error(`[Communications] In-app popup failed for user ${userId}:`, err.message);
          }
        } else {
          popupFailCount++;
        }

        let logIndex = recipientLogs.findIndex(l => String(l.employee_id) === String(emp._id));
        if (logIndex !== -1) {
          recipientLogs[logIndex].popup_status = hasUser ? 'SENT' : 'SKIPPED';
          if (!hasUser && recipientLogs[logIndex].error_message === '') {
            recipientLogs[logIndex].error_message = 'No active user account found for employee';
          }
        } else {
          recipientLogs.push({
            employee_id: emp._id,
            emp_no: emp.emp_no,
            name: emp.employee_name,
            phone_number: emp.phone_number || emp.mobile_number || '',
            sms_status: 'NOT_APPLICABLE',
            popup_status: hasUser ? 'SENT' : 'SKIPPED',
            error_message: hasUser ? '' : 'No active user account found for employee'
          });
        }
      }
    }

    // Determine overall status
    let overallStatus = 'SENT';
    if (smsFailCount > 0 || popupFailCount > 0) {
      overallStatus = (smsSuccessCount > 0 || popupSuccessCount > 0) ? 'PARTIAL' : 'FAILED';
    }

    const totalRecipientsCount = recipientType === 'CUSTOM_NUMBERS' ? customPhoneList.length : targetEmployees.length;

    // Save Communication Log
    let logCategory = req.body.category || 'GENERAL';
    if (templateId) {
      const tmpl = await SmsTemplate.findById(templateId).select('category').lean();
      if (tmpl && tmpl.category) logCategory = tmpl.category;
    }

    const logDoc = await CommunicationLog.create({
      channel,
      title,
      category: logCategory,
      body,
      recipient_type: recipientType,
      target_summary: targetSummary,
      recipient_count: totalRecipientsCount,
      recipients: recipientLogs,
      template_id: templateId || null,
      status: overallStatus,
      sent_at: new Date(),
      created_by: req.user?._id || null
    });

    return res.json({
      success: true,
      message: `Message broadcast processed successfully (${overallStatus}).`,
      data: {
        logId: logDoc._id,
        status: overallStatus,
        totalRecipients: totalRecipientsCount,
        smsSent: smsSuccessCount,
        smsFailed: smsFailCount,
        popupsSent: popupSuccessCount,
        popupsFailed: popupFailCount
      }
    });

  } catch (error) {
    console.error('[Communications] Broadcast Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send broadcast message.'
    });
  }
};

// ----------------------------------------------------
// SMS TEMPLATES CONTROLLERS
// ----------------------------------------------------
exports.getTemplates = async (req, res) => {
  try {
    const { search, category, channel, activeOnly } = req.query;
    const filter = {};

    if (activeOnly === 'true') filter.is_active = true;
    if (category) filter.category = category;
    if (channel) filter.channel = channel;
    if (search) {
      filter.$or = [
        { template_name: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    const templates = await SmsTemplate.find(filter).sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const {
      template_name,
      category = 'GENERAL',
      channel = 'SMS',
      subject = '',
      body,
      dlt_template_id = '',
      sender_id = 'PYDAHK',
      var_mappings = []
    } = req.body;

    if (!template_name || !body) {
      return res.status(400).json({ success: false, message: 'Template name and body are required.' });
    }

    // Extract variable placeholders
    const matches = body.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    const placeholders = Array.from(new Set(matches));

    const template = await SmsTemplate.create({
      template_name,
      category,
      channel,
      subject,
      body,
      dlt_template_id,
      sender_id,
      placeholders,
      var_mappings,
      created_by: req.user?._id || null
    });

    return res.status(201).json({
      success: true,
      message: 'Template created successfully.',
      data: template
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      template_name,
      category,
      channel,
      subject,
      body,
      dlt_template_id,
      sender_id,
      var_mappings,
      is_active
    } = req.body;

    const updates = {};
    if (template_name !== undefined) updates.template_name = template_name;
    if (category !== undefined) updates.category = category;
    if (channel !== undefined) updates.channel = channel;
    if (subject !== undefined) updates.subject = subject;
    if (dlt_template_id !== undefined) updates.dlt_template_id = dlt_template_id;
    if (sender_id !== undefined) updates.sender_id = sender_id;
    if (var_mappings !== undefined) updates.var_mappings = var_mappings;
    if (is_active !== undefined) updates.is_active = is_active;
    if (category !== undefined) updates.category = category;
    if (channel !== undefined) updates.channel = channel;
    if (subject !== undefined) updates.subject = subject;
    if (dlt_template_id !== undefined) updates.dlt_template_id = dlt_template_id;
    if (sender_id !== undefined) updates.sender_id = sender_id;
    if (is_active !== undefined) updates.is_active = is_active;

    if (body !== undefined) {
      updates.body = body;
      const matches = body.match(/\{[a-zA-Z0-9_]+\}/g) || [];
      updates.placeholders = Array.from(new Set(matches));
    }

    updates.updated_by = req.user?._id || null;

    const template = await SmsTemplate.findByIdAndUpdate(id, updates, { new: true });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    return res.json({
      success: true,
      message: 'Template updated successfully.',
      data: template
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await SmsTemplate.findByIdAndDelete(id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    return res.json({
      success: true,
      message: 'Template deleted successfully.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ----------------------------------------------------
// REPORTS & ANALYTICS CONTROLLERS
// ----------------------------------------------------
exports.getReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = '',
      status = '',
      channel = '',
      recipientType = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (channel) query.channel = channel;
    if (recipientType) query.recipient_type = recipientType;

    if (startDate || endDate) {
      query.sent_at = {};
      if (startDate) query.sent_at.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.sent_at.$lte = end;
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
        { target_summary: { $regex: search, $options: 'i' } },
        { 'recipients.name': { $regex: search, $options: 'i' } },
        { 'recipients.phone_number': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await CommunicationLog.countDocuments(query);
    const logs = await CommunicationLog.find(query)
      .populate('created_by', 'name email role')
      .populate('template_id', 'template_name category')
      .sort({ sent_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    return res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const totalSent = await CommunicationLog.countDocuments();
    const successfulCount = await CommunicationLog.countDocuments({ status: 'SENT' });
    const failedCount = await CommunicationLog.countDocuments({ status: 'FAILED' });

    const totalRecipientsAgg = await CommunicationLog.aggregate([
      { $group: { _id: null, totalRecipients: { $sum: '$recipient_count' } } }
    ]);
    const totalRecipients = totalRecipientsAgg[0]?.totalRecipients || 0;

    // Aggregate total SMS sent and Popups delivered across all recipient logs
    const recipientStatsAgg = await CommunicationLog.aggregate([
      { $unwind: '$recipients' },
      {
        $group: {
          _id: null,
          smsSent: {
            $sum: {
              $cond: [{ $eq: ['$recipients.sms_status', 'SENT'] }, 1, 0]
            }
          },
          popupsSent: {
            $sum: {
              $cond: [{ $eq: ['$recipients.popup_status', 'SENT'] }, 1, 0]
            }
          }
        }
      }
    ]);

    let smsCount = recipientStatsAgg[0]?.smsSent || 0;
    let popupCount = recipientStatsAgg[0]?.popupsSent || 0;

    // Fallback for logs without itemized recipient statuses
    if (smsCount === 0 && totalSent > 0) {
      const smsLogAgg = await CommunicationLog.aggregate([
        { $match: { channel: { $in: ['SMS', 'BOTH'] } } },
        { $group: { _id: null, count: { $sum: '$recipient_count' } } }
      ]);
      smsCount = smsLogAgg[0]?.count || 0;
    }

    if (popupCount === 0 && totalSent > 0) {
      const popupLogAgg = await CommunicationLog.aggregate([
        { $match: { channel: { $in: ['POPUP', 'BOTH'] } } },
        { $group: { _id: null, count: { $sum: '$recipient_count' } } }
      ]);
      popupCount = popupLogAgg[0]?.count || 0;
    }

    const activeTemplatesCount = await SmsTemplate.countDocuments({ is_active: true });

    return res.json({
      success: true,
      data: {
        totalBroadcasts: totalSent,
        totalRecipients,
        smsCount,
        popupCount,
        successfulCount,
        failedCount,
        successRate: totalSent > 0 ? Math.round((successfulCount / totalSent) * 100) : 100,
        activeTemplatesCount
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
