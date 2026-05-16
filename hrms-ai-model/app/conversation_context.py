"""Conversation awareness for follow-ups and multi-turn context."""
from __future__ import annotations

import re

from .schemas import HistoryMessage

FOLLOW_UP_RE = re.compile(
    r"^(yes|no|yeah|ok|okay|sure|please|thanks|and |also |but |what about|how about|same|only|just|that|those|them|it\b)",
    re.I,
)


def is_follow_up(message: str) -> bool:
    t = (message or "").strip()
    if not t:
        return False
    if FOLLOW_UP_RE.search(t):
        return True
    if len(t) < 80 and re.search(r"\b(active|inactive|that employee|same|earlier)\b", t, re.I):
        return True
    return False


def enrich_message_from_history(message: str, history: list[HistoryMessage]) -> str:
    text = (message or "").strip()
    if not history or not is_follow_up(text):
        return text
    recent = history[-8:]
    last_user = next((m for m in reversed(recent) if m.role == "user"), None)
    last_asst = next((m for m in reversed(recent) if m.role == "assistant"), None)
    parts = [text]
    if last_user and last_user.content.strip() != text:
        parts.append(f'(Earlier you asked: "{last_user.content[:400]}")')
    return " ".join(parts)


def history_to_chat_messages(history: list[HistoryMessage], max_turns: int = 14) -> list[dict]:
    out = []
    for m in history[-max_turns:]:
        if m.role in ("user", "assistant"):
            out.append({"role": m.role, "content": m.content})
    return out
