# app/routers/submissions_fe.py
from fastapi import APIRouter
from pydantic import BaseModel
import time
from pathlib import Path

from app.services.writer import (
    save_submit_final,
    save_run_snapshot,
    save_diff_between_runs,
    append_event,
    raw_dir,
)
from app.routers.sessions import ensure_session_test_type

router = APIRouter(prefix="/api/submissions", tags=["submissions-fe"])


# ---------- Models ----------

class SubmissionPayload(BaseModel):
    session_id: str
    problem_id: str | int
    code: str


# ---------- Helper: get latest run for diff ----------

def _latest_run_code(session_id: str, problem_id: str) -> str | None:
    runs_root = raw_dir(session_id).parent / "problems" / str(problem_id) / "runs"
    if not runs_root.exists():
        return None
    all_runs = sorted(p for p in runs_root.iterdir() if p.is_dir())
    if not all_runs:
        return None
    latest = all_runs[-1]
    code_path = latest / "code.html"
    return code_path.read_text(encoding="utf-8") if code_path.exists() else None


# ---------- Final submission ----------

@router.post("/fe")
async def submit_fe(payload: SubmissionPayload):
    """
    Save FE task final submission and log it.
    Each participant is locked to test_type='fe'.
    """
    ensure_session_test_type(payload.session_id, "fe")

    save_submit_final(payload.session_id, payload.problem_id, payload.code)

    append_event(payload.session_id, {
        "event_type": "submission_saved",
        "payload": {
            "problem_id": payload.problem_id,
            "bytes": len(payload.code),
            "kind": "fe",
        },
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok"}


# ---------- Manual Run ▶ snapshot ----------

@router.post("/snapshots/fe")
async def snapshot_fe(payload: SubmissionPayload):
    """
    Save snapshot each time user clicks Run ▶.
    Saves code + diff (if previous run exists).
    """
    ensure_session_test_type(payload.session_id, "fe")

    prev_code = _latest_run_code(payload.session_id, payload.problem_id)
    run_path = save_run_snapshot(payload.session_id, payload.problem_id, payload.code)

    if prev_code:
        try:
            idx_to = int(run_path.name.split("_")[1])
            save_diff_between_runs(
                payload.session_id,
                payload.problem_id,
                prev_code,
                payload.code,
                idx_to - 1,
                idx_to,
            )
        except Exception:
            pass

    append_event(payload.session_id, {
        "event_type": "run_snapshot",
        "payload": {
            "problem_id": payload.problem_id,
            "bytes": len(payload.code),
            "kind": "fe",
        },
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok", "saved": run_path.name}
