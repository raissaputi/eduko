# submissions_dv.py
from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time

router = APIRouter(prefix="/api/submissions", tags=["submissions-dv"])

class DVSubmit(BaseModel):
    session_id: str
    problem_id: str
    code: str   # user’s matplotlib code (we’ll just store it for now)

@router.post("/dv")
def submit_dv(payload: DVSubmit):
    base = f"data/sessions/{payload.session_id}/submissions/dv-{payload.problem_id}"
    os.makedirs(base, exist_ok=True)

    # find next attempt number
    attempt_no = 1
    while os.path.exists(f"{base}/attempt-{attempt_no}.py"):
        attempt_no += 1

    py_path = f"{base}/attempt-{attempt_no}.py"
    meta_path = f"{base}/meta.jsonl"

    with open(py_path, "w", encoding="utf-8") as f:
        f.write(payload.code)

    meta = {
        "ts": int(time.time()*1000),
        "problem_id": payload.problem_id,
        "attempt_no": attempt_no,
        "bytes": len(payload.code),
        "path": py_path
    }
    with open(meta_path, "a", encoding="utf-8") as mf:
        mf.write(json.dumps(meta) + "\n")

    # optional: append a human line (nice for quick audits)
    with open(f"data/sessions/{payload.session_id}/events.pretty.log", "a", encoding="utf-8") as pf:
        pf.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] "
                 f"{payload.session_id} submitted DV code — saved to {py_path} (attempt {attempt_no}).\n")

    return {"ok": True, "attempt_no": attempt_no, "path": py_path}
