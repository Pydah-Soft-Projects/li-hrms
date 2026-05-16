"""Answer layer — delegates to data analyst (analyze facts, explain clearly)."""
from __future__ import annotations

import re

from .data_analyst import analyze_and_reply
from .intent_utils import BYE_RE, GREETING_RE, HELP_RE, THANKS_RE, is_small_talk
from .schemas import AnswerResponse, FetchedRow, HistoryMessage, UserContext


def _conversational(message: str, name: str) -> str:
    text = (message or "").strip()
    if GREETING_RE.search(text) and len(text.split()) <= 6:
        return (
            f"Hey {name}! Ask me about leaves, attendance, payslips, or employee counts — "
            "I'll look up your HRMS data and explain it clearly."
        )
    if THANKS_RE.search(text):
        return f"You're welcome, {name}! Happy to help anytime."
    if BYE_RE.search(text):
        return f"Take care, {name}! I'll be here when you need HR info."
    if HELP_RE.search(text):
        return (
            f"I fetch live HRMS data for your account, analyze it, and explain the answer in plain language, {name} — "
            'for example "how many active employees" or "my pending leaves".'
        )
    if re.search(r"\bhow are you\b", text, re.I):
        return f"I'm doing well, thanks {name}! What would you like me to check in HRMS?"
    if re.search(r"\bwhat'?s up\b", text, re.I):
        return f"All good, {name}! What HR question can I help with?"
    return f"Hi {name}! How can I help with HR today?"


def generate_reply(
    message: str,
    user_context: UserContext,
    fetched_data: list[FetchedRow],
    needs_clarification: str | None,
    history: list[HistoryMessage] | None = None,
) -> AnswerResponse:
    if is_small_talk(message) and not fetched_data:
        name = (user_context.name or "there").split()[0]
        return AnswerResponse(reply=_conversational(message, name))

    reply, engine = analyze_and_reply(
        message, user_context, fetched_data, needs_clarification, history or []
    )
    return AnswerResponse(reply=reply, answerEngine=engine)


async def stream_reply_text(text: str, delay: float = 0.012):
    import asyncio

    for part in re.split(r"(\s+)", text):
        if part:
            yield part
            await asyncio.sleep(delay)
