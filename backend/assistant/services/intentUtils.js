const GREETING_RE = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|namaste)\b/i;
const THANKS_RE = /\b(thanks|thank you|thx|thank u)\b/i;
const SMALL_TALK_RE =
  /\b(how are you|how'?s it going|what'?s up|how do you do|how have you been|how r u|are you (ok|okay|fine)|nice to (meet|chat with) you|good to (see|talk to) you)\b/i;
const HELP_RE = /\b(what can you do|what do you do|how can you help|help me with)\b/i;
const BYE_RE = /\b(bye|goodbye|see you|take care|gtg)\b/i;

function isSmallTalk(text) {
  const t = (text || '').trim();
  if (!t || t.length > 120) return false;
  if (GREETING_RE.test(t) || THANKS_RE.test(t) || BYE_RE.test(t)) return true;
  if (SMALL_TALK_RE.test(t) && !/\b(employee|leave|attendance|payroll|loan)\b/i.test(t)) return true;
  if (HELP_RE.test(t)) return true;
  return false;
}

function isGreetingOnly(text) {
  const t = (text || '').trim();
  return GREETING_RE.test(t) && t.split(/\s+/).length <= 6;
}

/** @returns {'active'|'inactive'|'all'|null} */
function extractEmployeeStatusFilter(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(inactive|resigned|left employees|terminated|ex[- ]?employees?)\b/.test(lower)) {
    return 'inactive';
  }
  if (
    /\b(active|actively|currently\s+working|working\s+now|active\s+only|only\s+active)\b/.test(lower) ||
    /\bactive\s+employees?\b/.test(lower)
  ) {
    return 'active';
  }
  if (/\b(all employees|total employees|entire workforce|every employee)\b/.test(lower)) {
    return 'all';
  }
  return null;
}

function employeeCountQuery(statusFilter) {
  if (statusFilter === 'active') return { is_active: 'true' };
  if (statusFilter === 'inactive') return { is_active: 'false' };
  return {};
}

function wantsEmployeeCount(text) {
  const lower = (text || '').toLowerCase();
  return (
    /\b(how many|number of|count of|total)\b/.test(lower) &&
    /\b(employees?|staff|workforce|people)\b/.test(lower)
  );
}

function isIdentityQuestion(text) {
  const t = (text || '').trim().toLowerCase();
  return (
    /\b(what is|what's|whats)\s+my\s+name\b/.test(t) ||
    /\bwho am i\b/.test(t) ||
    /\bmy name\b/.test(t) && /\b(what|tell|know)\b/.test(t)
  );
}

function extractAllEmpNos(text) {
  const t = text || '';
  const found = [...t.matchAll(/\b(\d{3,8})\b/g)].map((m) => m[1]);
  return [...new Set(found)];
}

function extractTargetEmpNo(text, fallbackEmpNo) {
  const all = extractAllEmpNos(text);
  if (all.length) return all[0];
  return fallbackEmpNo || null;
}

function isLeaveCountQuestion(text) {
  const lower = (text || '').toLowerCase();
  return (
    /\b(leaves?|leave\s+count|leave\s+days?)\b/.test(lower) &&
    /\b(count|how many|number of|total)\b/.test(lower) &&
    extractAllEmpNos(text).length > 0
  );
}

/** Lookup one employee by number (name, profile, who is, etc.) */
function isEmployeeLookupQuestion(text) {
  const t = (text || '').trim();
  const lower = t.toLowerCase();
  const empNo = extractTargetEmpNo(t);
  if (!empNo) return false;
  if (/\b(leave|leaves|attendance|payslip|payroll|salary|loan|overtime|permission)\b/i.test(lower)) {
    return false;
  }
  return (
    /\b(name|who\s+is|who's|profile|details?|information|info|tell\s+me|lookup|find|designation|department|division)\b/i.test(lower) ||
    /\bemployee\s+name\b/i.test(lower) ||
    /\bwhat\s+is\s+the\s+(name|designation|department)\b/i.test(lower) ||
    /\bwhich\s+employee\b/i.test(lower)
  );
}

function matchesTopic(text, words) {
  const t = (text || '').toLowerCase();
  return words.some((w) => t.includes(w));
}

function extractEmpNoFromText(text) {
  return extractTargetEmpNo(text) || null;
}

function isEmployeeApplicationsQuestion(text) {
  const lower = (text || '').toLowerCase();
  return (
    /\b(application|applications|onboarding)\b/.test(lower) &&
    /\b(employee|hire|joining)\b/.test(lower)
  );
}

function isLeaveQuestionForEmployee(text) {
  const lower = (text || '').toLowerCase();
  return (
    /\b(leave|leaves)\b/.test(lower) &&
    (extractTargetEmpNo(text) || /\bemployee\s+(number|no)/i.test(text))
  );
}

module.exports = {
  GREETING_RE,
  THANKS_RE,
  SMALL_TALK_RE,
  HELP_RE,
  BYE_RE,
  isSmallTalk,
  isGreetingOnly,
  extractEmployeeStatusFilter,
  employeeCountQuery,
  wantsEmployeeCount,
  isIdentityQuestion,
  extractTargetEmpNo,
  extractAllEmpNos,
  isLeaveCountQuestion,
  extractEmpNoFromText,
  isEmployeeLookupQuestion,
  matchesTopic,
  isEmployeeApplicationsQuestion,
  isLeaveQuestionForEmployee,
};
