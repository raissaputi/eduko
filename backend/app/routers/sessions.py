# app/routers/sessions.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from datetime import datetime, timezone
from pathlib import Path
import os, json, uuid, time
from typing import Optional

router = APIRouter(prefix="/api/session", tags=["session"])

DATA_ROOT = Path("data") / "sessions"


# ---------- Models ----------

class StartIn(BaseModel):
    name: str
    test: str  # "fe" or "dv"
    consent: Optional[bool] = False


# ---------- Helpers ----------

def _session_dir(session_id: str) -> Path:
    return DATA_ROOT / session_id


def _session_path(session_id: str) -> Path:
    return _session_dir(session_id) / "session.json"


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_session_manifest(session_id: str) -> dict | None:
    """Return manifest dict or None if not found."""
    path = _session_path(session_id)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_session_manifest(session_id: str, data: dict) -> None:
    path = _session_path(session_id)
    os.makedirs(path.parent, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def ensure_session_test_type(session_id: str, intended_type: str) -> dict:
    """
    Ensure the session exists and matches the intended test type.
    - If missing: create it and set the test_type.
    - If exists but mismatched: raise HTTP 409.
    """
    existing = read_session_manifest(session_id)
    if not existing:
        # initialize new manifest on first use
        meta = {
            "session_id": session_id,
            "test_type": intended_type.lower(),
            "created_at": _utcnow_iso(),
            "finished_at": None,
            "name": None,
        }
        write_session_manifest(session_id, meta)
        return meta

    # already exists — enforce lock
    locked = existing.get("test_type")
    if locked and locked.lower() != intended_type.lower():
        raise HTTPException(
            status_code=409,
            detail=f"Session locked to test_type={locked.upper()}, cannot use {intended_type.upper()} routes."
        )
    return existing


# ---------- Routes ----------

@router.post("/start")
def start_session(data: StartIn):
    """
    Create a new participant session.
    This locks the session to a single test_type ("fe" or "dv").
    """
    sid = str(uuid.uuid4())
    base = _session_dir(sid)
    os.makedirs(base, exist_ok=True)

    manifest = {
        "session_id": sid,
        "name": data.name,
        "test_type": data.test.lower(),
        "consent": bool(data.consent),
        "created_at": _utcnow_iso(),
        "finished_at": None,
    }
    write_session_manifest(sid, manifest)

    return {"session_id": sid, "test_type": data.test.lower()}


@router.get("/{session_id}")
def get_session(session_id: str):
    """Return the manifest for a given session."""
    manifest = read_session_manifest(session_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Session not found")
    return manifest


@router.post("/{session_id}/finish")
def finish_session(session_id: str):
    """Mark session finished."""
    manifest = read_session_manifest(session_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Session not found")

    manifest["finished_at"] = _utcnow_iso()
    write_session_manifest(session_id, manifest)
    return {"status": "ok", "finished_at": manifest["finished_at"]}


@router.post("/{session_id}/recording")
async def upload_recording(
    session_id: str,
    recording: UploadFile = File(...),
    problem_id: str = Form(...)
):
    """Upload a complete screen recording for a problem"""
    session_dir = _session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    # Save with problem_id and timestamp in filename
    timestamp = int(time.time() * 1000)
    filename = f"recording_{problem_id}_{timestamp}.webm"
    file_path = session_dir / filename
    
    content = await recording.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    return {
        "ok": True,
        "path": str(file_path),
        "size": len(content),
        "filename": filename
    }
