from fastapi import APIRouter
from pydantic import BaseModel
import os, json, uuid

router = APIRouter(prefix="/api/session", tags=["session"])

class StartIn(BaseModel):
    name: str
    test: str  # "fe" or "dv"

@router.post("/start")
def start_session(data: StartIn):
    sid = str(uuid.uuid4())
    base = f"data/sessions/{sid}"
    os.makedirs(base, exist_ok=True)
    with open(f"{base}/meta.json", "w") as f:
        json.dump({"session_id": sid, "name": data.name, "test": data.test}, f)
    return {"session_id": sid}
