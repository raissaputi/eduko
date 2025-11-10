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


# ---------- Paths & FS helpers ----------

DATA_ROOT = Path("data")  # project-level data folder


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def session_dir(session_id: str) -> Path:
    # no PII in path; just the opaque session id
    return DATA_ROOT / "sessions" / session_id


def problem_dir(session_id: str, problem_id: str | int) -> Path:
    return session_dir(session_id) / "problems" / str(problem_id)


def raw_dir(session_id: str) -> Path:
    return session_dir(session_id) / "raw"


def runs_dir(session_id: str, problem_id: str | int) -> Path:
    return problem_dir(session_id, problem_id) / "runs"


def submit_dir(session_id: str, problem_id: str | int) -> Path:
    return problem_dir(session_id, problem_id) / "submit"


def diffs_dir(session_id: str, problem_id: str | int) -> Path:
    return problem_dir(session_id, problem_id) / "diffs"


# ---------- JSONL writer ----------

def append_jsonl(path: Path, obj: Dict[str, Any]) -> None:
    """Append a single JSON object as a line (UTF-8). Ensure parent dirs exist."""
    ensure_dir(path.parent)
    # ensure server_ts and event_id
    obj = dict(obj)
    obj.setdefault("server_ts", utc_now_iso())
    obj.setdefault("event_id", str(uuid4()))
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False))
        f.write("\n")


def append_jsonl_many(path: Path, items: Iterable[Dict[str, Any]]) -> None:
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as f:
        for obj in items:
            obj = dict(obj)
            obj.setdefault("server_ts", utc_now_iso())
            obj.setdefault("event_id", str(uuid4()))
            f.write(json.dumps(obj, ensure_ascii=False))
            f.write("\n")


# ---------- Simple text/file writers ----------

def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        f.write(text)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- Hashing (for clipboard samples, etc.) ----------

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------- Code snapshot helpers ----------

_RUN_DIR_RE = re.compile(r"^run_(\d{4})$")


def next_run_index(runs_root: Path) -> int:
    """Find next integer index for run_XXXX folders."""
    if not runs_root.exists():
        return 1
    max_idx = 0
    for p in runs_root.iterdir():
        if p.is_dir():
            m = _RUN_DIR_RE.match(p.name)
            if m:
                max_idx = max(max_idx, int(m.group(1)))
    return max_idx + 1


def save_run_snapshot(session_id: str,
                      problem_id: str | int,
                      code_html: str,
                      index: Optional[int] = None) -> Path:
    """
    Save a 'Run ▶' snapshot under:
      data/sessions/<sid>/problems/<pid>/runs/run_0001/code.html
    Also writes a small meta.json with timestamps and code length.
    Returns the directory path for this run.
    """
    root = runs_dir(session_id, problem_id)
    ensure_dir(root)

    run_idx = index if index is not None else next_run_index(root)
    run_name = f"run_{run_idx:04d}"
    run_path = root / run_name
    ensure_dir(run_path)

    code_path = run_path / "code.html"
    write_text(code_path, code_html)

    meta = {
        "server_ts": utc_now_iso(),
        "run_index": run_idx,
        "code_len": len(code_html),
        "kind": "run",
    }
    write_json(run_path / "meta.json", meta)

    return run_path


def save_submit_final(session_id: str,
                      problem_id: str | int,
                      code_html: str,
                      extra_meta: Optional[Dict[str, Any]] = None) -> Path:
    """
    Save final submission under:
      data/sessions/<sid>/problems/<pid>/submit/final_code.html
    and meta.json with any extra metadata.
    """
    root = submit_dir(session_id, problem_id)
    ensure_dir(root)

    code_path = root / "final_code.html"
    write_text(code_path, code_html)

    meta = {
        "server_ts": utc_now_iso(),
        "code_len": len(code_html),
        "kind": "submit",
    }
    if extra_meta:
        meta.update(extra_meta)

    write_json(root / "meta.json", meta)
    return root


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
                           idx_to: int) -> Path:
    """
    Save a unified diff file under:
      data/sessions/<sid>/problems/<pid>/diffs/0001_to_0002.patch
    """
    root = diffs_dir(session_id, problem_id)
    ensure_dir(root)
    name = f"{idx_from:04d}_to_{idx_to:04d}.patch"
    path = root / name
    diff_txt = unified_diff(prev_code, next_code, f"run_{idx_from:04d}", f"run_{idx_to:04d}")
    write_text(path, diff_txt)
    return path


# ---------- Event log convenience ----------

def append_event(session_id: str, record: Dict[str, Any]) -> None:
    """
    Append a telemetry record to:
      data/sessions/<sid>/raw/events.jsonl
    This does not enforce schema; caller should supply proper fields.
    """
    events_path = raw_dir(session_id) / "events.jsonl"
    append_jsonl(events_path, record)


def append_chat_raw(session_id: str, record: Dict[str, Any]) -> None:
    """
    Append a raw chat turn/response to:
      data/sessions/<sid>/problems/<problem_id>/chat.jsonl
    If no problem_id is specified, stores in:
      data/sessions/<sid>/raw/chat.jsonl
    """
    problem_id = record.get("problem_id")
    if problem_id:
        # Store under problems/<pid>/chat.jsonl
        base_dir = raw_dir(session_id).parent / "problems" / str(problem_id)
        base_dir.mkdir(parents=True, exist_ok=True)
        chat_path = base_dir / "chat.jsonl"
    else:
        # Fallback to raw/chat.jsonl for chats without problem context
        chat_path = raw_dir(session_id) / "chat.jsonl"
    append_jsonl(chat_path, record)
