# app/services/llm.py
import os
import asyncio
from typing import AsyncGenerator, Dict, List, Optional, Any

import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "models/gemma-3-4b-it")  # any valid model id

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")

genai.configure(api_key=GEMINI_API_KEY)

# Chat message schema (internal): { role, text?, images? }
ChatMsg = Dict[str, Any]

def _parse_data_url(data_url: str) -> Optional[Dict[str, str]]:
    """Parse a data URL like 'data:image/png;base64,AAAA' -> {mime, data}.
    Returns None if not a data URL.
    """
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return None
    try:
        header, b64 = data_url.split(",", 1)
        # header example: data:image/png;base64
        mime = header[len("data:"):].split(";")[0] or "application/octet-stream"
        return {"mime": mime, "data": b64}
    except Exception:
        return None

def build_prompt(message: str,
                 _problem_title: Optional[str],
                 _problem_statement: Optional[str],
                 images: Optional[List[str]] = None) -> List[ChatMsg]:
    """RAW: user text + optional inline images (data URLs).
    We keep a simple internal structure and convert to Gemini parts later.
    """
    imgs: List[Dict[str, str]] = []
    for it in (images or []):
        parsed = _parse_data_url(it)
        if parsed:
            imgs.append(parsed)
    return [{"role": "user", "text": message, "images": imgs}]

class GeminiProvider:
    def __init__(self, model: str):
        self.model_name = model

    def _to_chat(self, messages: List[ChatMsg]):
        """Convert internal ChatMsg list to Gemini's chat parts structure.
        Supports text + inline image data.
        """
        converted = []
        for m in messages:
            role = "user" if m.get("role") != "assistant" else "model"
            parts: List[Any] = []
            if txt := m.get("text"):
                parts.append(txt)
            for img in m.get("images", []) or []:
                parts.append({
                    "inline_data": {
                        "mime_type": img.get("mime", "image/png"),
                        "data": img.get("data", ""),
                    }
                })
            # Fallback if no parts: still send empty string to avoid errors
            if not parts:
                parts = [""]
            converted.append({"role": role, "parts": parts})
        return converted

    async def stream(self, messages: List[ChatMsg]) -> AsyncGenerator[str, None]:
        def _sync_iter():
            model = genai.GenerativeModel(self.model_name)
            # If single user turn without images → send string for efficiency
            if (
                len(messages) == 1 and messages[0].get("role") == "user"
                and not messages[0].get("images") and messages[0].get("text")
            ):
                resp = model.generate_content(messages[0]["text"], stream=True)
            else:
                resp = model.generate_content(self._to_chat(messages), stream=True)
            for ev in resp:
                try:
                    if chunk := getattr(ev, "text", None):
                        yield chunk
                except ValueError:
                    # Skip any problematic chunks but continue streaming
                    continue

        loop = asyncio.get_event_loop()
        q: asyncio.Queue[str] = asyncio.Queue()

        def producer():
            try:
                for tok in _sync_iter():
                    asyncio.run_coroutine_threadsafe(q.put(tok), loop)
            finally:
                asyncio.run_coroutine_threadsafe(q.put("__DONE__"), loop)

        import threading
        threading.Thread(target=producer, daemon=True).start()

        while True:
            tok = await q.get()
            if tok == "__DONE__":
                break
            yield tok

    async def complete(self, messages: List[ChatMsg]) -> str:
        model = genai.GenerativeModel(self.model_name)
        if (
            len(messages) == 1 and messages[0].get("role") == "user"
            and not messages[0].get("images") and messages[0].get("text")
        ):
            resp = model.generate_content(messages[0]["text"])
        else:
            resp = model.generate_content(self._to_chat(messages))
        return getattr(resp, "text", "") or ""

provider = GeminiProvider(LLM_MODEL)
