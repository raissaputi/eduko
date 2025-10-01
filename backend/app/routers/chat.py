# app/routers/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio

router = APIRouter(tags=["chat"])

# --- Simple “bot” so you can see end-to-end immediately ---
def simple_bot_reply(user_text: str, problem_title: Optional[str], problem_statement: Optional[str]) -> str:
    user_text_l = (user_text or "").lower()
    if "hint" in user_text_l or "help" in user_text_l:
        base = "Here’s a nudge"
        if problem_title:
            base += f" for **{problem_title}**"
        tips = [
            "- Start by writing plain HTML structure, then add minimal CSS.",
            "- Make your JS small and event-driven; wire one click handler first.",
            "- Test incrementally in the preview before adding more code."
        ]
        if problem_statement:
            tips.insert(0, f"- Restate the goal: {problem_statement}")
        return base + ":\n" + "\n".join(tips)

    if "why" in user_text_l and ("not work" in user_text_l or "doesn" in user_text_l):
        return ("Common causes: missing element IDs, running JS before DOM exists, "
                "CSS specificity (missing class), or sandboxed iframe blocking external scripts. "
                "Try: put JS at the end of <body>, query by correct selector, and log errors in console.")

    # Default: short reflective echo with an action suggestion
    return (f"I hear: “{user_text.strip()}”. If you share your current HTML snippet or the selector you’re using, "
            "I can suggest a one-line fix to try next.")

# --- REST fallback (non-stream) ---
class ChatIn(BaseModel):
    message: str
    problem_id: Optional[int] = None
    problem_title: Optional[str] = None
    problem_statement: Optional[str] = None
    thread_id: Optional[str] = None  # for future multi-thread

class ChatOut(BaseModel):
    reply: str

@router.post("/api/chat", response_model=ChatOut)
def chat_rest(payload: ChatIn):
    reply = simple_bot_reply(payload.message, payload.problem_title, payload.problem_statement)
    return ChatOut(reply=reply)

# --- WebSocket (stream-ish) ---
@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            message = data.get("message", "")
            problem_title = data.get("problem_title")
            problem_statement = data.get("problem_statement")
            reply = simple_bot_reply(message, problem_title, problem_statement)

            # fake token streaming by words
            for tok in reply.split(" "):
                await ws.send_json({"type": "token", "text": tok + " "})
                await asyncio.sleep(0.015)  # small delay to feel like streaming
            await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        # client closed
        return
    except Exception as e:
        await ws.send_json({"type": "error", "error": str(e)})
        await ws.close()
