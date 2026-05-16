const { getCatalogForRole } = require('./endpointCatalog');
const { buildUserContext } = require('./userContext');
const {
  THANKS_RE,
  BYE_RE,
  HELP_RE,
  isSmallTalk,
  isGreetingOnly,
  extractEmployeeStatusFilter,
  employeeCountQuery,
  wantsEmployeeCount,
  isIdentityQuestion,
  extractTargetEmpNo,
  isEmployeeApplicationsQuestion,
  isLeaveQuestionForEmployee,
  isEmployeeLookupQuestion,
  extractEmpNoFromText,
  extractAllEmpNos,
  isLeaveCountQuestion,
  matchesTopic,
} = require('./intentUtils');
const { analyzeAndReply } = require('./dataAnalyst');
const { isLlmEnabled, llmPlanRoutes } = require('./llmService');
const { enrichMessageFromHistory } = require('./conversationContext');
const {
  isNavigationQuestion,
  findTopic,
  formatNavigationReply,
} = require('./navigationGuide');

function currentYear() {
  return String(new Date().getFullYear());
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function extractMonth(text) {
  const ym = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (ym) return `${ym[1]}-${ym[2]}`;
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const lower = text.toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) {
      const yearMatch = text.match(/\b(20\d{2})\b/);
      const year = yearMatch ? yearMatch[1] : currentYear();
      return `${year}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  return currentMonth();
}

function extractEmpNo(text, ctx) {
  const m = text.match(/\b(emp[-\s]?)?(\d{3,8})\b/i);
  if (m) return m[2];
  return ctx.employeeId;
}

function matches(text, words) {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

function canUse(catalog, id) {
  return catalog.some((e) => e.id === id);
}

/**
 * Built-in intent router — maps natural language to HRMS endpoint calls.
 */
async function planDataFetch({ message, reqUser, history = [] }) {
  const ctx = buildUserContext(reqUser);
  const catalog = getCatalogForRole(ctx.role);
  const rawText = (message || '').trim();
  const text = enrichMessageFromHistory(rawText, history);
  const lower = text.toLowerCase();
  const rawLower = rawText.toLowerCase();
  const endpoints = [];
  let needsClarification = null;

  if (isSmallTalk(text)) {
    return { userContext: ctx, needsClarification: null, endpoints: [], reasoning: 'small-talk' };
  }

  if (isIdentityQuestion(text)) {
    return { userContext: ctx, needsClarification: null, endpoints: [], reasoning: 'identity' };
  }

  if (isNavigationQuestion(rawText)) {
    const navTopic = findTopic(rawText, ctx.role);
    if (navTopic) {
      return {
        userContext: ctx,
        needsClarification: null,
        endpoints: [],
        reasoning: 'navigation-guide',
        navigationTopic: navTopic,
      };
    }
  }

  const lookupEmpNo = extractTargetEmpNo(rawText) || extractEmpNoFromText(rawText);
  if (isEmployeeLookupQuestion(rawText) && lookupEmpNo) {
    if (canUse(catalog, 'employee_detail')) {
      return {
        userContext: ctx,
        needsClarification: null,
        endpoints: [
          {
            endpointId: 'employee_detail',
            pathParams: { empNo: lookupEmpNo },
            reason: `employee profile ${lookupEmpNo}`,
          },
        ],
        reasoning: 'employee-lookup',
      };
    }
    if (canUse(catalog, 'employees_list')) {
      return {
        userContext: ctx,
        needsClarification: null,
        endpoints: [
          {
            endpointId: 'employees_list',
            query: { search: lookupEmpNo, limit: '5' },
            reason: `employee search ${lookupEmpNo}`,
          },
        ],
        reasoning: 'employee-lookup-search',
      };
    }
  }

  if (isLlmEnabled()) {
    try {
      const llmPlan = await llmPlanRoutes(text, ctx, catalog, history);
      if (llmPlan && Array.isArray(llmPlan.endpoints)) {
        return {
          userContext: ctx,
          needsClarification: llmPlan.needsClarification || null,
          endpoints: llmPlan.endpoints.slice(0, 5),
          reasoning: 'llm-router',
        };
      }
    } catch (err) {
      console.warn('[Assistant] LLM router fallback:', err.message);
    }
  }

  const month = extractMonth(rawText);
  const empNo = extractTargetEmpNo(rawText, ctx.employeeId) || extractEmpNo(rawText, ctx);
  const isSelf =
    /\b(my|mine|me|i)\b/i.test(rawText) || !/\b(employee|staff|team)\b/i.test(rawText);

  if (matches(lower, ['dashboard', 'summary', 'overview', 'stats'])) {
    if (canUse(catalog, 'dashboard_stats')) {
      endpoints.push({ endpointId: 'dashboard_stats', reason: 'dashboard overview' });
    }
  }

  if (matches(lower, ['notification', 'alert', 'unread'])) {
    if (matches(lower, ['unread', 'count'])) {
      if (canUse(catalog, 'notifications_unread')) {
        endpoints.push({ endpointId: 'notifications_unread', reason: 'unread count' });
      }
    } else if (canUse(catalog, 'notifications')) {
      endpoints.push({ endpointId: 'notifications', query: { unreadOnly: 'true' }, reason: 'notifications' });
    }
  }

  if (isEmployeeApplicationsQuestion(text) && canUse(catalog, 'employee_applications')) {
    endpoints.push({ endpointId: 'employee_applications', query: { limit: '500' }, reason: 'application status breakdown' });
  }

  const empNosInQuestion = extractAllEmpNos(rawText);
  if (isLeaveCountQuestion(rawText) && canUse(catalog, 'leaves_list')) {
    for (const emp of empNosInQuestion.slice(0, 5)) {
      endpoints.push({
        endpointId: 'leaves_list',
        query: { search: emp, limit: '100' },
        reason: `leave count for employee ${emp}`,
      });
    }
  } else if (matchesTopic(rawText, ['leave', 'cl', 'el', 'casual', 'earned', 'time off', 'vacation'])) {
    const targetEmp = extractTargetEmpNo(text);
    if (targetEmp && isLeaveQuestionForEmployee(text) && canUse(catalog, 'leaves_list')) {
      endpoints.push({
        endpointId: 'leaves_list',
        query: { search: targetEmp, limit: '100' },
        reason: `leaves for employee ${targetEmp}`,
      });
    } else if (matches(lower, ['pending', 'approval', 'approve'])) {
      if (canUse(catalog, 'leaves_pending')) {
        endpoints.push({ endpointId: 'leaves_pending', reason: 'pending leave approvals' });
      }
    } else if (matches(lower, ['balance', 'remaining', 'left', 'available'])) {
      const eid = empNo || ctx.employeeId;
      if (eid && canUse(catalog, 'leave_balance')) {
        endpoints.push({
          endpointId: 'leave_balance',
          pathParams: { employeeId: eid },
          reason: 'leave balance',
        });
      } else if (isSelf && canUse(catalog, 'leaves_my')) {
        endpoints.push({ endpointId: 'leaves_my', query: { year: currentYear() }, reason: 'my leaves' });
      }
    } else if (matches(lower, ['register', 'history', 'taken'])) {
      const eid = empNo || ctx.employeeId;
      if (eid && canUse(catalog, 'leave_register')) {
        endpoints.push({
          endpointId: 'leave_register',
          pathParams: { employeeId: eid },
          query: { year: currentYear() },
          reason: 'leave register',
        });
      }
    } else if (isSelf && canUse(catalog, 'leaves_my')) {
      endpoints.push({ endpointId: 'leaves_my', query: { year: currentYear() }, reason: 'my leaves' });
    } else if (canUse(catalog, 'leaves_list')) {
      endpoints.push({ endpointId: 'leaves_list', query: { year: currentYear() }, reason: 'leave list' });
    }
    if (
      canUse(catalog, 'leaves_stats') &&
      matches(lower, ['stat', 'report', 'count']) &&
      empNosInQuestion.length === 0
    ) {
      endpoints.push({ endpointId: 'leaves_stats', query: { year: currentYear() }, reason: 'leave stats' });
    }
  }

  if (matchesTopic(rawText, ['attendance', 'present', 'absent', 'punch', 'check in', 'check-in'])) {
    const eid = empNo || ctx.employeeId;
    if (matches(lower, ['month', 'monthly', 'summary'])) {
      if (eid && canUse(catalog, 'attendance_monthly_summary')) {
        endpoints.push({
          endpointId: 'attendance_monthly_summary',
          pathParams: { employeeId: eid },
          query: { month },
          reason: 'monthly attendance summary',
        });
      } else if (canUse(catalog, 'attendance_monthly')) {
        endpoints.push({
          endpointId: 'attendance_monthly',
          query: { month, ...(eid ? { empNo: eid } : {}) },
          reason: 'monthly attendance',
        });
      }
    } else if (canUse(catalog, 'attendance_list')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 14);
      endpoints.push({
        endpointId: 'attendance_list',
        query: {
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          ...(eid ? { employeeNumber: eid } : {}),
        },
        reason: 'recent attendance',
      });
    }
  }

  if (matchesTopic(rawText, ['payslip', 'salary', 'payroll', 'wage', 'pay slip'])) {
    const eid = empNo || ctx.employeeId;
    if (eid && canUse(catalog, 'payroll_payslip')) {
      endpoints.push({
        endpointId: 'payroll_payslip',
        pathParams: { employeeId: eid, month },
        reason: 'payslip',
      });
    } else if (canUse(catalog, 'payroll_list')) {
      endpoints.push({ endpointId: 'payroll_list', query: { month }, reason: 'payroll records' });
    } else {
      needsClarification =
        'Which month should I check for your payslip? For example, say "March 2026" or "2026-03".';
    }
  }

  if (matchesTopic(rawText, ['loan', 'advance', 'emi'])) {
    if (matches(lower, ['pending', 'approval'])) {
      if (canUse(catalog, 'loans_pending')) {
        endpoints.push({ endpointId: 'loans_pending', reason: 'pending loans' });
      }
    } else if (isSelf && canUse(catalog, 'loans_my')) {
      endpoints.push({ endpointId: 'loans_my', reason: 'my loans' });
    } else if (canUse(catalog, 'loans_list')) {
      endpoints.push({ endpointId: 'loans_list', reason: 'loans list' });
    }
  }

  if (matchesTopic(rawText, ['overtime', ' ot ', 'ot ']) || /\bot\b/.test(rawLower)) {
    if (matches(lower, ['pending', 'approval'])) {
      if (canUse(catalog, 'ot_pending')) {
        endpoints.push({ endpointId: 'ot_pending', reason: 'pending OT' });
      }
    } else if (canUse(catalog, 'ot_list')) {
      endpoints.push({ endpointId: 'ot_list', reason: 'OT list' });
    }
  }

  if (matchesTopic(rawText, ['permission', 'gate pass', 'outpass', 'out pass'])) {
    if (matches(lower, ['pending', 'approval'])) {
      if (canUse(catalog, 'permissions_pending')) {
        endpoints.push({ endpointId: 'permissions_pending', reason: 'pending permissions' });
      }
    } else if (canUse(catalog, 'permissions_list')) {
      endpoints.push({ endpointId: 'permissions_list', reason: 'permissions' });
    }
  }

  if (matches(lower, ['holiday', 'holidays'])) {
    if (canUse(catalog, 'holidays_my')) {
      endpoints.push({ endpointId: 'holidays_my', query: { year: currentYear() }, reason: 'holidays' });
    }
  }

  if (matches(lower, ['employee', 'staff', 'colleague', 'who works', 'workforce'])) {
    const statusFilter = extractEmployeeStatusFilter(lower);
    const countQuery = employeeCountQuery(statusFilter);

    if (wantsEmployeeCount(text) || matches(lower, ['only active', 'active only', 'not all'])) {
      if (canUse(catalog, 'employees_count')) {
        endpoints.push({
          endpointId: 'employees_count',
          query: countQuery,
          reason: statusFilter ? `${statusFilter} employee count` : 'employee count',
        });
      }
    } else if (empNo && canUse(catalog, 'employee_detail')) {
      endpoints.push({
        endpointId: 'employee_detail',
        pathParams: { empNo },
        reason: 'employee profile',
      });
    } else if (canUse(catalog, 'employees_list')) {
      const search =
        extractEmpNoFromText(text) ||
        text.match(/named?\s+([a-z\s]+)/i)?.[1]?.trim();
      endpoints.push({
        endpointId: 'employees_list',
        query: {
          ...(search ? { search: String(search) } : {}),
          limit: '10',
          ...countQuery,
        },
        reason: 'employee search',
      });
    }
  }

  if (matches(lower, ['policy', 'leave policy', 'rules'])) {
    if (canUse(catalog, 'settings_leave_policy')) {
      endpoints.push({ endpointId: 'settings_leave_policy', reason: 'leave policy' });
    }
  }

  if (endpoints.length === 0 && !needsClarification) {
    if (endpoints.length === 0) {
      needsClarification =
        'I can help with leaves, attendance, payslips, loans, OT, and permissions. What would you like to know?';
    }
  }

  const unique = [];
  const seen = new Set();
  for (const ep of endpoints) {
    if (!seen.has(ep.endpointId)) {
      seen.add(ep.endpointId);
      unique.push(ep);
    }
  }

  return {
    userContext: ctx,
    needsClarification,
    endpoints: unique.slice(0, 5),
    reasoning: 'builtin-intent-router',
  };
}

function conversationalReply(message, name) {
  const text = (message || '').trim();
  if (isGreetingOnly(text)) {
    return `Hey ${name}! Good to see you. Ask me about leaves, attendance, payslips, loans, or employee counts — I’ll use your live HRMS data.`;
  }
  if (THANKS_RE.test(text)) {
    return `You’re welcome, ${name}! Happy to help anytime.`;
  }
  if (BYE_RE.test(text)) {
    return `Take care, ${name}! I’ll be here when you need HR info.`;
  }
  if (HELP_RE.test(text)) {
    return (
      `I pull live HRMS data, analyze it, and explain the answer clearly — leaves, attendance, payslips, ` +
      `approvals, or “how many active employees”, ${name}.`
    );
  }
  if (/\bhow are you\b/i.test(text) || /\bhow'?s it going\b/i.test(text)) {
    return `I’m doing well, thanks for asking, ${name}! I’m here to help with your HRMS questions whenever you need.`;
  }
  if (/\bwhat'?s up\b/i.test(text)) {
    return `All good on my side, ${name}! What would you like to check in HRMS today?`;
  }
  return `Hi ${name}! How can I help you with HR today?`;
}

async function generateAnswer({
  message,
  userContext,
  fetchedData,
  needsClarification,
  history = [],
  navigationTopic,
}) {
  const name = userContext?.name?.split(' ')[0] || 'there';
  const text = (message || '').trim();

  if (navigationTopic) {
    return {
      reply: formatNavigationReply(navigationTopic, name),
      answerEngine: 'navigation-guide',
      navigationTopicId: navigationTopic.id,
      navigationPath: navigationTopic.path,
    };
  }

  if (isSmallTalk(text) && (!fetchedData || fetchedData.length === 0)) {
    return {
      reply: conversationalReply(text, name),
      answerEngine: 'hrms-native',
    };
  }

  const reply = await analyzeAndReply({
    message: text,
    userContext,
    fetchedData: fetchedData || [],
    needsClarification,
    history,
  });
  return { reply, answerEngine: 'hrms-native' };
}

async function* generateAnswerStream(opts) {
  const result = await generateAnswer(opts);
  if (typeof result === 'object' && result?.answerEngine) {
    yield {
      answerEngine: result.answerEngine,
      navigationTopicId: result.navigationTopicId || null,
      navigationPath: result.navigationPath || null,
    };
  }
  const full = typeof result === 'string' ? result : result.reply;
  const words = full.split(/(\s+)/);
  for (const w of words) {
    yield w;
    await new Promise((r) => setTimeout(r, 12));
  }
}

module.exports = {
  planDataFetch,
  generateAnswer,
  generateAnswerStream,
};
