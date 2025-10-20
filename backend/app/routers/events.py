from fastapi import APIRouter
from pydantic import BaseModel
import os, json

router = APIRouter(prefix="/api/events", tags=["events"])

class BatchIn(BaseModel):
    events: list[dict]

@router.post("/batch")
def batch(payload: BatchIn):
    count = 0
    for e in payload.events:
        sid = e.get("session_id", "unknown")
        base = f"data/sessions/{sid}"
        os.makedirs(base, exist_ok=True)
        with open(f"{base}/events.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(e) + "\n")
        count += 1
    return {"ok": True, "count": count}
