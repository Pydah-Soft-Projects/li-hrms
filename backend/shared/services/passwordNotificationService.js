const { sendEmailViaBrevo } = require('./brevoEmail.service');
const { sendEmailViaNodeMailer } = require('./nodemailerEmail.service');
const { sendSmsThroughBulkSmsApps } = require('./bulkSms.service');
const Settings = require('../../settings/model/Settings');
const crypto = require('crypto');

/**
 * Generate password based on requirements
 * @param {Object} employee - Employee object
 * @param {string} mode - 'random' or 'phone_empno'
 * @returns {Promise<string>} Generated password
 */
const generatePassword = async (employee, mode = null) => {
  // Fetch setting if mode not provided
  if (!mode) {
    try {
      const modeSetting = await Settings.findOne({ key: 'password_generation_mode' });
      mode = modeSetting ? modeSetting.value : 'random';
    } catch (err) {
      console.warn('[NotificationService] Failed to fetch password mode setting, using default "random"');
      mode = 'random';
    }
  }

  if (mode === 'phone_empno' && employee) {
    const phone = employee.phone_number || '';
    const last4 = phone.slice(-4).padStart(4, '0');
    // Ensure emp_no is clean
    const empNo = (employee.emp_no || '').replace(/\s+/g, '');
    return `${last4}${empNo}`;
  }

  // Default random password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Modern HTML Email Template
 */
const getEmailTemplate = (name, username, password) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #eee; }
        .header { background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: white; padding: 40px 20px; text-align: center; }
        .content { padding: 40px; background: white; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background: #f9fafb; }
        .credential-box { background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px dashed #cbd5e1; }
        .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; transition: all 0.3s ease; }
        h1 { margin: 0; font-size: 24px; letter-spacing: -0.5px; }
        .label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .value { font-family: monospace; font-size: 18px; color: #1e293b; font-weight: bold; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animated { animation: fadeIn 0.8s ease-out forwards; }
      </style>
    </head>
    <body>
      <div class="container animated">
        <div class="header">
          <h1>Welcome to LI-HRMS</h1>
          <p>Your portal is ready, ${name}!</p>
        </div>
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your account has been successfully created. You can now log in to the HRMS portal using the following credentials:</p>
          
          <div class="credential-box">
            <div style="margin-bottom: 15px;">
              <div class="label">Username / Employee ID</div>
              <div class="value">${username}</div>
            </div>
            <div>
              <div class="label">Temporary Password</div>
              <div class="value">${password}</div>
            </div>
          </div>

          <center>
            <a href="https://li-hrms.vercel.app/login" class="button">Log In to Portal</a>
          </center>
          
          <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
            * Please change your password after your first login.<br>
            * If you didn't expect this email, please contact HR.
          </p>
        </div>
        <div class="footer">
          &copy; 2025 Pydah College. All rights reserved.<br>
          li-hrms.vercel.app
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Reset Password HTML Email Template
 */
const getResetEmailTemplate = (name, username, password) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #eee; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: white; padding: 40px 20px; text-align: center; }
        .content { padding: 40px; background: white; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background: #f9fafb; }
        .credential-box { background: #fffbeb; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px dashed #f59e0b; }
        .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; transition: all 0.3s ease; }
        h1 { margin: 0; font-size: 24px; letter-spacing: -0.5px; }
        .label { color: #92400e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .value { font-family: monospace; font-size: 18px; color: #78350f; font-weight: bold; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animated { animation: fadeIn 0.8s ease-out forwards; }
      </style>
    </head>
    <body>
      <div class="container animated">
        <div class="header">
          <h1>Password Reset</h1>
          <p>Your password has been updated, ${name}</p>
        </div>
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          <p>This is to confirm that your password for LI-HRMS has been successfully reset by an administrator. You can now log in using the following new credentials:</p>
          
          <div class="credential-box">
            <div style="margin-bottom: 15px;">
              <div class="label">Username / Employee ID</div>
              <div class="value">${username}</div>
            </div>
            <div>
              <div class="label">New Password</div>
              <div class="value">${password}</div>
            </div>
          </div>

          <center>
            <a href="https://li-hrms.vercel.app/login" class="button">Log In to Portal</a>
          </center>
          
          <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
            * If you did not request this change or believe this was an error, please contact HR immediately.<br>
            * For security, please do not share your password with anyone.
          </p>
        </div>
        <div class="footer">
          &copy; 2025 Pydah College. All rights reserved.<br>
          li-hrms.vercel.app
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Internal helper to send SMS
 */
async function _sendSms(employee, password, results, isReset = false) {
  if (!employee.phone_number) {
    console.warn(`[NotificationService] Skipping SMS for employee ${employee.emp_no || 'unknown'}: phone_number is missing`);
    return;
  }
  try {
    console.log(`[NotificationService] Sending SMS to ${employee.phone_number} for employee ${employee.emp_no}...`);
    const smsMessage = isReset
      ? `Hello ${employee.employee_name} your password has been created. Username: ${employee.emp_no} Password: ${password}. Login: li-hrms.vercel.app/login - Pydah College`
      : `Hello ${employee.employee_name} your account has been created. Username: ${employee.emp_no} Password: ${password}. Login: li-hrms.vercel.app/login - Pydah College`;

    await sendSmsThroughBulkSmsApps({
      numbers: [employee.phone_number],
      message: smsMessage
    });
    console.log(`[NotificationService] SMS sent successfully to ${employee.phone_number}`);
    results.sms = true;
  } catch (error) {
    console.error('[NotificationService] SMS failed:', error.message);
  }
}

/**
 * Internal helper to send Email
 */
async function _sendEmail(employee, password, results, isReset = false) {
  if (!employee.email) {
    console.warn(`[NotificationService] Skipping Email for employee ${employee.emp_no || 'unknown'}: email is missing`);
    return;
  }
  const htmlContent = isReset
    ? getResetEmailTemplate(employee.employee_name, employee.emp_no, password)
    : getEmailTemplate(employee.employee_name, employee.emp_no, password);

  const subject = isReset ? 'Your LI-HRMS Password has been Reset' : 'Your LI-HRMS Account Credentials';

  try {
    console.log(`[NotificationService] Sending Email to ${employee.email} for employee ${employee.emp_no} via Brevo...`);
    await sendEmailViaBrevo({
      to: employee.email,
      subject,
      htmlContent
    });
    console.log(`[NotificationService] Email sent successfully via Brevo to ${employee.email}`);
    results.email = true;
  } catch (brevoError) {
    console.warn('[NotificationService] Brevo failed, falling back to Nodemailer:', brevoError.message);
    try {
      console.log(`[NotificationService] Sending Email to ${employee.email} via Nodemailer fallback...`);
      await sendEmailViaNodeMailer({
        to: employee.email,
        subject,
        htmlContent
      });
      console.log(`[NotificationService] Email sent successfully via Nodemailer to ${employee.email}`);
      results.email = true;
    } catch (nodeMailerError) {
      console.error('[NotificationService] Email fallback also failed:', nodeMailerError.message);
      results.error = nodeMailerError.message;
    }
  }
}

/**
 * Send credentials via Email and SMS based on settings
 * @param {Object} employee - Employee object
 * @param {string} password - Raw password
 * @param {Object} manualChannels - { email: boolean, sms: boolean } (Optional override)
 * @param {boolean} isReset - Whether this is a password reset
 */
const sendCredentials = async (employee, password, manualChannels = null, isReset = false) => {
  const results = { email: false, sms: false, error: null };

  // 1. Determine delivery strategy
  let strategy = 'both'; // Default
  if (manualChannels) {
    if (manualChannels.email && manualChannels.sms) strategy = 'both';
    else if (manualChannels.email) strategy = 'email_only';
    else if (manualChannels.sms) strategy = 'sms_only';
    else strategy = 'intelligent';
  } else {
    try {
      const strategySetting = await Settings.findOne({ key: 'credential_delivery_strategy' });
      strategy = strategySetting ? strategySetting.value : 'both';
    } catch (err) {
      console.warn('[NotificationService] Failed to fetch delivery strategy setting, using default "both"');
      strategy = 'both';
    }
  }

  console.log(`[NotificationService] Using delivery strategy: ${strategy} for employee ${employee.emp_no}`);

  // 2. Execute strategy
  switch (strategy) {
    case 'email_only':
      await _sendEmail(employee, password, results, isReset);
      break;

    case 'sms_only':
      await _sendSms(employee, password, results, isReset);
      break;

    case 'both':
      await Promise.all([
        _sendSms(employee, password, results, isReset),
        _sendEmail(employee, password, results, isReset)
      ]);
      break;

    case 'intelligent':
      // Intelligent mode: SMS if phone number available, else Email
      if (employee.phone_number) {
        await _sendSms(employee, password, results, isReset);
        // Also send email as a reference if available? 
        // User said: "if he has no number then it hsould opt for the mail"
        // This implies XOR or Priority. To be safe we'll stick to just SMS if available.
      } else if (employee.email) {
        await _sendEmail(employee, password, results, isReset);
      } else {
        results.error = 'No contact information (email or phone) available for delivery';
      }
      break;

    default:
      // Fallback to both
      await Promise.all([
        _sendSms(employee, password, results, isReset),
        _sendEmail(employee, password, results, isReset)
      ]);
  }

  return results;
};

module.exports = {
  generatePassword,
  sendCredentials
};
