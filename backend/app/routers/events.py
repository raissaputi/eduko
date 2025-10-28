# app/routers/events.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Any, Dict, Optional
import time

from app.services.writer import append_event, append_jsonl_many
from app.routers.sessions import ensure_session_test_type

router = APIRouter(prefix="/api/events", tags=["events"])


# ---------- Models ----------

class EventIn(BaseModel):
    session_id: str
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    client_ts: Optional[int] = None
    test_type: Optional[str] = None  # optional for first auto-lock


class EventsBulkIn(BaseModel):
    session_id: str
    events: List[EventIn]


# ---------- Routes ----------

@router.post("")
async def log_single(event: EventIn):
    """
    Accept a single telemetry event from the frontend.
    Automatically ensures session type (fe/dv).
    """
    # Determine intended test type
    intended_type = event.test_type or _guess_type_from_event(event.event_type)
    if not intended_type:
        intended_type = "fe"  # default fallback, safer than None

    ensure_session_test_type(event.session_id, intended_type)

    record = {
        "event_type": event.event_type,
        "payload": event.payload or {},
        "client_ts": event.client_ts or int(time.time() * 1000),
        "session_id": event.session_id,
    }

    append_event(event.session_id, record)
    return {"status": "ok"}


@router.post("/bulk")
async def log_bulk(body: EventsBulkIn):
    """
    Accept a batch of telemetry events.
    The first valid test_type locks the session.
    """
    if not body.events:
        raise HTTPException(status_code=400, detail="Empty events list")

    # Use first event to infer type
    first = body.events[0]
    intended_type = first.test_type or _guess_type_from_event(first.event_type)
    if not intended_type:
        intended_type = "fe"

    ensure_session_test_type(body.session_id, intended_type)

    items = []
    for ev in body.events:
        rec = {
            "event_type": ev.event_type,
            "payload": ev.payload or {},
            "client_ts": ev.client_ts or int(time.time() * 1000),
            "session_id": body.session_id,
        }
        items.append(rec)

    append_jsonl_many(_events_path(body.session_id), items)
    return {"status": "ok", "count": len(items)}


# ---------- Internal helpers ----------

from pathlib import Path
from app.services.writer import raw_dir

def _events_path(session_id: str) -> Path:
    return raw_dir(session_id) / "events.jsonl"


def _guess_type_from_event(name: str) -> Optional[str]:
    """
    Light heuristic to guess FE or DV intent based on event type.
    If you know the session flow always starts with /api/problems/:testType,
    this won't matter much.
    """
    n = name.lower()
    if "dv" in n:
        return "dv"
    if "fe" in n:
        return "fe"
    return None
