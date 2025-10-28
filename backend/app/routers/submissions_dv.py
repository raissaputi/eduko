# app/routers/submissions_dv.py
from fastapi import APIRouter
from pydantic import BaseModel
import time

from app.services.writer import save_submit_final, append_event
from app.routers.sessions import ensure_session_test_type

router = APIRouter(prefix="/api/submissions", tags=["submissions-dv"])


# ---------- Models ----------

class DVSubmissionPayload(BaseModel):
    session_id: str
    problem_id: str
    code: str


# ---------- DV Final Submission ----------

@router.post("/dv")
async def submit_dv(payload: DVSubmissionPayload):
    """
    Save Data Visualization (DV) final submission and log it.
    Each participant is locked to test_type='dv'.
    """
    ensure_session_test_type(payload.session_id, "dv")

    save_submit_final(payload.session_id, payload.problem_id, payload.code, {"kind": "dv"})

    append_event(payload.session_id, {
        "event_type": "submission_saved_dv",
        "payload": {
            "problem_id": payload.problem_id,
            "bytes": len(payload.code),
            "kind": "dv",
        },
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok"}
