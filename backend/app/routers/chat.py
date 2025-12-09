# app/routers/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import time

from app.services.llm import provider, build_messages
from app.services.writer import append_event, append_chat_raw, save_chat_image_dataurl

router = APIRouter(tags=["chat"])

class ChatIn(BaseModel):
    message: str
    session_id: str
    problem_id: Optional[str] = None  # Changed from int to str to support "fe1", "dv1" etc
    problem_title: Optional[str] = None
    problem_statement: Optional[str] = None
    thread_id: Optional[str] = None
    images: Optional[List[str]] = None  # data URLs from client
    history: Optional[List[dict]] = None  # full prior turns INCLUDING latest user turn (optional)

class ChatOut(BaseModel):
    reply: str

@router.post("/api/chat", response_model=ChatOut)
async def chat_rest(payload: ChatIn):
    # Build history list (ensure current user message present)
    history = payload.history or []
    if not history:
        history = [{"role": "user", "text": payload.message}]
    else:
        # If last turn isn't this user message, append it
        if not history[-1].get("role") == "user" or history[-1].get("text") != payload.message:
            history = history + [{"role": "user", "text": payload.message}]

    # Persist images to disk and collect URLs
    image_urls: List[str] = []
    if payload.images:
        for data_url in payload.images:
            rel = save_chat_image_dataurl(payload.session_id, payload.problem_id, data_url)
            if rel:
                image_urls.append(f"/media/{rel}")

    msgs = build_messages(history, images=payload.images)
    text = await provider.complete(msgs)
    
    # Store full chat content
    current_ts = int(time.time() * 1000)
    chat_id = f"chat_{current_ts}"

    # Store full content in chat.jsonl (include images if any)
    append_chat_raw(payload.session_id, {
        "id": chat_id,
        "client_ts": current_ts,
        "problem_id": payload.problem_id,
        "prompt": payload.message,
        "image_urls": image_urls,
        "response": text
    })
    
    # Log minimal events
    append_event(payload.session_id, {
        "event_type": "chat_prompt",
        "client_ts": current_ts,
        "session_id": payload.session_id,
        "payload": {
            "problem_id": payload.problem_id,
            "chat_id": chat_id,
            "img_count": len(payload.images or []),
            "history_turns": len(history)
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
            images = data.get("images")
            history = data.get("history") or []
            if not history:
                history = [{"role": "user", "text": message}]
            else:
                if not history[-1].get("role") == "user" or history[-1].get("text") != message:
                    history = history + [{"role": "user", "text": message}]

            # Persist images to disk and collect URLs
            image_urls: List[str] = []
            if images:
                for data_url in images:
                    rel = save_chat_image_dataurl(session_id, problem_id, data_url)
                    if rel:
                        image_urls.append(f"/media/{rel}")

            msgs = build_messages(history, images=images)

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
                    "chat_id": chat_id,
                    "img_count": len(images or []),
                    "history_turns": len(history)
                }
            })

            # Initialize response collection
            full_response = ""
            
            # Stream tokens and collect full response
            async for tok in provider.stream(msgs):
                full_response += tok
                await ws.send_json({"type": "token", "text": tok})
            
            # Store full content in chat.jsonl (include images if any)
            append_chat_raw(session_id, {
                "id": chat_id,
                "client_ts": current_ts,
                "problem_id": problem_id,
                "prompt": message,
                "image_urls": image_urls,
                "response": full_response
            })

            # Log minimal response event
            append_event(session_id, {
                "event_type": "chat_response",
                "client_ts": current_ts,
                "session_id": session_id,
                "payload": {
                    "problem_id": problem_id,
                    "chat_id": chat_id,
                    "img_count": len(images or []),
                    "history_turns": len(history)
                }
            })
            
            await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception as e:
        await ws.send_json({"type": "error", "error": str(e)})
        await ws.close()
