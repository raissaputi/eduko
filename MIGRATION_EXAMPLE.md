# Migration Example: Converting sessions.py to Cloud Storage

## Before (Local File System)

```python
# app/routers/sessions.py
from pathlib import Path
import os, json

DATA_ROOT = Path("data") / "sessions"

def _session_path(session_id: str) -> Path:
    return DATA_ROOT / session_id / "session.json"

def write_session_manifest(session_id: str, data: dict) -> None:
    path = _session_path(session_id)
    os.makedirs(path.parent, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def read_session_manifest(session_id: str) -> dict | None:
    path = _session_path(session_id)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

@router.post("/{session_id}/recording")
async def upload_recording(
    session_id: str,
    recording: UploadFile = File(...),
    problem_id: str = Form(...)
):
    session_dir = DATA_ROOT / session_id
    os.makedirs(session_dir, exist_ok=True)
    
    filename = f"recording_{problem_id}_{int(time.time() * 1000)}.webm"
    file_path = session_dir / filename
    
    content = await recording.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    return {"ok": True, "path": str(file_path)}
```

---

## After (Cloud Storage)

```python
# app/routers/sessions.py
from app.services import storage
import time

def _session_path(session_id: str) -> str:
    return f"sessions/{session_id}/session.json"

def write_session_manifest(session_id: str, data: dict) -> None:
    path = _session_path(session_id)
    storage.write_json(path, data)  # Auto-creates parent dirs, works with local or S3

def read_session_manifest(session_id: str) -> dict | None:
    path = _session_path(session_id)
    if not storage.exists(path):
        return None
    try:
        return storage.read_json(path)
    except Exception:
        return None

@router.post("/{session_id}/recording")
async def upload_recording(
    session_id: str,
    recording: UploadFile = File(...),
    problem_id: str = Form(...)
):
    filename = f"recording_{problem_id}_{int(time.time() * 1000)}.webm"
    path = f"sessions/{session_id}/{filename}"
    
    content = await recording.read()
    result_path = storage.write_file(path, content)  # Returns s3:// URL or local path
    
    return {
        "ok": True,
        "path": result_path,
        "size": len(content)
    }
```

---

## Key Changes

1. **Import**: `from app.services import storage`
2. **Paths**: Use strings instead of `Path` objects
   - Before: `Path("data") / "sessions" / session_id`
   - After: `f"sessions/{session_id}"`
3. **Write**: `storage.write_file()` / `storage.write_json()`
4. **Read**: `storage.read_file()` / `storage.read_json()`
5. **Check**: `storage.exists()`
6. **No mkdir**: Storage layer handles directory creation

---

## Benefits

✅ **Transparent**: Same code works for local dev and cloud production  
✅ **Simple**: One environment variable switches backends  
✅ **Type-safe**: Abstract interface ensures consistency  
✅ **Testable**: Easy to mock storage in unit tests  
✅ **Future-proof**: Can add GCS, Azure Blob, etc. without changing routers  

---

## Testing

```python
# Local dev: uses data/ folder
STORAGE_BACKEND=local docker-compose up

# Staging: uses S3 test bucket
STORAGE_BACKEND=s3 S3_BUCKET=eduko-staging docker-compose up

# Production: uses S3 prod bucket
STORAGE_BACKEND=s3 S3_BUCKET=eduko-research-data docker-compose up
```
