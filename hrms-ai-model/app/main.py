"""
HRMS AI Model Service — self-hosted Python brain for the HR assistant.

Endpoints (used by Node backend when HRMS_AI_PROVIDER=self_hosted):
  POST /router         — plan which HRMS APIs to call
  POST /answer         — compose natural-language reply
  POST /answer/stream  — SSE token stream
  GET  /health
"""
from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .answer_engine import generate_reply, stream_reply_text
from contextlib import asynccontextmanager

from .gguf_service import gguf_enabled, warmup_gguf
from .router_engine import plan_routes
from .schemas import AnswerRequest, AnswerResponse, RouterRequest, RouterResponse

load_dotenv()

API_KEY: Optional[str] = os.getenv("API_KEY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if gguf_enabled():
        warmup_gguf()
    yield


app = FastAPI(title="HRMS AI Model", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_auth(authorization: Optional[str] = Header(None)) -> None:
    if not API_KEY:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization[7:]
    if token != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


@app.get("/health")
def health():
    model_path = os.getenv("HRMS_AI_GGUF_MODEL_PATH", "")
    return {
        "status": "healthy",
        "service": "hrms-ai-model",
        "version": "1.0.0",
        "engine": "gguf" if gguf_enabled() else "hrms-native",
        "gguf": {
            "enabled": os.getenv("HRMS_AI_USE_GGUF", "").lower() == "true",
            "model_loaded": gguf_enabled(),
            "model_path": model_path if model_path else None,
        },
    }


@app.post("/router", response_model=RouterResponse)
def router_endpoint(body: RouterRequest, authorization: Optional[str] = Header(None)):
    _check_auth(authorization)
    return plan_routes(body.message, body.userContext, body.catalog, body.history)


@app.post("/answer", response_model=AnswerResponse)
def answer_endpoint(body: AnswerRequest, authorization: Optional[str] = Header(None)):
    _check_auth(authorization)
    return generate_reply(
        body.message,
        body.userContext,
        body.fetchedData,
        body.needsClarification,
        body.history,
    )


@app.post("/answer/stream")
async def answer_stream_endpoint(body: AnswerRequest, authorization: Optional[str] = Header(None)):
    _check_auth(authorization)
    result = generate_reply(
        body.message,
        body.userContext,
        body.fetchedData,
        body.needsClarification,
        body.history,
    )

    async def event_stream():
        import json

        async for chunk in stream_reply_text(result.reply):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield f"data: {json.dumps({'done': True, 'answerEngine': result.answerEngine})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
