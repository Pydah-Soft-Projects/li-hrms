/**
 * HRMS data → compact facts → LLM or rule-based analysis (no raw dumps).
 */
const {
  isSmallTalk,
  isIdentityQuestion,
  extractEmployeeStatusFilter,
  extractTargetEmpNo,
  wantsEmployeeCount,
} = require('./intentUtils');
const { isLlmEnabled, llmAnalyzeAnswer } = require('./llmService');
const { composeAnswer } = require('./nativeAiEngine');

function useOllama() {
  return process.env.HRMS_AI_USE_OLLAMA === 'true' && isLlmEnabled();
}

function unwrap(row) {
  if (!row?.ok || !row.data) return null;
  const d = row.data;
  if (d._truncated) return { _truncated: true };
  if (typeof d.count === 'number' && Array.isArray(d.data)) return d;
  if (d.data !== undefined && !Array.isArray(d.data)) {
    if (typeof d.count === 'number') return d;
    return d.data;
  }
  return d;
}

function asList(payload) {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  for (const key of ['items', 'records', 'leaves']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function empName(item) {
  return (
    item.employee_name ||
    item.employeeName ||
    item.name ||
    item.employeeId?.employee_name ||
    `Emp ${item.emp_no || '?'}`
  );
}

function itemEmpNo(item) {
  return String(item.emp_no || item.employeeId?.emp_no || '').trim();
}

function buildFacts(fetchedData, message, userContext) {
  const facts = {
    question: message,
    sources: [],
    user_profile: {
      name: userContext?.name,
      role: userContext?.role,
      employeeId: userContext?.employeeId,
    },
  };
  const statusFilter = extractEmployeeStatusFilter(message);
  const targetEmp = extractTargetEmpNo(message);

  for (const row of fetchedData || []) {
    if (!row.ok) {
      facts.errors = facts.errors || [];
      facts.errors.push(row.endpointId);
      continue;
    }
    const eid = row.endpointId || 'unknown';
    facts.sources.push(eid);
    const raw = row.data;
    const payload = unwrap(row);

    if (payload?._truncated) {
      const skipTruncated =
        eid === 'employee_detail' ||
        (['leaves_list', 'leaves_my', 'leaves_pending'].includes(eid) && row.query?.search);
      if (!skipTruncated) facts.truncated = true;
      continue;
    }

    if (eid === 'auth_me' && payload && typeof payload === 'object') {
      const u = payload.user || payload.data || payload;
      facts.user_profile = {
        name: u.name || facts.user_profile.name,
        email: u.email,
        role: u.role || facts.user_profile.role,
        employeeId: u.employeeId || u.emp_no || facts.user_profile.employeeId,
      };
    }

    if (eid === 'employee_detail' && !row.ok) {
      const target = extractTargetEmpNo(message);
      if (target) facts.employee_not_found = target;
    }

    if (eid === 'employee_detail' && payload && typeof payload === 'object' && !payload._truncated) {
      const emp = payload.data || payload.employee || payload;
      if (emp && typeof emp === 'object') {
        const dept = emp.department_id || emp.department;
        const desig = emp.designation_id || emp.designation;
        facts.employee_profile = {
          emp_no: emp.emp_no,
          name: emp.employee_name || emp.name,
          email: emp.email,
          is_active: emp.is_active,
          department:
            typeof dept === 'object' ? dept?.name : dept || emp.department_name,
          designation:
            typeof desig === 'object' ? desig?.name : desig || emp.designation_name,
        };
      }
    }

    if (eid === 'employees_list' && !facts.employee_profile) {
      const items = asList(raw) || asList(payload);
      const target = extractTargetEmpNo(message);
      if (target && items.length) {
        const match =
          items.find((i) => String(itemEmpNo(i)) === String(target)) || items[0];
        if (match) {
          facts.employee_profile = {
            emp_no: itemEmpNo(match) || target,
            name: empName(match),
            department: match.department?.name || match.department_name,
            designation: match.designation?.name || match.designation_name,
            is_active: match.is_active,
          };
        }
      }
    }

    if (eid === 'employees_count') {
      const count = raw?.count ?? payload?.count;
      let filt = statusFilter;
      if (!filt && row.query?.is_active === 'true') filt = 'active';
      if (!filt && row.query?.is_active === 'false') filt = 'inactive';
      facts.employee_count = { total: count, filter: filt || 'all' };
    }

    if (eid === 'employee_applications') {
      const items = asList(raw) || asList(payload);
      const byStatus = {};
      for (const i of items) {
        const s = String(i.status || 'unknown').toLowerCase();
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      facts.employee_applications = {
        total: items.length,
        by_status: byStatus,
      };
    }

    if (['leaves_my', 'leaves_list', 'leaves_pending'].includes(eid)) {
      const items = asList(raw) || asList(payload);
      const total = raw?.count ?? items.length;
      const byStatus = {};
      let totalDays = 0;
      const byType = {};
      for (const i of items) {
        const s = String(i.status || 'unknown').toLowerCase();
        byStatus[s] = (byStatus[s] || 0) + 1;
        totalDays += Number(i.numberOfDays) || 0;
        const t = i.leaveType || i.type || 'other';
        byType[t] = (byType[t] || 0) + 1;
      }
      const empLabel = row.query?.search || targetEmp;
      facts.leaves_analysis = facts.leaves_analysis || [];
      facts.leaves_analysis.push({
        source: eid,
        employee_searched: empLabel || null,
        total_records: total,
        total_days: totalDays,
        by_status: byStatus,
        by_type: byType,
      });
    }

    if (eid === 'dashboard_stats' && /\b(dashboard|overview)\b/i.test(message)) {
      facts.dashboard = {};
      const p = payload && typeof payload === 'object' ? payload : {};
      for (const k of Object.keys(p).slice(0, 12)) {
        const v = p[k];
        if (v != null && typeof v !== 'object') facts.dashboard[k] = v;
      }
    }

    if (eid === 'leave_balance' && payload) {
      facts.leave_balance = payload;
    }
  }
  return facts;
}

function ruleBasedAnswer(message, facts, name) {
  if (isIdentityQuestion(message)) {
    const n = facts.user_profile?.name || name;
    return `Your name in HRMS is ${n}${facts.user_profile?.role ? ` (${facts.user_profile.role})` : ''}.`;
  }

  const parts = [];
  const q = (message || '').trim();

  if (facts.employee_applications) {
    const { total, by_status: bs } = facts.employee_applications;
    const bits = Object.entries(bs || {})
      .map(([s, c]) => `${c} ${s}`)
      .join(', ');
    parts.push(
      `There are ${total} employee applications in your scope` +
        (bits ? `: ${bits}.` : '.')
    );
  }

  const ec = facts.employee_count;
  if (ec && typeof ec.total === 'number') {
    const { total, filter } = ec;
    if (filter === 'active') {
      parts.push(`You have ${total} active employees in your scope right now.`);
    } else if (filter === 'inactive') {
      parts.push(`There are ${total} inactive employees in your scope.`);
    } else {
      parts.push(`In total, ${total} employees are in your access scope.`);
    }
  }

  if (facts.leaves_analysis?.length) {
    for (const la of facts.leaves_analysis) {
      const emp = la.employee_searched ? ` for employee ${la.employee_searched}` : '';
      const st = Object.entries(la.by_status || {})
        .map(([s, c]) => `${c} ${s}`)
        .join(', ');
      parts.push(
        `Leave records${emp}: ${la.total_records} application(s), ${la.total_days} total day(s).` +
          (st ? ` By status: ${st}.` : '')
      );
    }
  }

  if (facts.truncated && !parts.length) {
    return `${name}, the data set is large — try narrowing by employee number, month, or department.`;
  }

  if (facts.errors?.length && !parts.length) {
    return `I couldn't load that data with your current access, ${name}. Try a specific employee number or month.`;
  }

  if (!parts.length) {
    return `I couldn't find a clear answer for that in your HRMS data, ${name}. Try being more specific (e.g. employee number 2146).`;
  }

  return parts.join(' ').trim();
}

async function analyzeAndReply({
  message,
  userContext,
  fetchedData,
  needsClarification,
  history = [],
}) {
  const name = (userContext?.name || 'there').split(' ')[0];
  const text = (message || '').trim();

  if (needsClarification) return needsClarification;

  if (isIdentityQuestion(text)) {
    return `Your name in HRMS is ${userContext?.name || name}${
      userContext?.role ? `, and your role is ${userContext.role}` : ''
    }.`;
  }

  const facts = buildFacts(fetchedData || [], text, userContext);
  if (history.length) {
    facts.conversation_turns = history.length;
    const lastUser = [...history].reverse().find((m) => m.role === 'user' && m.content !== text);
    if (lastUser) facts.previous_question = lastUser.content.slice(0, 300);
  }

  if (useOllama()) {
    const llmReply = await llmAnalyzeAnswer(text, name, facts, history);
    if (llmReply) return llmReply;
  }

  return composeAnswer({
    message: text,
    userContext,
    facts,
    history,
  });
}

module.exports = {
  buildFacts,
  analyzeAndReply,
};
