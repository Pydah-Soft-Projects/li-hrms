/**
 * HRMS Native AI — built-in intelligence for this application only.
 * No Ollama, no OpenAI, no external LLM APIs.
 * Uses: intent understanding, conversation memory, entity extraction, and natural language generation from HRMS facts.
 */
const {
  isIdentityQuestion,
  isSmallTalk,
  extractTargetEmpNo,
  extractEmployeeStatusFilter,
  wantsEmployeeCount,
} = require('./intentUtils');

function pickVariant(variants) {
  return variants[Math.floor(Math.random() * variants.length)];
}

function inferTopicFromHistory(history) {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user') continue;
    const c = m.content.toLowerCase();
    if (/\b(active|inactive)\s+employees?\b/.test(c) || (wantsEmployeeCount(c) && /active/.test(c))) {
      return { topic: 'employee_count', filter: 'active' };
    }
    if (wantsEmployeeCount(c)) return { topic: 'employee_count', filter: extractEmployeeStatusFilter(c) || 'all' };
    if (/\bleaves?\b/.test(c) && extractTargetEmpNo(c)) {
      return { topic: 'leaves', empNo: extractTargetEmpNo(c) };
    }
    if (/\bapplication/.test(c)) return { topic: 'applications' };
    if (/\bmy name|who am i/.test(c)) return { topic: 'identity' };
  }
  return null;
}

function resolveQuestion(message, history) {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  const topic = inferTopicFromHistory(history);

  if (isIdentityQuestion(text) || topic?.topic === 'identity') {
    return { type: 'identity' };
  }

  if (isSmallTalk(text) && !topic) {
    return { type: 'small_talk' };
  }

  if (wantsEmployeeCount(text) || topic?.topic === 'employee_count') {
    return {
      type: 'employee_count',
      filter: extractEmployeeStatusFilter(text) || topic?.filter || 'all',
    };
  }

  if (
    extractTargetEmpNo(text) &&
    (/\b(name|who is|profile|employee name)\b/i.test(lower) || /\bemployee\s+number\b/i.test(lower))
  ) {
    return { type: 'employee_lookup', empNo: extractTargetEmpNo(text) };
  }

  if (/\b(application|applications|onboarding|verified|pending)\b/.test(lower) && /\bemployee/.test(lower)) {
    return { type: 'applications' };
  }

  const emp = extractTargetEmpNo(text) || topic?.empNo;
  if (emp && /\bleaves?\b/.test(lower)) {
    return { type: 'leaves_employee', empNo: emp };
  }

  if (topic?.topic === 'leaves' && topic.empNo) {
    return { type: 'leaves_employee', empNo: topic.empNo };
  }

  if (/\b(only|just)\s+active\b/.test(lower) && topic?.topic === 'employee_count') {
    return { type: 'employee_count', filter: 'active' };
  }

  return { type: 'general', raw: text };
}

function composeAnswer({ message, userContext, facts, history = [] }) {
  const name = (userContext?.name || 'there').split(' ')[0];
  const intent = resolveQuestion(message, history);

  if (intent.type === 'identity') {
    const n = facts?.user_profile?.name || userContext?.name || name;
    const role = facts?.user_profile?.role || userContext?.role;
    return pickVariant([
      `You're logged in as ${n}${role ? ` (${role})` : ''}. That's the name HRMS has on your account.`,
      `Your HRMS profile name is ${n}${role ? `, and your role is ${role}` : ''}.`,
    ]);
  }

  if (facts?.employee_profile) {
    const p = facts.employee_profile;
    const active =
      p.is_active === true || p.is_active === 'true'
        ? ' (currently active)'
        : p.is_active === false || p.is_active === 'false'
          ? ' (inactive / separated)'
          : '';
    const extra = [p.department, p.designation].filter(Boolean).join(', ');
    return pickVariant([
      `Employee ${p.emp_no} is ${p.name}${active}.${extra ? ` ${extra}.` : ''}`,
      `The name for employee number ${p.emp_no} is ${p.name}${active}.${extra ? ` They are in ${extra}.` : ''}`,
    ]);
  }

  if (facts?.employee_not_found) {
    const no = facts.employee_not_found;
    return `I couldn't find employee number ${no} in your HRMS access scope, ${name}. Check the number or your permissions.`;
  }

  if (intent.type === 'small_talk' && !facts?.sources?.length) {
    if (/\bhow are you\b/i.test(message)) {
      return `I'm doing well, ${name} — thanks for asking. What would you like to check in HRMS?`;
    }
    return `Hi ${name}! Ask me anything about employees, leaves, attendance, or applications — I'll use your live data.`;
  }

  const parts = [];

  if (facts?.employee_applications) {
    const { total, by_status: bs } = facts.employee_applications;
    const pending = bs?.pending || 0;
    const verified = bs?.verified || 0;
    const approved = bs?.approved || 0;
    const rejected = bs?.rejected || 0;
    parts.push(
      pickVariant([
        `Looking at employee applications in your scope: ${total} in total — ${pending} pending, ${verified} verified, ${approved} approved, and ${rejected} rejected.`,
        `Here's the application breakdown: ${total} records — pending ${pending}, verified ${verified}, approved ${approved}, rejected ${rejected}.`,
      ])
    );
  }

  const ec = facts?.employee_count;
  if (ec && typeof ec.total === 'number') {
    const { total, filter } = ec;
    const effectiveFilter = intent.filter && intent.filter !== 'all' ? intent.filter : filter;
    if (effectiveFilter === 'active') {
      parts.push(
        pickVariant([
          `Right now there are ${total} active employees in your HRMS scope — people currently marked active and not separated.`,
          `You have ${total} active employees on the system under your access.`,
        ])
      );
    } else if (effectiveFilter === 'inactive') {
      parts.push(`There are ${total} inactive employees in your scope.`);
    } else {
      parts.push(`In total, ${total} employees fall under your access scope.`);
    }
  }

  if (facts?.leave_balance && typeof facts.leave_balance === 'object') {
    const entries = Object.entries(facts.leave_balance).filter(([, v]) => v != null && typeof v !== 'object');
    if (entries.length) {
      parts.push(
        `Your leave balance: ${entries.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ')}.`
      );
    }
  }

  if (facts?.leaves_analysis?.length) {
    for (const la of facts.leaves_analysis) {
      const emp = la.employee_searched;
      const st = la.by_status || {};
      const prefix = emp ? `Employee ${emp}` : 'Overall';
      parts.push(
        `${prefix}: ${la.total_records} leave record(s), ${la.total_days} day(s) total — ` +
          `${st.approved || 0} approved, ${st.pending || 0} pending, ${st.rejected || 0} rejected.`
      );
    }
  }

  if (facts?.truncated && !parts.length) {
    return `${name}, that's a large dataset — try narrowing by employee number, month, or department and I'll summarize it clearly.`;
  }

  if (facts?.errors?.length && !parts.length) {
    return `I couldn't fetch all the data for that question, ${name}. Check the employee number or your access permissions.`;
  }

  if (!parts.length) {
    if (facts?.previous_question) {
      return `${name}, I need a bit more detail to answer that in context of your earlier question about "${facts.previous_question.slice(0, 80)}…". Can you specify employee number or month?`;
    }
    return `${name}, I didn't find matching HRMS data for that. Try "how many active employees" or "leaves for employee 2146".`;
  }

  if (parts.length === 1) return parts[0];

  return `${name}, here's what I found:\n\n${parts.join('\n\n')}`;
}

module.exports = {
  composeAnswer,
  resolveQuestion,
  inferTopicFromHistory,
};
