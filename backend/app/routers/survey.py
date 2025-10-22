# survey.py
from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time

router = APIRouter(prefix="/api/survey", tags=["survey"])

class SurveyIn(BaseModel):
    session_id: str
    answers: dict   # arbitrary key/values from your form

@router.post("/submit")
def submit_survey(payload: SurveyIn):
    base = f"data/sessions/{payload.session_id}"
    os.makedirs(base, exist_ok=True)
    with open(f"{base}/survey.json", "w", encoding="utf-8") as f:
        json.dump({
            "ts": int(time.time()*1000),
            "answers": payload.answers
        }, f, ensure_ascii=False, indent=2)
    return {"ok": True}
