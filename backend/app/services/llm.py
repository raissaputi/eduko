# app/services/llm.py
import os
import asyncio
import time
from typing import AsyncGenerator, Dict, List, Optional, Any

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted

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

def build_messages(history: List[Dict[str, Any]],
                   images: Optional[List[str]] = None) -> List[ChatMsg]:
    """Build internal ChatMsg list from history turns.
    history: list of {role: 'user'|'assistant', text: str}
    images: optional list of data URLs for the last user turn (attachments)
    """
    msgs: List[ChatMsg] = []
    for h in history:
        role = 'user' if h.get('role') == 'user' else 'assistant'
        msgs.append({"role": role, "text": h.get("text", "")})
    if images:
        # attach images to final user message if the last role is user
        if msgs and msgs[-1].get("role") == "user":
            imgs: List[Dict[str, str]] = []
            for it in images:
                parsed = _parse_data_url(it)
                if parsed:
                    imgs.append(parsed)
            msgs[-1]["images"] = imgs
    return msgs

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
            max_retries = 3
            retry_count = 0
            
            while retry_count <= max_retries:
                try:
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
                    # Success - break out of retry loop
                    break
                    
                except ResourceExhausted as e:
                    retry_count += 1
                    if retry_count > max_retries:
                        # Give up and raise the original error
                        raise Exception(f"Rate limit exceeded after {max_retries} retries. Please try again in a minute.")
                    
                    # Extract retry delay from error message or use default
                    retry_delay = 20  # Default 20 seconds
                    error_str = str(e)
                    if "retry in" in error_str.lower():
                        try:
                            # Try to parse "Please retry in X.XXs"
                            import re
                            match = re.search(r'retry in ([\d.]+)s', error_str)
                            if match:
                                retry_delay = float(match.group(1)) + 1  # Add 1 sec buffer
                        except:
                            pass
                    
                    print(f"[LLM] Rate limit hit, retrying in {retry_delay}s (attempt {retry_count}/{max_retries})")
                    # Send a message to the user that we're retrying
                    yield f"⏳ Rate limit reached. Retrying in {int(retry_delay)} seconds... (attempt {retry_count}/{max_retries})\n\n"
                    time.sleep(retry_delay)

        loop = asyncio.get_event_loop()
        q: asyncio.Queue[str] = asyncio.Queue()

        def producer():
            try:
                for tok in _sync_iter():
                    asyncio.run_coroutine_threadsafe(q.put(tok), loop)
            except Exception as e:
                # Send error to queue so it gets raised in the async context
                asyncio.run_coroutine_threadsafe(q.put(f"__ERROR__:{str(e)}"), loop)
            finally:
                asyncio.run_coroutine_threadsafe(q.put("__DONE__"), loop)

        import threading
        threading.Thread(target=producer, daemon=True).start()

        while True:
            tok = await q.get()
            if tok == "__DONE__":
                break
            if isinstance(tok, str) and tok.startswith("__ERROR__:"):
                error_msg = tok[len("__ERROR__:"):]
                raise Exception(error_msg)
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
