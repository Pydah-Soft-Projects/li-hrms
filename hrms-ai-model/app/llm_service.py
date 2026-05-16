"""
HRMS Assistant — local LLM (Ollama) with multi-turn conversation memory.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from .conversation_context import history_to_chat_messages
from .schemas import HistoryMessage

try:
    import httpx
except ImportError:
    httpx = None


def llm_enabled() -> bool:
    return bool(os.getenv("HRMS_AI_OLLAMA_URL", "").strip()) and httpx is not None


def _base() -> str:
    return os.getenv("HRMS_AI_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")


def _model() -> str:
    return os.getenv("HRMS_AI_OLLAMA_MODEL", "llama3.2")


def _timeout() -> float:
    return float(os.getenv("HRMS_AI_OLLAMA_TIMEOUT", "120"))


def llm_chat_messages(messages: list[dict], temperature: float = 0.3) -> str:
    if not llm_enabled():
        return ""
    try:
        r = httpx.post(
            f"{_base()}/api/chat",
            json={
                "model": _model(),
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
            timeout=_timeout(),
        )
        r.raise_for_status()
        return (r.json().get("message", {}).get("content") or "").strip()
    except Exception as e:
        print(f"[LLM] chat error: {e}")
        return ""


def _extract_json(text: str) -> dict | None:
    raw = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None


def llm_plan_routes(
    message: str,
    user_context: dict,
    catalog: list[dict],
    history: list[HistoryMessage] | None = None,
) -> dict | None:
    catalog_text = "\n".join(
        f"- {c.get('id')}: {c.get('description', '')} [query: {', '.join(c.get('queryParams') or [])}]"
        for c in catalog[:40]
    )
    system = """You are the HRMS API router. You remember the full conversation.
Output ONLY valid JSON. Pick 0-4 endpoints for the CURRENT question (use chat history).
Follow-ups like "only active" refer to the previous topic.
Employee number → leaves with search=EMPNO, NOT leaves_my.
"My name" → empty endpoints [].
Employee applications → employee_applications.
Active count → employees_count with is_active=true.

{"endpoints":[{"endpointId":"...","pathParams":{},"query":{},"reason":"..."}],"needsClarification":null}"""

    messages = [{"role": "system", "content": system}]
    messages.extend(history_to_chat_messages(history or [], 10))
    messages.append(
        {
            "role": "user",
            "content": f"User profile: {json.dumps(user_context)}\n\nCatalog:\n{catalog_text}\n\nRoute (JSON only): {message}",
        }
    )
    out = llm_chat_messages(messages, temperature=0.1)
    return _extract_json(out)


def llm_analyze_answer(
    message: str,
    user_name: str,
    facts: dict[str, Any],
    history: list[HistoryMessage] | None = None,
) -> str:
    system = f"""You are {user_name}'s HRMS AI assistant. You remember this entire chat.
Rules:
- Answer ONLY from FACTS in the latest message. Never invent numbers.
- 2-6 natural sentences. No JSON, no raw dumps.
- Understand follow-ups ("only active", "that employee", "same as before").
- Be warm and precise."""

    messages = [{"role": "system", "content": system}]
    messages.extend(history_to_chat_messages(history or [], 14))
    messages.append(
        {
            "role": "user",
            "content": f"HRMS DATA:\n{json.dumps(facts, default=str)[:14000]}\n\nMy question now: {message}",
        }
    )
    out = llm_chat_messages(messages, temperature=0.5)
    return out if len(out) > 15 else ""
