# survey.py
from fastapi import APIRouter
from pydantic import BaseModel
import time
from app.services.storage import get_storage

router = APIRouter(prefix="/api/survey", tags=["survey"])
storage = get_storage()

class SurveyIn(BaseModel):
    session_id: str
    answers: dict   # arbitrary key/values from your form

@router.post("/submit")
def submit_survey(payload: SurveyIn):
    survey_path = f"sessions/{payload.session_id}/survey.json"
    storage.write_json(survey_path, {
        "ts": int(time.time()*1000),
        "answers": payload.answers
    })
    return {"ok": True}
