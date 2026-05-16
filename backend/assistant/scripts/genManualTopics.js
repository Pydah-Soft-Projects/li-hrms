/**
 * Generates data/userManualTopics.js from frontend manual topics (compact nav format).
 * Run: node backend/assistant/scripts/genManualTopics.js
 */
const fs = require('fs');
const path = require('path');

const moduleCategoriesPath = path.join(
  __dirname,
  '../../../frontend/src/config/moduleCategories.ts'
);
const src = fs.readFileSync(moduleCategoriesPath, 'utf8');

const categories = [];
let cat = null;
for (const line of src.split('\n')) {
  const catStart = line.match(/^\s*\{\s*$/);
  const codeMatch = line.match(/code: '([^']+)'/);
  const nameMatch = line.match(/name: '([^']+)'/);
  const modMatch = line.match(/\{\s*code: '([^']+)',\s*label: '([^']+)',\s*href: '([^']+)'/);
  if (line.includes('code:') && line.includes('name:') && line.includes('icon:')) {
    /* category header line */
  }
  if (line.match(/code: '([A-Z_]+)',\s*$/)) {
    const m = line.match(/code: '([^']+)'/);
    if (m && !line.includes('modules')) {
      if (cat) categories.push(cat);
      cat = { code: m[1], name: '', modules: [] };
    }
  }
  if (cat && nameMatch && line.includes('name:')) {
    cat.name = nameMatch[1];
  }
  if (modMatch) {
    cat.modules.push({ code: modMatch[1], label: modMatch[2], href: modMatch[3] });
  }
}
if (cat) categories.push(cat);

const CORE = [
  {
    id: 'apply-leave',
    title: 'How to apply for Leave',
    path: '/leaves',
    roles: 'all',
    keywords: ['apply leave', 'how to apply leave', 'take leave', 'request leave', 'leave application'],
    summary: 'Apply leave from Time & Attendance → Leave & OD, Leaves tab.',
    steps: [
      'Open sidebar → Time & Attendance → Leave & OD.',
      'Select the Leaves tab at the top.',
      'Click Apply Leave.',
      'Choose type, dates, reason, and submit.',
      'Track status under Leaves or In progress.',
    ],
  },
  {
    id: 'apply-od',
    title: 'How to apply for OD (On Duty)',
    path: '/leaves',
    roles: 'all',
    keywords: ['apply od', 'on duty', 'od application', 'how to apply od', 'outdoor duty'],
    summary: 'OD is on the same page as leave, under the OD tab.',
    steps: [
      'Go to Time & Attendance → Leave & OD.',
      'Click the OD tab.',
      'Click Apply OD and fill date, place, and purpose.',
      'Complete OD IN/OUT when required, then submit.',
    ],
  },
  {
    id: 'view-my-leaves',
    title: 'Where to see my leaves & OD',
    path: '/leaves',
    roles: 'all',
    keywords: ['where are my leaves', 'my leave', 'leave status', 'see my leave', 'my od', 'where is my leave'],
    summary: 'All applications are on Leave & OD.',
    steps: [
      'Open Leave & OD from the sidebar.',
      'Leaves tab — your leave list.',
      'OD tab — your on-duty list.',
      'In progress — items in approval workflow.',
    ],
  },
  {
    id: 'leave-register',
    title: 'Leave register (balances)',
    path: '/leave-register',
    roles: 'all',
    keywords: ['leave register', 'leave balance'],
    summary: 'View FY register and balances.',
    steps: ['Sidebar → Leave Register.', 'Select employee if needed.', 'Review balances and history.'],
  },
  {
    id: 'attendance-view',
    title: 'View my attendance',
    path: '/attendance',
    roles: 'all',
    keywords: ['attendance', 'punch', 'time card', 'in time', 'how to check attendance'],
    summary: 'Daily and monthly attendance on the Attendance page.',
    steps: ['Sidebar → Attendance.', 'Pick date range or month.', 'Open a day for in/out details.'],
  },
  {
    id: 'apply-ot',
    title: 'How to apply for OT',
    path: '/ot-permissions',
    roles: 'all',
    keywords: ['apply ot', 'overtime', 'how to apply overtime'],
    summary: 'OT from OT & Permissions.',
    steps: ['Open OT & Permissions.', 'OT tab → Apply OT.', 'Fill details and submit.'],
  },
  {
    id: 'apply-permission',
    title: 'How to apply for Permission',
    path: '/ot-permissions',
    roles: 'all',
    keywords: ['permission', 'gate pass', 'apply permission', 'how to apply permission'],
    summary: 'Gate pass on Permissions tab.',
    steps: ['OT & Permissions → Permissions tab.', 'Apply Permission.', 'Submit and track status.'],
  },
  {
    id: 'payslips',
    title: 'View my payslip',
    path: '/payslips',
    roles: 'all',
    keywords: ['payslip', 'salary slip', 'my salary', 'download payslip'],
    summary: 'Payslips under Finance & Payroll.',
    steps: ['Sidebar → Payslips.', 'Select month.', 'View or download PDF.'],
  },
  {
    id: 'profile',
    title: 'My profile',
    path: '/profile',
    roles: 'all',
    keywords: ['profile', 'my details', 'my profile'],
    summary: 'Personal and job details on My Profile.',
    steps: ['Sidebar → My Profile.', 'Review and update allowed fields.'],
  },
  {
    id: 'dashboard-overview',
    title: 'Home dashboard',
    path: '/dashboard',
    roles: 'all',
    keywords: ['dashboard', 'home', 'main page'],
    summary: 'Home screen with quick links and status.',
    steps: ['Open Dashboard from sidebar.', 'Use Quick Access cards.', 'Check notifications.'],
  },
];

const covered = new Set(CORE.map((t) => t.id));
const moduleTopics = [];
for (const c of categories) {
  for (const mod of c.modules || []) {
    if (mod.code === 'DASHBOARD') continue;
    const id = `mod-${mod.code.toLowerCase().replace(/_/g, '-')}`;
    if (covered.has(id)) continue;
    moduleTopics.push({
      id,
      title: mod.label,
      path: mod.href,
      roles: 'all',
      keywords: [
        mod.label.toLowerCase(),
        mod.code.toLowerCase().replace(/_/g, ' '),
        c.name.toLowerCase(),
        mod.href.replace(/^\//, '').replace(/-/g, ' '),
      ],
      summary: `${mod.label} under ${c.name}.`,
      steps: [
        `Sidebar → ${c.name} → ${mod.label}.`,
        'Use filters or search on the page.',
        'Use the main action button for Apply / Add / Approve.',
      ],
    });
  }
}

const all = [...CORE, ...moduleTopics];
const out = `/**\n * Navigation / user-manual topics (generated — run genManualTopics.js after module changes)\n */\nmodule.exports = ${JSON.stringify(all, null, 2)};\n`;
const outPath = path.join(__dirname, '../data/userManualTopics.js');
fs.writeFileSync(outPath, out);
console.log('Wrote', all.length, 'topics to', outPath);
