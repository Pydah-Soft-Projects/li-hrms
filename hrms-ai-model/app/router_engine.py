"""HRMS intent router — maps natural language to endpoint plans."""
from __future__ import annotations

import re
from datetime import date, timedelta

from .intent_utils import (
    employee_count_query,
    extract_all_emp_nos,
    extract_employee_status_filter,
    extract_target_emp_no,
    is_employee_applications_question,
    is_employee_lookup_question,
    is_identity_question,
    is_leave_count_question,
    is_leave_question_for_employee,
    is_small_talk,
    matches_topic,
    wants_employee_count,
)
from .llm_service import llm_enabled, llm_plan_routes
from .conversation_context import enrich_message_from_history
from .schemas import CatalogEntry, HistoryMessage, PlannedEndpoint, RouterResponse, UserContext
MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


def _current_year() -> str:
    return str(date.today().year)


def _current_month() -> str:
    today = date.today()
    return f"{today.year}-{today.month:02d}"


def _extract_month(text: str) -> str:
    ym = re.search(r"\b(20\d{2})[-/](0[1-9]|1[0-2])\b", text)
    if ym:
        return f"{ym.group(1)}-{ym.group(2)}"
    lower = text.lower()
    for i, name in enumerate(MONTHS):
        if name in lower:
            year_m = re.search(r"\b(20\d{2})\b", text)
            year = year_m.group(1) if year_m else _current_year()
            return f"{year}-{i + 1:02d}"
    return _current_month()


def _extract_emp_no(text: str, ctx: UserContext) -> str | None:
    m = re.search(r"\b(emp[-\s]?)?(\d{3,8})\b", text, re.I)
    if m:
        return m.group(2)
    return ctx.employeeId


def _matches(text: str, words: list[str]) -> bool:
    t = text.lower()
    return any(w in t for w in words)


def _can_use(catalog: list[CatalogEntry], endpoint_id: str) -> bool:
    return any(e.id == endpoint_id for e in catalog)


