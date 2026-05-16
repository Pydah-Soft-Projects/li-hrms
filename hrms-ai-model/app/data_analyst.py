"""
Turn raw HRMS API payloads into compact facts, then write a clear analyzed answer.
No raw JSON dumps — only interpretation of the data for the user's question.
"""
from __future__ import annotations

import os
import re
from collections import Counter
from typing import Any

from .intent_utils import (
    extract_employee_status_filter,
    extract_target_emp_no,
    is_identity_question,
    is_small_talk,
    wants_employee_count,
)
from .gguf_service import get_last_engine_used, gguf_compose_answer, gguf_enabled
from .llm_service import llm_analyze_answer, llm_enabled
from .native_intelligence import compose_answer
from .schemas import FetchedRow, HistoryMessage, UserContext


def _unwrap(row: FetchedRow) -> Any:
    if not row.ok or not isinstance(row.data, dict):
        return None
    d = row.data
    if d.get("_truncated"):
        return {"_truncated": True}
    if "data" in d and isinstance(d["data"], (list, dict)):
        if isinstance(d.get("count"), int):
            return d
        return d["data"]
    return d


def _as_list(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("data", "items", "records", "leaves"):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    return []


def _emp_name(item: dict) -> str:
    return (
        item.get("employee_name")
        or item.get("employeeName")
        or item.get("name")
        or f"Emp {item.get('emp_no', '?')}"
    )


def _dept_name(item: dict) -> str:
    d = item.get("department") or item.get("department_id")
    if isinstance(d, dict):
        return d.get("name") or ""
    return item.get("department_name") or ""


def _is_active(item: dict) -> bool:
    v = item.get("is_active")
    return v is True or v == "true" or v == "True"


def build_facts(
    fetched: list[FetchedRow], message: str, user_context: UserContext | None = None
) -> dict[str, Any]:
    facts: dict[str, Any] = {
        "question": message,
        "sources": [],
        "user_profile": {
            "name": user_context.name if user_context else None,
            "role": user_context.role if user_context else None,
            "employeeId": user_context.employeeId if user_context else None,
        },
    }
    status_filter = extract_employee_status_filter(message)
    target_emp = extract_target_emp_no(message)

    for row in fetched:
        if not row.ok:
            facts.setdefault("errors", []).append(row.endpointId or "unknown")
            continue
        eid = row.endpointId or "unknown"
        facts["sources"].append(eid)
        payload = _unwrap(row)

        if isinstance(payload, dict) and payload.get("_truncated"):
            skip = eid == "employee_detail" or (
                eid in ("leaves_list", "leaves_my", "leaves_pending") and (row.query or {}).get("search")
            )
            if not skip:
                facts["truncated"] = True
            continue

        if eid == "employee_detail" and not row.ok:
            target = extract_target_emp_no(message)
            if target:
                facts["employee_not_found"] = target
            continue

        if eid == "employee_detail" and isinstance(payload, dict):
            emp = payload.get("data") or payload.get("employee") or payload
            if isinstance(emp, dict):
                dept = emp.get("department_id") or emp.get("department")
                desig = emp.get("designation_id") or emp.get("designation")
                facts["employee_profile"] = {
                    "emp_no": emp.get("emp_no"),
                    "name": emp.get("employee_name") or emp.get("name"),
                    "email": emp.get("email"),
                    "is_active": emp.get("is_active"),
                    "department": dept.get("name") if isinstance(dept, dict) else dept,
                    "designation": desig.get("name") if isinstance(desig, dict) else desig,
                }
            continue

        if eid == "auth_me" and isinstance(row.data, dict):
            u = row.data.get("user") or row.data.get("data") or row.data
            if isinstance(u, dict):
                facts["user_profile"] = {
                    "name": u.get("name") or facts["user_profile"].get("name"),
                    "email": u.get("email"),
                    "role": u.get("role") or facts["user_profile"].get("role"),
                    "employeeId": u.get("employeeId") or u.get("emp_no"),
                }

        if eid == "employees_count":
            count = row.data.get("count") if isinstance(row.data, dict) else None
            if count is None and isinstance(payload, dict):
                count = payload.get("count")
            if count is None and isinstance(payload, dict) and isinstance(payload.get("data"), dict):
                count = payload["data"].get("count")
            filt = status_filter
            if not filt and (row.query or {}).get("is_active") == "true":
                filt = "active"
            elif not filt and (row.query or {}).get("is_active") == "false":
                filt = "inactive"
            facts["employee_count"] = {"total": count, "filter": filt or "all"}

        elif eid == "employees_list" and isinstance(payload, (dict, list)):
            root = payload if isinstance(payload, dict) else {"data": payload}
            items = _as_list(root if isinstance(root, dict) else payload)
            pag = root.get("pagination", {}) if isinstance(root, dict) else {}
            total = pag.get("total") if isinstance(pag, dict) else len(items)
            active_n = sum(1 for i in items if _is_active(i))
            inactive_n = len(items) - active_n
            dept_counts = Counter(_dept_name(i) for i in items if _dept_name(i))
            facts["employees"] = {
                "total": total,
                "sample_size": len(items),
                "active_in_sample": active_n,
                "inactive_in_sample": inactive_n,
                "top_departments": dept_counts.most_common(4),
                "examples": [
                    {"name": _emp_name(i), "department": _dept_name(i), "active": _is_active(i)}
                    for i in items[:3]
                ],
            }

        elif eid == "employee_applications":
            items = _as_list(row.data) or _as_list(payload)
            by_status = Counter(str(i.get("status", "unknown")).lower() for i in items)
            facts["employee_applications"] = {
                "total": len(items),
                "by_status": dict(by_status),
            }

        elif eid in ("leaves_my", "leaves_list", "leaves_pending"):
            items = _as_list(row.data) or _as_list(payload)
            total = row.data.get("count") if isinstance(row.data, dict) else len(items)
            by_status = Counter(str(i.get("status", "unknown")).lower() for i in items)
            total_days = sum(float(i.get("numberOfDays") or 0) for i in items)
            facts.setdefault("leaves_analysis", []).append(
                {
                    "source": eid,
                    "employee_searched": (row.query or {}).get("search") or target_emp,
                    "total_records": total,
                    "total_days": total_days,
                    "by_status": dict(by_status),
                }
            )

        elif eid == "dashboard_stats" and isinstance(payload, dict) and re.search(
            r"\b(dashboard|overview)\b", message, re.I
        ):
            facts["dashboard"] = {
                k: payload[k]
                for k in list(payload.keys())[:15]
                if not k.startswith("_") and not isinstance(payload[k], (dict, list))
            }

        elif eid == "notifications_unread" and isinstance(payload, dict):
            facts["notifications_unread"] = payload.get("count") or payload.get("unreadCount")

        elif eid == "leave_balance" and isinstance(payload, dict):
            facts["leave_balance"] = {
                k: payload[k]
                for k in ("balance", "earned", "used", "remaining", "EL", "CL")
                if k in payload
            } or payload

        elif isinstance(payload, dict):
            count = payload.get("count")
            if isinstance(count, int):
                facts.setdefault("counts", {})[eid] = count

    return facts


def _wants_list(message: str) -> bool:
    return bool(re.search(r"\b(list|show me all|who are|names of|display)\b", message, re.I))


def _rule_based_answer(message: str, facts: dict[str, Any], name: str) -> str:
    if is_identity_question(message):
        n = facts.get("user_profile", {}).get("name") or name
        return f"Your name in HRMS is {n}."

    q = message.strip()
    parts: list[str] = []

    if facts.get("employee_applications"):
        ea = facts["employee_applications"]
        bits = ", ".join(f"{v} {k}" for k, v in (ea.get("by_status") or {}).items())
        parts.append(f"Employee applications: {ea.get('total', 0)} total ({bits}).")

    if facts.get("leaves_analysis"):
        for la in facts["leaves_analysis"]:
            emp = la.get("employee_searched")
            st = ", ".join(f"{v} {k}" for k, v in (la.get("by_status") or {}).items())
            parts.append(
                f"Leaves{f' for employee {emp}' if emp else ''}: {la.get('total_records')} records, "
                f"{la.get('total_days')} days. {st}"
            )

    if facts.get("truncated"):
        parts.append(
            "The dataset behind your question is quite large, so I focused on the key numbers rather than every record."
        )

    ec = facts.get("employee_count")
    if ec and isinstance(ec.get("total"), int):
        total = ec["total"]
        filt = ec.get("filter", "all")
        if filt == "active" or wants_employee_count(q):
            if filt == "active":
                parts.append(
                    f"Right now you have **{total} active employees** in your HRMS scope — that's everyone currently marked active and not separated."
                )
            else:
                parts.append(f"Your HRMS shows **{total} employees** matching that count query.")
        elif filt == "inactive":
            parts.append(f"There are **{total} inactive employees** in your scope (resigned/left or marked inactive).")
        else:
            parts.append(f"In total, **{total} employees** fall under your access scope.")

    emps = facts.get("employees")
    if emps and not ec:
        total = emps.get("total", 0)
        filt = extract_employee_status_filter(q)
        if wants_employee_count(q) or filt == "active":
            parts.append(
                f"From the employee register, **{total} people** match your filters"
                + (" (active only)." if filt == "active" else ".")
            )
        elif _wants_list(q):
            ex = emps.get("examples") or []
            if ex:
                names = ", ".join(f"{e['name']} ({e['department'] or '—'})" for e in ex[:3])
                parts.append(
                    f"There are **{total} employees** in scope. For example: {names}."
                )
                if total > 3:
                    parts.append(f"Another {total - 3} are in the system — narrow by department if you need a full list.")
            else:
                parts.append(f"I see **{total} employees** in your scope.")
        else:
            top = emps.get("top_departments") or []
            dept_hint = ""
            if top:
                dept_hint = " Largest groups in the sample: " + ", ".join(
                    f"{d[0]} ({d[1]})" for d in top[:3]
                ) + "."
            parts.append(
                f"Your workforce in scope is **{total} employees**.{dept_hint} "
                "Ask if you want a breakdown by department or division."
            )

    leaves = facts.get("leaves")
    if leaves:
        for key, info in leaves.items():
            if key == "leaves_pending":
                n = info.get("count", 0)
                parts.append(
                    f"You have **{n} leave request{'s' if n != 1 else ''}** waiting for approval."
                )
            else:
                n = info.get("count", 0)
                by = info.get("by_status") or {}
                if by:
                    summary = ", ".join(f"{v} {k}" for k, v in list(by.items())[:4])
                    parts.append(f"I found **{n} leave record(s)** — {summary}.")

    if facts.get("leave_balance"):
        lb = facts["leave_balance"]
        if isinstance(lb, dict):
            parts.append(
                "Your earned-leave position: "
                + ", ".join(f"{k}: {v}" for k, v in list(lb.items())[:6] if v is not None)
                + "."
            )

    dash = facts.get("dashboard")
    if dash and not parts:
        highlights = ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in list(dash.items())[:5])
        parts.append(f"Here's a quick read of your dashboard — {highlights}.")

    if facts.get("notifications_unread") is not None:
        n = facts["notifications_unread"]
        parts.append(f"You have **{n} unread notification{'s' if n != 1 else ''}**.")

    if facts.get("errors") and not parts:
        return (
            f"I couldn't load all the data for that question, {name}. "
            "You may need a more specific filter (month, employee number, or department)."
        )

    if not parts:
        return (
            f"I pulled your HRMS data but nothing specific matched “{q}”, {name}. "
            "Try rephrasing — e.g. “how many active employees” or “my pending leave approvals”."
        )

    opener = f"{name}, here's what the data shows:\n\n" if len(parts) > 1 else ""
    body = "\n\n".join(p.replace("**", "") for p in parts)
    return (opener + body).strip()


