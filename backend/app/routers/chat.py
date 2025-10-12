# app/routers/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
import asyncio

from app.services.llm import provider, build_prompt

router = APIRouter(tags=["chat"])

class ChatIn(BaseModel):
    message: str
    problem_id: Optional[int] = None
    problem_title: Optional[str] = None
    problem_statement: Optional[str] = None
    thread_id: Optional[str] = None

class ChatOut(BaseModel):
    reply: str

@router.post("/api/chat", response_model=ChatOut)
async def chat_rest(payload: ChatIn):
    msgs = build_prompt(payload.message, payload.problem_title, payload.problem_statement)
    text = await provider.complete(msgs)
    return ChatOut(reply=text)

@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            message = data.get("message", "")
            problem_title = data.get("problem_title")
            problem_statement = data.get("problem_statement")
            msgs = build_prompt(message, problem_title, problem_statement)

            async for tok in provider.stream(msgs):
                await ws.send_json({"type": "token", "text": tok})
            await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception as e:
        await ws.send_json({"type": "error", "error": str(e)})
        await ws.close()
