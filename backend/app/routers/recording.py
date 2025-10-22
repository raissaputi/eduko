# recording.py
from fastapi import APIRouter, UploadFile, File, Form
import os, time

router = APIRouter(prefix="/api/recording", tags=["recording"])

@router.post("/start")
def start_recording(session_id: str = Form(...)):
    rec_dir = f"data/sessions/{session_id}/recordings"
    os.makedirs(rec_dir, exist_ok=True)
    # mark a new logical recording session if you wish
    with open(f"{rec_dir}/started.txt", "a") as f:
        f.write(str(int(time.time()*1000)) + "\n")
    return {"ok": True}

@router.post("/chunk")
async def upload_chunk(
    session_id: str = Form(...),
    part_no: int = Form(...),
    file: UploadFile = File(...)
):
    rec_dir = f"data/sessions/{session_id}/recordings"
    os.makedirs(rec_dir, exist_ok=True)
    out_path = f"{rec_dir}/part-{part_no:04d}.webm"
    with open(out_path, "wb") as out:
        out.write(await file.read())
    return {"ok": True, "path": out_path}

@router.post("/stop")
def stop_recording(session_id: str = Form(...)):
    rec_dir = f"data/sessions/{session_id}/recordings"
    os.makedirs(rec_dir, exist_ok=True)
    with open(f"{rec_dir}/stopped.txt", "a") as f:
        f.write(str(int(time.time()*1000)) + "\n")
    return {"ok": True}