def analyze_and_reply(
    message: str,
    user_context: UserContext,
    fetched_data: list[FetchedRow],
    needs_clarification: str | None,
    history: list[HistoryMessage] | None = None,
) -> tuple[str, str]:
    name = (user_context.name or "there").split()[0]

    if is_small_talk(message) and not fetched_data:
        return (
            f"Hi {name}! I'm here to help — ask me anything about HRMS and I'll analyze your live data.",
            "hrms-native",
        )

    if needs_clarification:
        return needs_clarification, "hrms-native"

    if is_identity_question(message):
        return (
            f"Your name in HRMS is {user_context.name or name}, role: {user_context.role or 'user'}.",
            "hrms-native",
        )

    facts = build_facts(fetched_data, message, user_context)
    if history:
        facts["conversation_turns"] = len(history)
        prev = next((m for m in reversed(history) if m.role == "user" and m.content != message), None)
        if prev:
            facts["previous_question"] = prev.content[:300]

    if gguf_enabled():
        gguf_reply = gguf_compose_answer(message, name, facts, history or [])
        if gguf_reply:
            return gguf_reply, "gguf"

    use_ollama = os.getenv("HRMS_AI_USE_OLLAMA", "").lower() == "true" and llm_enabled()
    if use_ollama:
        llm_reply = llm_analyze_answer(message, name, facts, history or [])
        if llm_reply:
            return llm_reply, "ollama"

    return compose_answer(message, user_context, facts, history or []), get_last_engine_used()
