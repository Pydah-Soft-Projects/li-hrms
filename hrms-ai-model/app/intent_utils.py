import re

GREETING_RE = re.compile(r"^(hi|hello|hey|good\s+(morning|afternoon|evening)|namaste)\b", re.I)
THANKS_RE = re.compile(r"\b(thanks|thank you|thx)\b", re.I)
SMALL_TALK_RE = re.compile(
    r"\b(how are you|how'?s it going|what'?s up|how do you do|how have you been|"
    r"are you (ok|okay|fine)|nice to (meet|chat with) you|good to (see|talk to) you)\b",
    re.I,
)
HELP_RE = re.compile(r"\b(what can you do|what do you do|how can you help|help me with)\b", re.I)
BYE_RE = re.compile(r"\b(bye|goodbye|see you|take care)\b", re.I)


def is_small_talk(text: str) -> bool:
    t = (text or "").strip()
    if not t or len(t) > 120:
        return False
    if GREETING_RE.search(t) or THANKS_RE.search(t) or BYE_RE.search(t):
        return True
    if SMALL_TALK_RE.search(t) and not re.search(r"\b(employee|leave|attendance|payroll|loan)\b", t, re.I):
        return True
    if HELP_RE.search(t):
        return True
    return False


def extract_employee_status_filter(text: str) -> str | None:
    lower = (text or "").lower()
    if re.search(r"\b(inactive|resigned|left employees|terminated)\b", lower):
        return "inactive"
    if re.search(
        r"\b(active|actively|currently\s+working|working\s+now|active\s+only|only\s+active|active\s+employees?)\b",
        lower,
    ):
        return "active"
    if re.search(r"\b(all employees|total employees|entire workforce)\b", lower):
        return "all"
    return None


def employee_count_query(status_filter: str | None) -> dict[str, str]:
    if status_filter == "active":
        return {"is_active": "true"}
    if status_filter == "inactive":
        return {"is_active": "false"}
    return {}


def is_identity_question(text: str) -> bool:
    t = (text or "").strip().lower()
    return bool(
        re.search(r"\b(what is|what's|whats)\s+my\s+name\b", t)
        or re.search(r"\bwho am i\b", t)
        or (re.search(r"\bmy name\b", t) and re.search(r"\b(what|tell|know)\b", t))
    )


def extract_all_emp_nos(text: str) -> list[str]:
    t = text or ""
    found = re.findall(r"\b(\d{3,8})\b", t)
    return list(dict.fromkeys(found))


def extract_target_emp_no(text: str) -> str | None:
    all_nos = extract_all_emp_nos(text)
    return all_nos[0] if all_nos else None


def is_leave_count_question(text: str) -> bool:
    lower = (text or "").lower()
    return bool(
        re.search(r"\b(leaves?|leave\s+count|leave\s+days?)\b", lower)
        and re.search(r"\b(count|how many|number of|total)\b", lower)
        and len(extract_all_emp_nos(text)) > 0
    )


def is_employee_lookup_question(text: str) -> bool:
    t = (text or "").strip()
    lower = t.lower()
    emp_no = extract_target_emp_no(t)
    if not emp_no:
        return False
    if re.search(r"\b(leave|leaves|attendance|payslip|payroll|salary|loan|overtime|permission)\b", lower):
        return False
    return bool(
        re.search(
            r"\b(name|who\s+is|who's|profile|details?|information|info|tell\s+me|lookup|find|designation|department|division)\b",
            lower,
        )
        or re.search(r"\bemployee\s+name\b", lower)
        or re.search(r"\bwhat\s+is\s+the\s+(name|designation|department)\b", lower)
    )


def matches_topic(text: str, words: list[str]) -> bool:
    lower = (text or "").lower()
    return any(w in lower for w in words)


def is_employee_applications_question(text: str) -> bool:
    lower = (text or "").lower()
    return bool(re.search(r"\b(application|applications|onboarding)\b", lower) and re.search(r"\bemployee\b", lower))


def is_leave_question_for_employee(text: str) -> bool:
    lower = (text or "").lower()
    return bool(re.search(r"\bleaves?\b", lower) and (extract_target_emp_no(text) or re.search(r"\bemployee\s+(number|no)\b", lower, re.I)))


def wants_employee_count(text: str) -> bool:
    lower = (text or "").lower()
    return bool(
        re.search(r"\b(how many|number of|count of|total)\b", lower)
        and re.search(r"\b(employees?|staff|workforce|people)\b", lower)
    )
