/**
 * HRMS User Manual — single source for in-app help, assistant navigation, and /user-manual page.
 */
import { MODULE_CATEGORIES } from '@/config/moduleCategories';

export type ManualRole =
  | 'employee'
  | 'manager'
  | 'hod'
  | 'hr'
  | 'sub_admin'
  | 'super_admin';

export type ManualStep = {
  text: string;
  /** UI hint for screenshots / future tours */
  uiHint?: string;
};

export type ManualTopic = {
  id: string;
  title: string;
  category: string;
  moduleCode?: string;
  /** Path relative to workspace or superadmin root (no prefix) */
  path: string;
  roles: ManualRole[] | 'all';
  keywords: string[];
  summary: string;
  steps: ManualStep[];
  tips?: string[];
  relatedTopicIds?: string[];
};

export const MANUAL_CATEGORIES = [
  { id: 'getting-started', name: 'Getting started', icon: '🏠' },
  { id: 'time-attendance', name: 'Time & Attendance', icon: '⏰' },
  { id: 'employee', name: 'Employee & profile', icon: '👤' },
  { id: 'organization', name: 'Organization', icon: '🏢' },
  { id: 'payroll', name: 'Payroll & finance', icon: '💰' },
  { id: 'admin', name: 'Administration', icon: '🛡️' },
] as const;

const CATEGORY_TO_MANUAL: Record<string, string> = {
  MAIN: 'getting-started',
  EMPLOYEE_MANAGEMENT: 'employee',
  TIME_ATTENDANCE: 'time-attendance',
  ORGANIZATION: 'organization',
  ADMINISTRATION: 'admin',
  FINANCE_PAYROLL: 'payroll',
  SETTINGS: 'admin',
};

const EMPLOYEE_SELF_SERVICE_MODULES = new Set([
  'ATTENDANCE',
  'LEAVE_OD',
  'LEAVE_REGISTER',
  'CCL',
  'OT_PERMISSIONS',
  'CONFUSED_SHIFTS',
  'SHIFT_ROSTER',
  'HOLIDAY_CALENDAR',
  'PAYSLIPS',
  'LOANS',
  'PROFILE',
]);

