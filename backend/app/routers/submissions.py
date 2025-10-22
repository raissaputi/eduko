# app/routers/submissions.py
from fastapi import APIRouter
from pydantic import BaseModel, Field
import os, json, time, hashlib

# Final submissions go under this router:
router = APIRouter(prefix="/api/submissions", tags=["submissions"])

# Snapshots (per Run) get their own router so the path is /api/snapshots/fe
snapshots_router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

# ------------ Models ------------

class FEBase(BaseModel):
    session_id: str = Field(..., min_length=3)
    problem_id: str = Field(..., min_length=1)
    code: str = Field(...)

FESubmitIn = FEBase
FESnapshotIn = FEBase

# ------------ Helpers ------------

def _dir_for(session_id: str, problem_id: str) -> str:
    base = f"data/sessions/{session_id}/submissions/{problem_id}"
    os.makedirs(base, exist_ok=True)
    return base

def _now_ms() -> int:
    return int(time.time() * 1000)

def _sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def _append_meta(base: str, meta: dict) -> None:
    path = os.path.join(base, "meta.jsonl")
    with open(path, "a", encoding="utf-8") as mf:
        mf.write(json.dumps(meta) + "\n")

# ------------ Endpoints ------------

@router.post("/fe")
def submit_fe(payload: FESubmitIn):
    """
    FINAL SUBMIT for FE:
    Writes exactly one file: final.html
    Appends a 'kind: final' line to meta.jsonl
    """
    base = _dir_for(payload.session_id, payload.problem_id)

    out_path = os.path.join(base, "final.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload.code)

    ts = _now_ms()
    meta = {
        "ts": ts,
        "kind": "final",
        "filename": "final.html",
        "bytes": len(payload.code),
        "hash": _sha1(payload.code),
        "session_id": payload.session_id,
        "problem_id": payload.problem_id,
    }
    _append_meta(base, meta)

    return {"ok": True, "filename": "final.html", "ts": ts}


@snapshots_router.post("/fe")
def snapshot_fe(payload: FESnapshotIn):
    """
    SNAPSHOT for FE (every Run):
    Writes run-<ts>.html and appends 'kind: run' to meta.jsonl
    """
    base = _dir_for(payload.session_id, payload.problem_id)

    ts = _now_ms()
    filename = f"run-{ts}.html"
    out_path = os.path.join(base, filename)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload.code)

    meta = {
        "ts": ts,
        "kind": "run",
        "filename": filename,
        "bytes": len(payload.code),
        "hash": _sha1(payload.code),
        "session_id": payload.session_id,
        "problem_id": payload.problem_id,
    }
    _append_meta(base, meta)

    return {"ok": True, "filename": filename, "ts": ts}
