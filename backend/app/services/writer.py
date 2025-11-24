# app/services/writer.py
from __future__ import annotations

import json
import os
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Iterable
from uuid import uuid4
import difflib
import base64

from app.services.storage import get_storage

storage = get_storage()


# ---------- Paths & helpers ----------

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def session_path(session_id: str) -> str:
    """Return storage path for session"""
    return f"sessions/{session_id}"


def problem_path(session_id: str, problem_id: str | int) -> str:
    """Return storage path for problem"""
    return f"sessions/{session_id}/problems/{problem_id}"


def raw_path(session_id: str) -> str:
    """Return storage path for raw data"""
    return f"sessions/{session_id}/raw"


def runs_path(session_id: str, problem_id: str | int) -> str:
    """Return storage path for runs"""
    return f"sessions/{session_id}/problems/{problem_id}/runs"


def submit_path(session_id: str, problem_id: str | int) -> str:
    """Return storage path for submissions"""
    return f"sessions/{session_id}/problems/{problem_id}/submit"


def diffs_path(session_id: str, problem_id: str | int) -> str:
    """Return storage path for diffs"""
    return f"sessions/{session_id}/problems/{problem_id}/diffs"


# ---------- JSONL writer (S3-compatible) ----------

def append_jsonl(file_path: str, obj: Dict[str, Any]) -> None:
    """Append a single JSON object as a line (UTF-8) to storage."""
    obj = dict(obj)
    obj.setdefault("server_ts", utc_now_iso())
    obj.setdefault("event_id", str(uuid4()))
    
    # Read existing content
    try:
        existing = storage.read_text(file_path)
    except:
        existing = ""
    
    # Append new line
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    storage.write_text(file_path, existing + line)


def append_jsonl_many(file_path: str, items: Iterable[Dict[str, Any]]) -> None:
    """Append multiple JSON objects to storage."""
    try:
        existing = storage.read_text(file_path)
    except:
        existing = ""
    
    lines = []
    for obj in items:
        obj = dict(obj)
        obj.setdefault("server_ts", utc_now_iso())
        obj.setdefault("event_id", str(uuid4()))
        lines.append(json.dumps(obj, ensure_ascii=False))
    
    storage.write_text(file_path, existing + "\n".join(lines) + "\n")


# ---------- Simple text/file writers (S3-compatible) ----------

def write_text(file_path: str, text: str) -> None:
    """Write text to storage"""
    storage.write_text(file_path, text)


def write_json(file_path: str, data: Dict[str, Any]) -> None:
    """Write JSON to storage"""
    storage.write_json(file_path, data)


# ---------- Hashing (for clipboard samples, etc.) ----------

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------- Code snapshot helpers (S3-compatible) ----------

_RUN_DIR_RE = re.compile(r"^run_(\d{4})$")


def next_run_index(session_id: str, problem_id: str | int) -> int:
    """Find next integer index for run_XXXX folders using storage API."""
    runs_prefix = runs_path(session_id, problem_id)
    try:
        items = storage.list_dir(runs_prefix)
        max_idx = 0
        for item in items:
            if item.endswith('/'):
                folder_name = item.rstrip('/')
                m = _RUN_DIR_RE.match(folder_name)
                if m:
                    max_idx = max(max_idx, int(m.group(1)))
        return max_idx + 1
    except:
        return 1


def save_run_snapshot(session_id: str,
                      problem_id: str | int,
                      code_html: str,
                      index: Optional[int] = None) -> str:
    """
    Save a 'Run ▶' snapshot under:
      sessions/<sid>/problems/<pid>/runs/run_0001/code.html
    Also writes a small meta.json with timestamps and code length.
    Returns the storage path for this run.
    """
    run_idx = index if index is not None else next_run_index(session_id, problem_id)
    run_name = f"run_{run_idx:04d}"
    run_base = f"{runs_path(session_id, problem_id)}/{run_name}"

    # Write code
    code_path = f"{run_base}/code.html"
    write_text(code_path, code_html)

    # Write metadata
    meta = {
        "server_ts": utc_now_iso(),
        "run_index": run_idx,
        "code_len": len(code_html),
        "kind": "run",
    }
    write_json(f"{run_base}/meta.json", meta)

    return run_base