function moduleSlug(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

function buildModuleGuideTopics(existing: ManualTopic[]): ManualTopic[] {
  const covered = new Set(existing.map((t) => t.moduleCode).filter(Boolean));
  const topics: ManualTopic[] = [];

  for (const cat of MODULE_CATEGORIES) {
    const manualCategory = CATEGORY_TO_MANUAL[cat.code] || 'admin';
    for (const mod of cat.modules) {
      if (mod.code === 'DASHBOARD' || covered.has(mod.code)) continue;
      const href = mod.href.startsWith('/') ? mod.href : `/${mod.href}`;
      topics.push({
        id: `mod-${moduleSlug(mod.code)}`,
        title: mod.label,
        category: manualCategory,
        moduleCode: mod.code,
        path: href,
        roles: EMPLOYEE_SELF_SERVICE_MODULES.has(mod.code)
          ? 'all'
          : ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
        keywords: [
          mod.label.toLowerCase(),
          mod.code.toLowerCase().replace(/_/g, ' '),
          cat.name.toLowerCase(),
          href.replace(/^\//, '').replace(/-/g, ' '),
          `how to use ${mod.label.toLowerCase()}`,
          `open ${mod.label.toLowerCase()}`,
        ],
        summary: `${mod.label} is under ${cat.name} in the sidebar.`,
        steps: [
          { text: `In the sidebar, open ${cat.name}.`, uiHint: `Sidebar → ${cat.name}` },
          { text: `Click ${mod.label}.`, uiHint: mod.label },
          { text: 'Use search, filters, or tabs at the top of the page to narrow the list.', uiHint: 'Toolbar / filters' },
          {
            text: 'Use the main action button (Apply, Add, Save, Approve, Export) for create or approval tasks.',
            uiHint: 'Primary action',
          },
        ],
        tips: ['Your role may hide some buttons — contact HR if a module is missing from your menu.'],
      });
    }
  }
  return topics;
}

const CORE_MANUAL_TOPICS: ManualTopic[] = [
  {
    id: 'dashboard-overview',
    title: 'Home dashboard',
    category: 'getting-started',
    moduleCode: 'DASHBOARD',
    path: '/dashboard',
    roles: 'all',
    keywords: ['dashboard', 'home', 'main page', 'welcome'],
    summary: 'Your home screen shows attendance status, leave balance, holidays, and quick links.',
    steps: [
      { text: 'Click Dashboard in the sidebar (or open Home).', uiHint: 'Sidebar → Dashboard' },
      { text: 'Review “Your work status” (clock-in / attendance for today).', uiHint: 'Top attendance card' },
      { text: 'Use Quick Access cards to jump to Leave, Attendance, or Payslips.', uiHint: 'My Portal / Quick Access' },
    ],
    tips: ['Managers and HR see team counts and pending approvals on the same page.'],
  },
  {
    id: 'apply-leave',
    title: 'How to apply for Leave',
    category: 'time-attendance',
    moduleCode: 'LEAVE_OD',
    path: '/leaves',
    roles: 'all',
    keywords: [
      'apply leave',
      'how to apply leave',
      'take leave',
      'request leave',
      'casual leave',
      'earned leave',
      'cl el',
      'leave application',
    ],
    summary: 'Apply casual, earned, or other leave types from the Leave & OD screen.',
    steps: [
      { text: 'Open the sidebar → Time & Attendance → Leave & OD.', uiHint: 'Sidebar' },
      { text: 'Make sure the Leaves tab is selected at the top (not OD).', uiHint: 'Tab: Leaves' },
      { text: 'Click Apply Leave (or + / New application).', uiHint: 'Apply Leave button' },
      { text: 'Choose leave type, from date, to date, and reason.', uiHint: 'Leave form' },
      { text: 'Submit. Track status under Leaves or In progress tabs.', uiHint: 'Status column' },
    ],
    tips: [
      'Dates must follow your leave policy (backdated / advance limits).',
      'Managers see team requests under Pending for approval.',
    ],
    relatedTopicIds: ['view-my-leaves', 'leave-register'],
  },
  {
    id: 'apply-od',
    title: 'How to apply for OD (On Duty)',
    category: 'time-attendance',
    moduleCode: 'LEAVE_OD',
    path: '/leaves',
    roles: 'all',
    keywords: [
      'apply od',
      'on duty',
      'outdoor duty',
      'od application',
      'how to apply od',
      'field duty',
    ],
    summary: 'OD (On Duty) is applied from the same Leave & OD page, on the OD tab.',
    steps: [
      { text: 'Go to sidebar → Time & Attendance → Leave & OD.', uiHint: 'Sidebar' },
      { text: 'Click the OD tab at the top of the page.', uiHint: 'Tab: OD' },
      { text: 'Click Apply OD.', uiHint: 'Apply OD button' },
      { text: 'Enter date, place visited, purpose, and required details.', uiHint: 'OD form' },
      { text: 'For live OD, complete IN at start and OUT at end when prompted.', uiHint: 'OD IN/OUT' },
      { text: 'Submit and monitor approval under OD or In progress.', uiHint: 'List' },
    ],
    tips: ['Some OD types require GPS / photo evidence — allow location when asked.'],
    relatedTopicIds: ['view-my-leaves'],
  },
  {
    id: 'view-my-leaves',
    title: 'Where to see my leaves & OD',
    category: 'time-attendance',
    moduleCode: 'LEAVE_OD',
    path: '/leaves',
    roles: 'all',
    keywords: [
      'where are my leaves',
      'my leave',
      'leave status',
      'see my leave',
      'leave history',
      'my od',
      'pending leave',
    ],
    summary: 'All your leave and OD applications are on the Leave & OD page.',
    steps: [
      { text: 'Open Leave & OD from the sidebar.', uiHint: 'Sidebar' },
      { text: 'Leaves tab — your leave applications and filters.', uiHint: 'Tab: Leaves' },
      { text: 'OD tab — your on-duty applications.', uiHint: 'Tab: OD' },
      { text: 'In progress — items still moving through approval.', uiHint: 'Tab: In progress' },
      { text: 'Pending (managers) — team requests waiting for your action.', uiHint: 'Tab: Pending' },
    ],
    relatedTopicIds: ['apply-leave', 'apply-od', 'leave-register'],
  },
  {
    id: 'leave-register',
    title: 'Leave register (balances & history)',
    category: 'time-attendance',
    moduleCode: 'LEAVE_REGISTER',
    path: '/leave-register',
    roles: 'all',
    keywords: ['leave register', 'leave balance', 'cl balance', 'credited leave'],
    summary: 'View financial-year leave register, credits, and balances by type.',
    steps: [
      { text: 'Sidebar → Time & Attendance → Leave Register.', uiHint: 'Sidebar' },
      { text: 'Select employee (if you are HR/manager) or your record loads automatically.', uiHint: 'Employee filter' },
      { text: 'Review balances, availed days, and register entries.', uiHint: 'Register grid' },
    ],
    relatedTopicIds: ['view-my-leaves'],
  },
  {
    id: 'attendance-view',
    title: 'View my attendance',
    category: 'time-attendance',
    moduleCode: 'ATTENDANCE',
    path: '/attendance',
    roles: 'all',
    keywords: ['attendance', 'punch', 'in time', 'out time', 'present', 'absent', 'time card'],
    summary: 'Check daily punches, shift, and monthly attendance summary.',
    steps: [
      { text: 'Sidebar → Time & Attendance → Attendance.', uiHint: 'Sidebar' },
      { text: 'Use the date range or month filter to find the period you need.', uiHint: 'Filters' },
      { text: 'Open a day row to see in/out times and shift details.', uiHint: 'Detail row' },
    ],
  },
  {
    id: 'apply-ot',
    title: 'How to apply for Overtime (OT)',
    category: 'time-attendance',
    moduleCode: 'OT_PERMISSIONS',
    path: '/ot-permissions',
    roles: 'all',
    keywords: ['apply ot', 'overtime', 'extra hours', 'how to apply overtime'],
    summary: 'OT requests are submitted from OT & Permissions.',
    steps: [
      { text: 'Sidebar → Time & Attendance → OT & Permissions.', uiHint: 'Sidebar' },
      { text: 'Select the OT tab.', uiHint: 'Tab: OT' },
      { text: 'Click Apply OT and fill date, hours, and reason.', uiHint: 'Apply OT' },
      { text: 'Submit and track under OT list or Pending (approvers).', uiHint: 'List' },
    ],
    relatedTopicIds: ['apply-permission'],
  },
  {
    id: 'apply-permission',
    title: 'How to apply for Permission (gate pass)',
    category: 'time-attendance',
    moduleCode: 'OT_PERMISSIONS',
    path: '/ot-permissions',
    roles: 'all',
    keywords: ['permission', 'gate pass', 'outpass', 'short leave', 'apply permission'],
    summary: 'Short permissions / gate passes use the Permissions tab.',
    steps: [
      { text: 'Open OT & Permissions from the sidebar.', uiHint: 'Sidebar' },
      { text: 'Click the Permissions tab.', uiHint: 'Tab: Permissions' },
      { text: 'Click Apply Permission and enter date, time out/in, and reason.', uiHint: 'Form' },
      { text: 'Submit and follow status in the list.', uiHint: 'List' },
    ],
    relatedTopicIds: ['apply-ot'],
  },
  {
    id: 'payslips',
    title: 'View my payslip',
    category: 'payroll',
    moduleCode: 'PAYSLIPS',
    path: '/payslips',
    roles: 'all',
    keywords: ['payslip', 'salary slip', 'pay slip', 'download payslip', 'my salary'],
    summary: 'Download or view monthly payslips after payroll is released.',
    steps: [
      { text: 'Sidebar → Finance & Payroll → Payslips (or Earnings on dashboard).', uiHint: 'Sidebar' },
      { text: 'Choose the month you need.', uiHint: 'Month filter' },
      { text: 'Open or download the payslip PDF.', uiHint: 'Download' },
    ],
    tips: ['If a month is missing, payroll may not be finalized or released yet.'],
  },
  {
    id: 'loans',
    title: 'Loans & salary advance',
    category: 'payroll',
    moduleCode: 'LOANS',
    path: '/loans',
    roles: 'all',
    keywords: ['loan', 'advance', 'salary advance', 'emi'],
    summary: 'Apply and track loans or salary advances.',
    steps: [
      { text: 'Sidebar → Finance & Payroll → Loans & Salary Advance.', uiHint: 'Sidebar' },
      { text: 'View existing loans or click to apply for a new one.', uiHint: 'Apply' },
      { text: 'Fill amount, tenure, and submit for approval.', uiHint: 'Form' },
    ],
  },
  {
    id: 'profile',
    title: 'My profile',
    category: 'employee',
    moduleCode: 'PROFILE',
    path: '/profile',
    roles: 'all',
    keywords: ['profile', 'my details', 'change password', 'personal info'],
    summary: 'Update contact details and view your employment information.',
    steps: [
      { text: 'Sidebar → Employee Management → My Profile.', uiHint: 'Sidebar' },
      { text: 'Review personal, bank, and job information.', uiHint: 'Profile tabs' },
    ],
  },
  {
    id: 'shift-roster',
    title: 'Shift roster',
    category: 'time-attendance',
    moduleCode: 'SHIFT_ROSTER',
    path: '/shift-roster',
    roles: 'all',
    keywords: ['roster', 'shift schedule', 'my shift', 'upcoming shift'],
    summary: 'See assigned shifts for upcoming days.',
    steps: [
      { text: 'Sidebar → Time & Attendance → Shift Roster.', uiHint: 'Sidebar' },
      { text: 'Filter by month or employee as needed.', uiHint: 'Filters' },
    ],
  },
  {
    id: 'holidays',
    title: 'Holiday calendar',
    category: 'time-attendance',
    moduleCode: 'HOLIDAY_CALENDAR',
    path: '/holidays',
    roles: 'all',
    keywords: ['holiday', 'holidays', 'festival', 'public holiday'],
    summary: 'View company holidays applicable to you.',
    steps: [
      { text: 'Sidebar → Time & Attendance → Holiday Calendar.', uiHint: 'Sidebar' },
      { text: 'Browse by year or month.', uiHint: 'Calendar' },
    ],
  },
  {
    id: 'ccl',
    title: 'Compensatory leave (CCL)',
    category: 'time-attendance',
    moduleCode: 'CCL',
    path: '/ccl',
    roles: ['employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['ccl', 'compensatory', 'comp off', 'compensatory off'],
    summary: 'Request or view compensatory off linked to extra work.',
    steps: [
      { text: 'Sidebar → Time & Attendance → CCL (Compensatory).', uiHint: 'Sidebar' },
      { text: 'Apply or view CCL as per your process.', uiHint: 'CCL screen' },
    ],
  },
  {
    id: 'approve-leaves',
    title: 'Approve team leave / OD (managers)',
    category: 'time-attendance',
    moduleCode: 'LEAVE_OD',
    path: '/leaves',
    roles: ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['approve leave', 'pending approval', 'team leave', 'reject leave'],
    summary: 'Managers approve or reject team leave and OD from the Pending tab.',
    steps: [
      { text: 'Open Leave & OD.', uiHint: 'Sidebar' },
      { text: 'Go to the Pending tab.', uiHint: 'Tab: Pending' },
      { text: 'Open a request → Approve or Reject with comments.', uiHint: 'Action buttons' },
    ],
    relatedTopicIds: ['view-my-leaves'],
  },
  {
    id: 'reports',
    title: 'Reports',
    category: 'admin',
    moduleCode: 'REPORTS',
    path: '/reports',
    roles: ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['report', 'export', 'analytics', 'attendance report', 'leave report'],
    summary: 'HR reports for attendance, leave, loans, OD, and payroll (role-based).',
    steps: [
      { text: 'Sidebar → Administration → Reports.', uiHint: 'Sidebar' },
      { text: 'Select a report tab (Attendance, Leave, OD, Loan, Payroll, etc.).', uiHint: 'Report tabs' },
      { text: 'Set department, date range, and employee filters.', uiHint: 'Filters' },
      { text: 'Run the report and use Export / Download if shown.', uiHint: 'Export' },
    ],
  },
  {
    id: 'live-attendance',
    title: 'Live Attendance',
    category: 'admin',
    moduleCode: 'LIVE_ATTENDANCE',
    path: '/live-attendance',
    roles: ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['live attendance', 'who is in', 'present now', 'live punch'],
    summary: 'See who is currently present or on premises in real time.',
    steps: [
      { text: 'Sidebar → Administration → Live Attendance.', uiHint: 'Sidebar' },
      { text: 'Filter by department or shift if needed.', uiHint: 'Filters' },
      { text: 'Review the live list and refresh to update.', uiHint: 'Live grid' },
    ],
  },
  {
    id: 'pay-register',
    title: 'Pay Register',
    category: 'payroll',
    moduleCode: 'PAY_REGISTER',
    path: '/pay-register',
    roles: ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['pay register', 'monthly register', 'salary register'],
    summary: 'Monthly pay register for earnings, deductions, and net pay before payslip release.',
    steps: [
      { text: 'Sidebar → Finance & Payroll → Pay Register.', uiHint: 'Sidebar' },
      { text: 'Select month and department / employee group.', uiHint: 'Month filter' },
      { text: 'Review rows, fix exceptions, and finalize when your process allows.', uiHint: 'Register grid' },
    ],
  },
  {
    id: 'resignations',
    title: 'Resignations',
    category: 'employee',
    moduleCode: 'RESIGNATION',
    path: '/resignations',
    roles: ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'],
    keywords: ['resign', 'resignation', 'exit', 'relieving'],
    summary: 'Submit or process resignation and relieving workflow.',
    steps: [
      { text: 'Sidebar → Employee Management → Resignations.', uiHint: 'Sidebar' },
      { text: 'Apply resignation or open a pending request (HR/manager).', uiHint: 'Apply / list' },
      { text: 'Complete dates, reason, and approval steps.', uiHint: 'Form' },
    ],
  },
];

export const HRMS_USER_MANUAL_TOPICS: ManualTopic[] = [
  ...CORE_MANUAL_TOPICS,
  ...buildModuleGuideTopics(CORE_MANUAL_TOPICS),
];

export function manualPathPrefix(pathname: string | null): '' | '/superadmin' {
  if (pathname?.startsWith('/superadmin')) return '/superadmin';
  return '';
}

export function resolveManualHref(topic: ManualTopic, pathname: string | null): string {
  const prefix = manualPathPrefix(pathname);
  return `${prefix}${topic.path}`;
}

export function topicAllowedForRole(topic: ManualTopic, role: string): boolean {
  if (topic.roles === 'all') return true;
  return topic.roles.includes(role as ManualRole);
}

export function findManualTopics(query: string, role: string): ManualTopic[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return HRMS_USER_MANUAL_TOPICS.filter((t) => topicAllowedForRole(t, role));

  const scored = HRMS_USER_MANUAL_TOPICS.filter((t) => topicAllowedForRole(t, role)).map((t) => {
    let score = 0;
    if (q.includes(t.id.replace(/-/g, ' '))) score += 10;
    for (const kw of t.keywords) {
      if (q.includes(kw.toLowerCase())) score += 8;
      if (kw.toLowerCase().includes(q)) score += 4;
    }
    if (q.includes(t.title.toLowerCase())) score += 6;
    for (const word of q.split(/\s+/)) {
      if (word.length < 3) continue;
      if (t.summary.toLowerCase().includes(word)) score += 1;
    }
    return { topic: t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.topic);
}

export function getManualTopicById(id: string): ManualTopic | undefined {
  return HRMS_USER_MANUAL_TOPICS.find((t) => t.id === id);
}

/** Detect “how do I…” navigation-style questions */
export function isNavigationQuestion(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (
    /\b(how to|how do i|how can i|where is|where are|where can i|where do i|steps to|guide to|help me apply|help me find|navigate|take me to|open)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(apply|find|see|view|check)\b/.test(t) && /\b(leave|od|attendance|payslip|loan|permission|ot)\b/.test(t)) {
    return true;
  }
  return false;
}

export function pickNavigationTopic(text: string, role: string): ManualTopic | null {
  const matches = findManualTopics(text, role);
  if (matches.length) return matches[0];
  if (isNavigationQuestion(text)) {
    if (/\b(leave|od|on duty)\b/.test(text.toLowerCase())) {
      return getManualTopicById('view-my-leaves') || getManualTopicById('apply-leave');
    }
    return getManualTopicById('dashboard-overview') || null;
  }
  return null;
}

export function formatNavigationAnswer(topic: ManualTopic, href: string, userName?: string): string {
  const name = userName?.split(' ')[0] || 'there';
  const steps = topic.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  const tips = topic.tips?.length ? `\n\nTips:\n${topic.tips.map((t) => `• ${t}`).join('\n')}` : '';
  return (
    `${name}, here's how to **${topic.title}**:\n\n` +
    `${topic.summary}\n\n` +
    `**In the app:**\n${steps}\n\n` +
    `Open: ${href}` +
    tips +
    `\n\nFor the full guide with every module, open **User Manual** from your dashboard.`
  ).replace(/\*\*/g, '');
}
