# app/services/llm.py
import os
import asyncio
from typing import AsyncGenerator, Dict, List, Optional

import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "models/gemma-3-4b-it")  # any valid model id

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")

genai.configure(api_key=GEMINI_API_KEY)

# Messages are kept for compatibility, but we only pass the user's text through.
ChatMsg = Dict[str, str]

def build_prompt(message: str,
                 _problem_title: Optional[str],
                 _problem_statement: Optional[str]) -> List[ChatMsg]:
    """RAW: no system prompt, no context — only the user's message."""
    return [{"role": "user", "content": message}]

class GeminiProvider:
    def __init__(self, model: str):
        self.model_name = model

    def _to_chat(self, messages: List[ChatMsg]):
        # Expect a single user turn; if more are passed, we still forward them unchanged.
        return [{"role": ("user" if m["role"] != "assistant" else "model"),
                 "parts": [m["content"]]} for m in messages]

    async def stream(self, messages: List[ChatMsg]) -> AsyncGenerator[str, None]:
        def _sync_iter():
            model = genai.GenerativeModel(self.model_name)
            # RAW: send only the content (single string) if it’s a single user turn
            if len(messages) == 1 and messages[0]["role"] == "user":
                resp = model.generate_content(messages[0]["content"], stream=True)
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
        if len(messages) == 1 and messages[0]["role"] == "user":
            resp = model.generate_content(messages[0]["content"])
        else:
            resp = model.generate_content(self._to_chat(messages))
        return getattr(resp, "text", "") or ""

provider = GeminiProvider(LLM_MODEL)
