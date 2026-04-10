const Employee = require('../../employees/model/Employee');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');
const { sendSmsThroughBulkSmsApps } = require('./bulkSms.service');
const { sendEmailViaBrevo } = require('./brevoEmail.service');
const { sendEmailViaNodeMailer } = require('./nodemailerEmail.service');

const IST_TZ = 'Asia/Kolkata';

function getTodayIstDateRange() {
  const now = new Date();
  const ymd = now.toLocaleDateString('en-CA', { timeZone: IST_TZ }); // YYYY-MM-DD
  const start = new Date(`${ymd}T00:00:00+05:30`);
  const end = new Date(`${ymd}T23:59:59.999+05:30`);
  return { ymd, start, end };
}

function getTodayMonthDayIST() {
  const now = new Date();
  const month = Number(now.toLocaleString('en-US', { month: 'numeric', timeZone: IST_TZ })) - 1;
  const day = Number(now.toLocaleString('en-US', { day: 'numeric', timeZone: IST_TZ }));
  return { month, day };
}

function buildBirthdaySms(employeeName) {
  // As requested by user: name is injected in {#var#} position.
  return `Dear ${employeeName} Happy Birthday! May this year bring success, happiness, and good health. Keep learning and growing. Best wishes from Pydah Group.`;
}

function buildBirthdayEmailHtml(employeeName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #f1f5f9;
          color: #0f172a;
          font-family: "Segoe UI", Roboto, Arial, sans-serif;
        }
        .container {
          max-width: 680px;
          margin: 24px auto;
          padding: 0 12px;
        }
        .card {
          background: #ffffff;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 32px rgba(2, 6, 23, 0.12);
        }
        .hero {
          background:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25) 0, transparent 34%),
            radial-gradient(circle at 80% 0%, rgba(255,255,255,0.18) 0, transparent 36%),
            linear-gradient(135deg, #0ea5e9 0%, #2563eb 35%, #7c3aed 100%);
          color: #ffffff;
          padding: 30px 26px 28px;
          position: relative;
        }
        .badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 999px;
          padding: 6px 10px;
          margin-bottom: 14px;
        }
        .hero h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }
        .hero p {
          margin: 10px 0 0;
          font-size: 15px;
          opacity: 0.95;
        }
        .content {
          padding: 26px;
        }
        .lead {
          margin: 0 0 16px;
          font-size: 15px;
          line-height: 1.75;
          color: #0f172a;
        }
        .wish-box {
          margin: 18px 0;
          border: 1px solid #dbeafe;
          background: linear-gradient(180deg, #eff6ff, #ffffff);
          border-radius: 14px;
          padding: 16px 18px;
        }
        .wish-box p {
          margin: 0 0 10px;
          font-size: 15px;
          line-height: 1.7;
          color: #1e293b;
        }
        .wish-box p:last-child {
          margin-bottom: 0;
        }
        .signature {
          margin-top: 20px;
          padding-top: 14px;
          border-top: 1px dashed #cbd5e1;
          font-size: 14px;
          color: #334155;
        }
        .cta-wrap {
          margin-top: 18px;
          text-align: center;
        }
        .cta {
          display: inline-block;
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          color: #ffffff;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          border-radius: 10px;
          padding: 11px 18px;
        }
        .footer {
          margin-top: 14px;
          text-align: center;
          color: #64748b;
          font-size: 12px;
          line-height: 1.6;
        }
        @media (max-width: 640px) {
          .hero { padding: 24px 18px 22px; }
          .hero h1 { font-size: 24px; }
          .content { padding: 18px; }
          .lead, .wish-box p { font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
        <div class="hero">
          <span class="badge">Birthday Greetings</span>
          <h1>Happy Birthday, ${employeeName}!</h1>
          <p>Wishing you a meaningful year ahead filled with growth and joy.</p>
        </div>
        <div class="content">
          <p class="lead">Dear <strong>${employeeName}</strong>,</p>

          <div class="wish-box">
            <p>Happy Birthday! May this year bring success, happiness, and good health.</p>
            <p>Keep learning and growing.</p>
            <p><strong>Best wishes from Pydah Group.</strong></p>
          </div>

          <p class="lead">Your dedication and effort are truly valued. Have a wonderful day and an even better year ahead.</p>

          <div class="cta-wrap">
            <a class="cta" href="${(process.env.FRONTEND_URL || 'https://li-hrms.vercel.app').replace(/\/$/, '')}/dashboard">Open HRMS</a>
          </div>

          <p class="signature">Warm regards,<br><strong>Pydah Group HR Team</strong></p>
        </div>
        </div>
        <div class="footer">Pydah Group • HRMS</div>
      </div>
    </body>
    </html>
  `;
}

async function alreadySentToday(empNo) {
  const { start, end } = getTodayIstDateRange();
  const existing = await EmployeeHistory.findOne({
    emp_no: String(empNo || '').toUpperCase(),
    event: 'birthday_wish_sent',
    timestamp: { $gte: start, $lte: end },
  }).lean();
  return !!existing;
}

async function sendBirthdayWish(employee) {
  const result = { sms: false, email: false, skipped: false, reason: null };

  const name = employee.employee_name || employee.emp_no || 'Employee';
  const empNo = String(employee.emp_no || '').toUpperCase();

  if (!empNo) {
    result.skipped = true;
    result.reason = 'Missing emp_no';
    return result;
  }

  if (await alreadySentToday(empNo)) {
    result.skipped = true;
    result.reason = 'Already sent today';
    return result;
  }

  const smsText = buildBirthdaySms(name);
  const smsTemplateId = process.env.BIRTHDAY_SMS_TEMPLATE_ID || undefined;

  if (employee.phone_number) {
    try {
      const smsResp = await sendSmsThroughBulkSmsApps({
        numbers: [employee.phone_number],
        message: smsText,
        ...(smsTemplateId ? { templateId: smsTemplateId } : {}),
      });
      result.sms = !!smsResp?.success;
    } catch (e) {
      console.error(`[BirthdayWish] SMS failed for ${empNo}:`, e.message);
    }
  }

  if (employee.email) {
    const subject = 'Happy Birthday from Pydah Group';
    const htmlContent = buildBirthdayEmailHtml(name);
    try {
      await sendEmailViaBrevo({ to: employee.email, subject, htmlContent });
      result.email = true;
    } catch (brevoErr) {
      try {
        await sendEmailViaNodeMailer({ to: employee.email, subject, htmlContent });
        result.email = true;
      } catch (mailErr) {
        console.error(`[BirthdayWish] Email failed for ${empNo}:`, mailErr.message);
      }
    }
  }

  if (result.sms || result.email) {
    await EmployeeHistory.create({
      emp_no: empNo,
      event: 'birthday_wish_sent',
      performedBy: null,
      performedByName: 'System (Birthday Cron)',
      performedByRole: 'system',
      details: {
        smsSent: result.sms,
        emailSent: result.email,
        phone: employee.phone_number || null,
        email: employee.email || null,
      },
      comments: 'Birthday greeting sent via automated cron',
    });
  } else {
    result.skipped = true;
    result.reason = 'No valid contact or send failure';
  }

  return result;
}

async function sendBirthdayWishesForToday() {
  const { month, day } = getTodayMonthDayIST();
  const activeFilter = Employee.getCurrentlyActiveFilter();
  const employees = await Employee.find({
    ...activeFilter,
    dob: { $ne: null },
  })
    .select('emp_no employee_name dob phone_number email')
    .lean();

  const todaysEmployees = employees.filter((emp) => {
    const dob = new Date(emp.dob);
    if (Number.isNaN(dob.getTime())) return false;
    return dob.getMonth() === month && dob.getDate() === day;
  });

  let sentCount = 0;
  let skippedCount = 0;
  for (const emp of todaysEmployees) {
    const r = await sendBirthdayWish(emp);
    if (r.skipped) skippedCount += 1;
    if (r.sms || r.email) sentCount += 1;
  }

  return {
    totalBirthdayEmployees: todaysEmployees.length,
    sentCount,
    skippedCount,
  };
}

module.exports = {
  sendBirthdayWishesForToday,
  buildBirthdaySms,
};