def save_submit_final(session_id: str,
                      problem_id: str | int,
                      code_html: str,
                      extra_meta: Optional[Dict[str, Any]] = None) -> str:
    """
    Save final submission under:
      sessions/<sid>/problems/<pid>/submit/final_code.html
    and meta.json with any extra metadata.
    Returns storage path.
    """
    submit_base = submit_path(session_id, problem_id)

    # Write code
    code_path = f"{submit_base}/final_code.html"
    write_text(code_path, code_html)

    # Write metadata
    meta = {
        "server_ts": utc_now_iso(),
        "code_len": len(code_html),
        "kind": "submit",
    }
    if extra_meta:
        meta.update(extra_meta)

    write_json(f"{submit_base}/meta.json", meta)
    return submit_base


# ---------- Diffs between runs ----------

def unified_diff(a_text: str, b_text: str, a_label: str = "prev", b_label: str = "next") -> str:
    """
    Compute a unified diff string between two strings.
    """
    a_lines = a_text.splitlines(keepends=True)
    b_lines = b_text.splitlines(keepends=True)
    diff = difflib.unified_diff(a_lines, b_lines, fromfile=a_label, tofile=b_label, n=3)
    return "".join(diff)


def save_diff_between_runs(session_id: str,
                           problem_id: str | int,
                           prev_code: str,
                           next_code: str,
                           idx_from: int,
                           idx_to: int) -> str:
    """
    Save a unified diff file under:
      sessions/<sid>/problems/<pid>/diffs/0001_to_0002.patch
    Returns storage path.
    """
    diffs_base = diffs_path(session_id, problem_id)
    name = f"{idx_from:04d}_to_{idx_to:04d}.patch"
    path = f"{diffs_base}/{name}"
    diff_txt = unified_diff(prev_code, next_code, f"run_{idx_from:04d}", f"run_{idx_to:04d}")
    write_text(path, diff_txt)
    return path


# ---------- Event log convenience (S3-compatible) ----------

def append_event(session_id: str, record: Dict[str, Any]) -> None:
    """
    Append a telemetry record to:
      sessions/<sid>/raw/events.jsonl
    This does not enforce schema; caller should supply proper fields.
    """
    path = f"sessions/{session_id}/raw/events.jsonl"
    append_jsonl(path, record)


def append_chat_raw(session_id: str, record: Dict[str, Any]) -> None:
    """
    Append a raw chat turn/response to:
      sessions/<sid>/problems/<problem_id>/chat.jsonl
    If no problem_id is specified, stores in:
      sessions/<sid>/raw/chat.jsonl
    """
    problem_id = record.get("problem_id")
    if problem_id:
        # Store under problems/<pid>/chat.jsonl
        path = f"sessions/{session_id}/problems/{problem_id}/chat.jsonl"
    else:
        # Fallback to raw/chat.jsonl for chats without problem context
        path = f"sessions/{session_id}/raw/chat.jsonl"
    append_jsonl(path, record)


# ---------- Chat image storage (S3-compatible) ----------

_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def save_chat_image_dataurl(session_id: str,
                            problem_id: Optional[str | int],
                            data_url: str) -> Optional[str]:
    """Save a data URL image into storage and return the storage path.
    Example return: "sessions/<sid>/problems/<pid>/chat_images/img_<uuid>.jpg"
    Returns None on failure.
    """
    try:
        if not data_url.startswith("data:"):
            return None
        header, b64 = data_url.split(",", 1)
        mime = header[len("data:"):].split(";")[0]
        ext = _EXT_BY_MIME.get(mime, ".bin")

        # target directory path
        if problem_id is not None:
            base_path = f"sessions/{session_id}/problems/{problem_id}/chat_images"
        else:
            base_path = f"sessions/{session_id}/raw/chat_images"

        # filename: img_<uuid>.<ext>
        name = f"img_{uuid4().hex}{ext}"
        full_path = f"{base_path}/{name}"
        
        # decode base64 and write to storage
        image_data = base64.b64decode(b64)
        storage.write_file(full_path, image_data)

        return full_path
    except Exception:
        return None
