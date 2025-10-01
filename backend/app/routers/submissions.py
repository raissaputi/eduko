from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

class FESubmission(BaseModel):
    html: str
    css: str
    js: str

@router.post("/fe/run")
def run_fe(sub: FESubmission):
    # For now: just echo it back. Later: store, grade, sanitize.
    return {"ok": True, "html": sub.html, "css": sub.css, "js": sub.js}
