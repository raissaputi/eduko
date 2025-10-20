# app/routers/submissions.py
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, json, time, re

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

class FESubmitIn(BaseModel):
    session_id: str = Field(..., min_length=3)
    problem_id: str = Field(..., min_length=1)
    code: str = Field(...)

def _attempt_index(dirpath: str) -> int:
    os.makedirs(dirpath, exist_ok=True)
    # find largest attempt-<n>.html
    mx = 0
    pat = re.compile(r"attempt-(\d+)\.html$")
    for name in os.listdir(dirpath):
        m = pat.search(name)
        if m:
            mx = max(mx, int(m.group(1)))
    return mx + 1

@router.post("/fe")
def submit_fe(payload: FESubmitIn):
    base = f"data/sessions/{payload.session_id}/submissions/{payload.problem_id}"
    os.makedirs(base, exist_ok=True)
    attempt_no = _attempt_index(base)
    html_path = os.path.join(base, f"attempt-{attempt_no}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(payload.code)

    meta = {
        "ts": int(time.time() * 1000),
        "attempt_no": attempt_no,
        "session_id": payload.session_id,
        "problem_id": payload.problem_id,
        "bytes": len(payload.code),
    }
    with open(os.path.join(base, "meta.jsonl"), "a", encoding="utf-8") as mf:
        mf.write(json.dumps(meta) + "\n")

    return {"ok": True, "attempt_no": attempt_no}
