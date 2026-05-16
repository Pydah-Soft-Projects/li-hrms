"""
Optional local GGUF model (llama-cpp-python) — no Ollama, no cloud APIs.
Set HRMS_AI_USE_GGUF=true and HRMS_AI_GGUF_MODEL_PATH=/path/to/model.gguf
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_llm = None
_warmed_up = False
_last_engine_used: str = "hrms-native"


def get_last_engine_used() -> str:
    return _last_engine_used


def gguf_enabled() -> bool:
    if os.getenv("HRMS_AI_USE_GGUF", "").lower() != "true":
        return False
    path = os.getenv("HRMS_AI_GGUF_MODEL_PATH", "").strip()
    return bool(path) and os.path.isfile(path)


def _get_llm():
    global _llm
    if _llm is not None:
        return _llm
    from llama_cpp import Llama

    path = os.getenv("HRMS_AI_GGUF_MODEL_PATH", "").strip()
    print(f"[HRMS GGUF] Loading model from {path} ...")
    _llm = Llama(
        model_path=path,
        n_ctx=int(os.getenv("HRMS_AI_GGUF_CTX", "4096")),
        n_threads=int(os.getenv("HRMS_AI_GGUF_THREADS", "4")),
        verbose=False,
    )
    print("[HRMS GGUF] Model loaded.")
    return _llm


def warmup_gguf() -> bool:
    """Load model at startup so first user question is fast."""
    global _warmed_up
    if not gguf_enabled() or _warmed_up:
        return gguf_enabled() and _warmed_up
    try:
        llm = _get_llm()
        llm.create_chat_completion(
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=8,
        )
        _warmed_up = True
        print("[HRMS GGUF] Warmup complete.")
        return True
    except Exception as exc:
        print(f"[HRMS GGUF] Warmup failed: {exc}")
        return False


def _history_messages(history: list | None, limit: int = 6) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in (history or [])[-limit:]:
        role = getattr(item, "role", None) or (item.get("role") if isinstance(item, dict) else None)
        content = getattr(item, "content", None) or (item.get("content") if isinstance(item, dict) else None)
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": str(content)[:800]})
    return out


def gguf_compose_answer(
    message: str,
    user_name: str,
    facts: dict[str, Any],
    history: list | None = None,
) -> str | None:
    global _last_engine_used
    if not gguf_enabled():
        _last_engine_used = "hrms-native"
        return None
    try:
        llm = _get_llm()
    except Exception as exc:
        print(f"[HRMS GGUF] load failed: {exc}")
        _last_engine_used = "hrms-native"
        return None

    system = (
        "You are the HRMS assistant for an Indian HRMS app. Answer ONLY from the JSON facts. "
        "Be concise (2-5 sentences), friendly, and clear. Never invent data. Never dump raw JSON. "
        "For employee_profile give name and designation. For leaves_analysis list each employee's counts."
    )
    user = (
        f"User ({user_name}) asked: {message}\n\n"
        f"Facts:\n{json.dumps(facts, default=str)[:12000]}"
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    messages.extend(_history_messages(history))
    messages.append({"role": "user", "content": user})
    try:
        out = llm.create_chat_completion(
            messages=messages,
            max_tokens=int(os.getenv("HRMS_AI_GGUF_MAX_TOKENS", "512")),
            temperature=0.3,
        )
        content = (out["choices"][0]["message"]["content"] or "").strip()
        if content:
            _last_engine_used = "gguf"
            print("[HRMS GGUF] Answer composed via local model.")
            return content
    except Exception as exc:
        print(f"[HRMS GGUF] inference failed: {exc}")
    _last_engine_used = "hrms-native"
    return None
