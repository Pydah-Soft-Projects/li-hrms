"""
HRMS Native AI — application-specific intelligence (no Ollama, no cloud LLMs).
Intent + conversation memory + natural answers from HRMS facts only.
"""
from __future__ import annotations

import random
import re
from typing import Any

from .intent_utils import (
    extract_employee_status_filter,
    extract_target_emp_no,
    is_identity_question,
    is_small_talk,
    wants_employee_count,
)
from .schemas import HistoryMessage, UserContext


def _pick(variants: list[str]) -> str:
    return random.choice(variants)


def _infer_topic(history: list[HistoryMessage]) -> dict | None:
    for m in reversed(history):
        if m.role != "user":
            continue
        c = m.content.lower()
        if wants_employee_count(c) and "active" in c:
            return {"topic": "employee_count", "filter": "active"}
        if wants_employee_count(c):
            return {"topic": "employee_count", "filter": extract_employee_status_filter(c) or "all"}
        emp = extract_target_emp_no(c)
        if emp and re.search(r"\bleaves?\b", c):
            return {"topic": "leaves", "empNo": emp}
        if "application" in c:
            return {"topic": "applications"}
    return None


def compose_answer(
    message: str,
    user_context: UserContext,
    facts: dict[str, Any],
    history: list[HistoryMessage] | None = None,
) -> str:
    history = history or []
    name = (user_context.name or "there").split()[0]
    text = (message or "").strip()
    topic = _infer_topic(history)

    if is_identity_question(text) or (topic and topic.get("topic") == "identity"):
        n = facts.get("user_profile", {}).get("name") or user_context.name or name
        role = facts.get("user_profile", {}).get("role") or user_context.role
        return _pick([
            f"You're logged in as {n}" + (f" ({role})" if role else "") + ".",
            f"Your HRMS profile name is {n}.",
        ])

    profile = facts.get("employee_profile")
    if profile:
        active = ""
        if profile.get("is_active") is True:
            active = " (currently active)"
        elif profile.get("is_active") is False:
            active = " (inactive)"
        extra = ", ".join(x for x in (profile.get("department"), profile.get("designation")) if x)
        return _pick([
            f"Employee {profile.get('emp_no')} is {profile.get('name')}{active}."
            + (f" {extra}." if extra else ""),
            f"The name for employee number {profile.get('emp_no')} is {profile.get('name')}{active}.",
        ])

    if facts.get("employee_not_found"):
        return f"I couldn't find employee number {facts['employee_not_found']} in your HRMS scope, {name}."

    if is_small_talk(text) and not facts.get("sources"):
        if re.search(r"\bhow are you\b", text, re.I):
            return f"I'm doing well, {name} — what should I look up in HRMS?"
        return f"Hi {name}! Ask about employees, leaves, attendance, or applications."

    parts: list[str] = []

    ea = facts.get("employee_applications")
    if ea:
        bs = ea.get("by_status") or {}
        parts.append(
            f"Employee applications: {ea.get('total', 0)} total — "
            f"{bs.get('pending', 0)} pending, {bs.get('verified', 0)} verified, "
            f"{bs.get('approved', 0)} approved, {bs.get('rejected', 0)} rejected."
        )

    ec = facts.get("employee_count")
    if ec and isinstance(ec.get("total"), int):
        total = ec["total"]
        filt = (
            extract_employee_status_filter(text)
            or (topic.get("filter") if topic else None)
            or ec.get("filter", "all")
        )
        if filt == "active":
            parts.append(_pick([
                f"You have {total} active employees in your HRMS scope right now.",
                f"There are {total} active employees under your access.",
            ]))
        elif filt == "inactive":
            parts.append(f"There are {total} inactive employees in your scope.")
        else:
            parts.append(f"In total, {total} employees are in your access scope.")

    for la in facts.get("leaves_analysis") or []:
        emp = la.get("employee_searched")
        st = la.get("by_status") or {}
        prefix = f"For employee {emp}, " if emp else ""
        parts.append(
            f"{prefix}I found {la.get('total_records')} leave record(s) "
            f"({la.get('total_days')} days). "
            f"Approved: {st.get('approved', 0)}, pending: {st.get('pending', 0)}, rejected: {st.get('rejected', 0)}."
        )

    if facts.get("truncated") and not parts:
        return f"{name}, the dataset is large — narrow by employee number or month."

    if facts.get("errors") and not parts:
        return f"I couldn't load that data, {name}. Check employee number or permissions."

    if not parts:
        return f"{name}, I didn't find matching data. Try 'how many active employees' or 'leaves for employee 2146'."

    if len(parts) == 1:
        return parts[0]
    return f"{name}, here's what I found:\n\n" + "\n\n".join(parts)
