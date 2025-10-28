# app/services/compile_human.py
"""
Compile human-readable logs from JSONL event files.
- Produces: log.txt (full session) + log_problem_<id>.txt per problem.
Usage:
    python -m app.services.compile_human <session_id>
    python -m app.services.compile_human all
"""

from __future__ import annotations
import json
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple


DATA_ROOT = Path("data/sessions")


# ---------- Public API ----------

def compile_session_log(session_id: str, split_by_problem: bool = True) -> Tuple[Path, Dict[str, Path]]:
    """
    Build a readable full log for a session and (optionally) per-problem logs.
    Returns (full_log_path, {problem_id: path})
    """
    base = DATA_ROOT / session_id
    src = base / "raw" / "events.jsonl"
    dst = base / "log.txt"

    if not src.exists():
        print(f"[!] No events.jsonl found for {session_id}")
        return dst, {}

    events = _read_events_sorted(src)
    if not events:
        print(f"[!] No valid events parsed for {session_id}")
        return dst, {}

    lines: List[str] = []
    lines_with_pid: List[Tuple[str, Optional[str]]] = []

    for ev in events:
        line = _pretty_line(ev)
        pid = _extract_problem_id(ev) or _extract_problem_id_from_line(line)
        lines.append(line)
        lines_with_pid.append((line, pid))

    # write full log
    dst.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[✓] Compiled human log: {dst}")

    # split-by-problem
    per_paths: Dict[str, Path] = {}
    if split_by_problem:
        grouped: Dict[str, List[str]] = {}
        for line, pid in lines_with_pid:
            if not pid:
                # unscoped events go to a generic file if you like; skip by default
                continue
            grouped.setdefault(str(pid), []).append(line)

        for pid, plines in grouped.items():
            ppath = base / f"log_problem_{pid}.txt"
            ppath.write_text("\n".join(plines) + "\n", encoding="utf-8")
            per_paths[pid] = ppath
        if per_paths:
            ids = ", ".join(sorted(per_paths.keys(), key=lambda x: str(x)))
            print(f"[✓] Per-problem logs: {ids}")

    return dst, per_paths


# ---------- Internals ----------

def _read_events_sorted(src: Path) -> List[Dict[str, Any]]:
    """Read JSONL events, attach a fallback timestamp, and return time-sorted."""
    evs = []
    for line in src.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        # normalize timestamp
        ts = ev.get("client_ts")
        if isinstance(ts, (int, float)):
            ev["_ts"] = int(ts)
        else:
            ev["_ts"] = 0
        evs.append(ev)
    evs.sort(key=lambda e: e.get("_ts", 0))
    return evs


def _fmt_ts(ms: int) -> str:
    """HH:MM:SS (UTC) from milliseconds."""
    if not ms:
        return "??:??:??"
    sec = int(ms / 1000)
    dt = datetime.fromtimestamp(sec, tz=timezone.utc)
    return dt.strftime("%H:%M:%S")


def _pretty_line(ev: Dict[str, Any]) -> str:
    """Turn one raw event into a compact human-readable line."""
    etype = str(ev.get("event_type", "")).upper()
    payload = ev.get("payload") or {}
    ts = _fmt_ts(ev.get("_ts", 0))
    tail = _summarize_event(etype.lower(), payload)
    return f"[{ts}] {etype}{(' ' + tail) if tail else ''}".rstrip()


def _summarize_event(etype: str, p: Dict[str, Any]) -> str:
    """Short descriptor based on known events. Extend as needed."""
    if not isinstance(p, dict):
        return ""

    # Common FE / DV task events
    if etype in {"task_open", "task_enter"}:
        return f"problem={p.get('problem_id')}"
    if etype.startswith("code_change"):
        ln = p.get("len")
        pid = p.get("problem_id")
        return f"problem={pid} len={ln}" if pid is not None else f"len={ln}"
    if etype in {"run_click", "preview_refresh", "first_preview"}:
        return f"problem={p.get('problem_id')}"
    if etype in {"submit_click", "submit_final", "submit_sent"}:
        via = p.get("via")
        pid = p.get("problem_id")
        return f"problem={pid}" + (f" via={via}" if via else "")
    if etype.startswith("submission_saved"):
        pid = p.get("problem_id")
        b = p.get("bytes")
        return f"problem={pid} bytes={b}"
    if etype.startswith("chat_prompt"):
        q = str(p.get("prompt", ""))
        pid = p.get("problem_id")
        tail = f"prompt=\"{q[:50]}...\"" if q else "prompt"
        return (f"problem={pid} " if pid is not None else "") + tail
    if etype.startswith("chat_response"):
        pid = p.get("problem_id")
        out = p.get("tokens_out")
        return (f"problem={pid} " if pid is not None else "") + (f"tokens={out}" if out is not None else "response")
    if etype in {"task_leave"}:
        return f"problem={p.get('problem_id')}"

    # Fallback to key=value pairs (keep short)
    pairs = []
    for k, v in p.items():
        if isinstance(v, (dict, list)):
            continue
        pairs.append(f"{k}={v}")
    return " ".join(pairs)


def _extract_problem_id(ev: Dict[str, Any]) -> Optional[str]:
    """Try to extract a problem id from the event payload."""
    p = ev.get("payload")
    if not isinstance(p, dict):
        return None
    for key in ("problem_id", "pid", "problem"):
        if key in p and p[key] is not None:
            return str(p[key])
    return None


def _extract_problem_id_from_line(line: str) -> Optional[str]:
    """As a fallback, look for 'problem=<id>' in the already composed line."""
    token = "problem="
    if token not in line:
        return None
    try:
        seg = line.split(token, 1)[1]
        # stop at whitespace or end
        pid = seg.split()[0]
        # strip punctuation just in case
        return pid.strip(",.;:)]} ")
    except Exception:
        return None


# ---------- CLI ----------

def _compile_all() -> None:
    if not DATA_ROOT.exists():
        print(f"[!] No sessions dir: {DATA_ROOT}")
        return
    for sid_dir in sorted(p for p in DATA_ROOT.iterdir() if p.is_dir()):
        sid = sid_dir.name
        try:
            compile_session_log(sid, split_by_problem=True)
        except Exception as e:
            print(f"[x] Failed to compile {sid}: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python -m app.services.compile_human <session_id>")
        print("  python -m app.services.compile_human all")
        sys.exit(1)

    arg = sys.argv[1].strip().lower()
    if arg == "all":
        _compile_all()
    else:
        compile_session_log(arg, split_by_problem=True)
