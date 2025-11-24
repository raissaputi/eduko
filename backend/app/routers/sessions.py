# app/routers/sessions.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from datetime import datetime, timezone
from pathlib import Path
import os, json, uuid, time
from typing import Optional
from app.services.storage import get_storage

router = APIRouter(prefix="/api/sessions", tags=["session"])
storage = get_storage()

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
    path = f"sessions/{session_id}/session.json"
    if not storage.exists(path):
        return None
    try:
        return storage.read_json(path)
    except Exception:
        return None


def write_session_manifest(session_id: str, data: dict) -> None:
    path = f"sessions/{session_id}/session.json"
    storage.write_json(path, data)


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
    # Use the filename from frontend (already formatted with part number)
    filename = recording.filename or f"recording_{problem_id}_{int(time.time() * 1000)}.webm"
    
    # Save in subfolder per problem: recording_{problem_id}/
    path = f"sessions/{session_id}/recording_{problem_id}/{filename}"
    
    content = await recording.read()
    storage_path = storage.write_file(path, content)
    
    return {
        "ok": True,
        "path": storage_path,
        "size": len(content),
        "filename": filename
    }


@router.post("/{session_id}/compile")
def compile_session(session_id: str):
    """Trigger human-readable log compilation for a session"""
    from app.services.compile_human import compile_session_log
    try:
        # Run compile in background (this might take a few seconds)
        import threading
        def run_compile():
            try:
                compile_session_log(session_id)
            except Exception as e:
                print(f"Compile error for session {session_id}: {e}")
        
        thread = threading.Thread(target=run_compile)
        thread.start()
        
        return {"ok": True, "message": "Compile started in background"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