def plan_routes(
    message: str,
    user_context: UserContext,
    catalog: list[CatalogEntry],
    history: list[HistoryMessage] | None = None,
) -> RouterResponse:
    text = enrich_message_from_history((message or "").strip(), history or [])
    lower = text.lower()
    endpoints: list[PlannedEndpoint] = []
    needs_clarification: str | None = None

    if is_small_talk(text):
        return RouterResponse(endpoints=[], reasoning="small-talk")

    if is_identity_question(text):
        return RouterResponse(endpoints=[], reasoning="identity")

    lookup_emp = extract_target_emp_no(raw_text)
    if is_employee_lookup_question(raw_text) and lookup_emp:
        if _can_use(catalog, "employee_detail"):
            return RouterResponse(
                endpoints=[
                    PlannedEndpoint(
                        endpointId="employee_detail",
                        pathParams={"empNo": lookup_emp},
                        reason=f"employee profile {lookup_emp}",
                    )
                ],
                reasoning="employee-lookup",
            )
        if _can_use(catalog, "employees_list"):
            return RouterResponse(
                endpoints=[
                    PlannedEndpoint(
                        endpointId="employees_list",
                        query={"search": lookup_emp, "limit": "5"},
                        reason=f"employee search {lookup_emp}",
                    )
                ],
                reasoning="employee-lookup-search",
            )

    if llm_enabled():
        catalog_dicts = [c.model_dump() for c in catalog]
        llm_plan = llm_plan_routes(text, user_context.model_dump(), catalog_dicts, history or [])
        if llm_plan and isinstance(llm_plan.get("endpoints"), list):
            eps = [
                PlannedEndpoint(
                    endpointId=e.get("endpointId", ""),
                    pathParams=e.get("pathParams") or {},
                    query=e.get("query") or {},
                    reason=e.get("reason") or "",
                )
                for e in llm_plan["endpoints"]
                if e.get("endpointId")
            ]
            return RouterResponse(
                endpoints=eps[:5],
                needsClarification=llm_plan.get("needsClarification"),
                reasoning="llm-router",
            )

    month = _extract_month(raw_text)
    emp_no = _extract_emp_no(raw_text, user_context)
    is_self = bool(re.search(r"\b(my|mine|me|i)\b", raw_text, re.I)) or not re.search(
        r"\b(employee|staff|team)\b", raw_text, re.I
    )

    def add(ep_id: str, reason: str, path_params: dict | None = None, query: dict | None = None):
        if _can_use(catalog, ep_id):
            endpoints.append(
                PlannedEndpoint(
                    endpointId=ep_id,
                    pathParams=path_params or {},
                    query=query or {},
                    reason=reason,
                )
            )

    if _matches(lower, ["dashboard", "summary", "overview", "stats"]):
        add("dashboard_stats", "dashboard overview")

    if _matches(lower, ["notification", "alert", "unread"]):
        if _matches(lower, ["unread", "count"]):
            add("notifications_unread", "unread count")
        else:
            add("notifications", "notifications", query={"unreadOnly": "true"})

    if is_employee_applications_question(text) and _can_use(catalog, "employee_applications"):
        add("employee_applications", "application status breakdown")

    emp_nos_in_question = extract_all_emp_nos(raw_text)
    if is_leave_count_question(raw_text) and _can_use(catalog, "leaves_list"):
        for emp in emp_nos_in_question[:5]:
            add("leaves_list", f"leave count for {emp}", query={"search": emp, "limit": "100"})
    elif matches_topic(raw_text, ["leave", "cl", "el", "casual", "earned", "time off", "vacation"]):
        target = extract_target_emp_no(text)
        if target and is_leave_question_for_employee(text) and _can_use(catalog, "leaves_list"):
            add("leaves_list", f"leaves for {target}", query={"search": target, "limit": "100"})
        elif _matches(lower, ["pending", "approval", "approve"]):
            add("leaves_pending", "pending leave approvals")
        elif _matches(lower, ["balance", "remaining", "left", "available"]):
            eid = emp_no or user_context.employeeId
            if eid:
                add("leave_balance", "leave balance", path_params={"employeeId": eid})
            elif is_self:
                add("leaves_my", "my leaves", query={"year": _current_year()})
        elif _matches(lower, ["register", "history", "taken"]):
            eid = emp_no or user_context.employeeId
            if eid:
                add(
                    "leave_register",
                    "leave register",
                    path_params={"employeeId": eid},
                    query={"year": _current_year()},
                )
        elif is_self:
            add("leaves_my", "my leaves", query={"year": _current_year()})
        else:
            add("leaves_list", "leave list", query={"year": _current_year()})
        if _matches(lower, ["stat", "report", "count"]) and not emp_nos_in_question:
            add("leaves_stats", "leave stats", query={"year": _current_year()})

    if matches_topic(raw_text, ["attendance", "present", "absent", "punch", "check in", "check-in"]):
        eid = emp_no or user_context.employeeId
        if _matches(lower, ["month", "monthly", "summary"]):
            if eid:
                add(
                    "attendance_monthly_summary",
                    "monthly attendance summary",
                    path_params={"employeeId": eid},
                    query={"month": month},
                )
            else:
                q = {"month": month}
                if eid:
                    q["empNo"] = eid
                add("attendance_monthly", "monthly attendance", query=q)
        else:
            end = date.today()
            start = end - timedelta(days=14)
            q = {"startDate": start.isoformat(), "endDate": end.isoformat()}
            if eid:
                q["employeeNumber"] = eid
            add("attendance_list", "recent attendance", query=q)

    if matches_topic(raw_text, ["payslip", "salary", "payroll", "wage", "pay slip"]):
        eid = emp_no or user_context.employeeId
        if eid:
            add(
                "payroll_payslip",
                "payslip",
                path_params={"employeeId": eid, "month": month},
            )
        else:
            add("payroll_list", "payroll records", query={"month": month})
            if not _can_use(catalog, "payroll_list"):
                needs_clarification = (
                    'Which month should I check for your payslip? Say something like "March 2026" or "2026-03".'
                )

    if matches_topic(raw_text, ["loan", "advance", "emi"]):
        if _matches(lower, ["pending", "approval"]):
            add("loans_pending", "pending loans")
        elif is_self:
            add("loans_my", "my loans")
        else:
            add("loans_list", "loans list")

    if matches_topic(raw_text, ["overtime", " ot "]) or re.search(r"\bot\b", raw_lower):
        if _matches(lower, ["pending", "approval"]):
            add("ot_pending", "pending OT")
        else:
            add("ot_list", "OT list")

    if matches_topic(raw_text, ["permission", "gate pass", "outpass", "out pass"]):
        if _matches(lower, ["pending", "approval"]):
            add("permissions_pending", "pending permissions")
        else:
            add("permissions_list", "permissions")

    if _matches(lower, ["holiday", "holidays"]):
        add("holidays_my", "holidays", query={"year": _current_year()})

    if _matches(lower, ["employee", "staff", "colleague", "workforce"]):
        status_filter = extract_employee_status_filter(text)
        count_query = employee_count_query(status_filter)
        if wants_employee_count(text) or _matches(lower, ["only active", "active only", "not all"]):
            add(
                "employees_count",
                f"{status_filter or 'all'} employee count",
                query=count_query,
            )
        elif emp_no:
            add("employee_detail", "employee profile", path_params={"empNo": emp_no})
        elif _can_use(catalog, "employees_list"):
            add("employees_list", "employee search", query={"limit": "10", **count_query})

    if _matches(lower, ["policy", "leave policy", "rules"]):
        add("settings_leave_policy", "leave policy")

    if not endpoints and not needs_clarification:
        needs_clarification = (
            "I can help with leaves, attendance, payslips, loans, OT, and permissions. What would you like to know?"
        )

    seen: set[str] = set()
    unique: list[PlannedEndpoint] = []
    for ep in endpoints:
        if ep.endpointId not in seen:
            seen.add(ep.endpointId)
            unique.append(ep)

    return RouterResponse(
        endpoints=unique[:5],
        needsClarification=needs_clarification,
        reasoning="hrms-python-router-v1",
    )
