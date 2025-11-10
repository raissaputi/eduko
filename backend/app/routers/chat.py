# app/routers/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
import asyncio
import time

from app.services.llm import provider, build_prompt
from app.services.writer import append_event, append_chat_raw

router = APIRouter(tags=["chat"])

class ChatIn(BaseModel):
    message: str
    session_id: str
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
    
    # Store full chat content
    current_ts = int(time.time() * 1000)
    chat_id = f"chat_{current_ts}"

    # Store full content in chat.jsonl
    append_chat_raw(payload.session_id, {
        "id": chat_id,
        "client_ts": current_ts,
        "problem_id": payload.problem_id,
        "prompt": payload.message,
        "response": text
    })
    
    # Log minimal events
    append_event(payload.session_id, {
        "event_type": "chat_prompt",
        "client_ts": current_ts,
        "session_id": payload.session_id,
        "payload": {
            "problem_id": payload.problem_id,
            "chat_id": chat_id
        }
    })
    
    append_event(payload.session_id, {
        "event_type": "chat_response", 
        "client_ts": current_ts,
        "session_id": payload.session_id,
        "payload": {
            "problem_id": payload.problem_id,
            "chat_id": chat_id
        }
    })
    
    return ChatOut(reply=text)

@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            message = data.get("message", "")
            session_id = data.get("session_id", "anon")
            problem_id = data.get("problem_id")
            problem_title = data.get("problem_title")
            problem_statement = data.get("problem_statement")
            msgs = build_prompt(message, problem_title, problem_statement)

            # Generate chat ID 
            current_ts = int(time.time() * 1000)
            chat_id = f"chat_{current_ts}"

            # Log minimal prompt event
            append_event(session_id, {
                "event_type": "chat_prompt",
                "client_ts": current_ts,
                "session_id": session_id,
                "payload": {
                    "problem_id": problem_id,
                    "chat_id": chat_id
                }
            })

            # Initialize response collection
            full_response = ""
            
            # Stream tokens and collect full response
            async for tok in provider.stream(msgs):
                full_response += tok
                await ws.send_json({"type": "token", "text": tok})
            
            # Store full content in chat.jsonl
            append_chat_raw(session_id, {
                "id": chat_id,
                "client_ts": current_ts,
                "problem_id": problem_id,
                "prompt": message,
                "response": full_response
            })

            # Log minimal response event
            append_event(session_id, {
                "event_type": "chat_response",
                "client_ts": current_ts,
                "session_id": session_id,
                "payload": {
                    "problem_id": problem_id,
                    "chat_id": chat_id
                }
            })
            
            await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception as e:
        await ws.send_json({"type": "error", "error": str(e)})
        await ws.close()
