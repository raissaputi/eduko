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
from app.services.storage import get_storage


DATA_ROOT = Path("data/sessions")
storage = get_storage()


# ---------- Public API ----------

def _compile_chat_file(chat_path: Path, out_path: Path) -> None:
    """Compile one chat.jsonl file into human readable format."""
    if not chat_path.exists():
        return
        
    lines = []
    # Read and sort all chats by timestamp
    chats = []
    with chat_path.open() as f:
        for line in f:
            try:
                chat = json.loads(line)
                chats.append(chat)
            except Exception:
                continue
    chats.sort(key=lambda x: x.get("client_ts", 0))
    
    # Process each chat
    for chat in chats:
        ts = _fmt_ts(chat.get("client_ts", 0))
        chat_id = chat.get("id", "unknown")
        problem = f" (Problem: {chat['problem_id']})" if chat.get("problem_id") else ""
        
        lines.extend([
            f"\n[{ts}] Chat {chat_id}{problem}",
            "User: " + chat.get("prompt", "(no prompt)"),
            "Assistant: " + chat.get("response", "(no response)"),
            ""
        ])
    
    # Write output if we have content
    if lines:
        out_path.write_text("\n".join(lines))

def compile_session_log(session_id: str, split_by_problem: bool = True) -> Tuple[Path, Dict[str, Path]]:
    """
    Build readable logs for a session:
    - Full event log (log.txt)
    - Per-problem event logs (log_problem_*.txt)
    - Full chat log (log_chat.txt)
    - Per-problem chat logs (log_chat_*.txt)
    - Paste content archive (log_pastes.txt)
    
    Returns (full_log_path, {problem_id: event_log_path})
    """
    base = DATA_ROOT / session_id
    events_path = f"sessions/{session_id}/raw/events.jsonl"
    dst = base / "log.txt"

    if not storage.exists(events_path):
        print(f"[!] No events.jsonl found for {session_id}")
        return dst, {}

    # Read events from storage
    events = []
    try:
        content = storage.read_text(events_path)
        for line in content.splitlines():
            if line.strip():
                try:
                    events.append(json.loads(line))
                except:
                    continue
    except Exception as e:
        print(f"[!] Failed to read events: {e}")
        return dst, {}
    
    events.sort(key=lambda x: x.get("client_ts", 0))
    if not events:
        print(f"[!] No valid events parsed for {session_id}")
        return dst, {}

    lines: List[str] = []
    lines_with_pid: List[Tuple[str, Optional[str]]] = []
    paste_entries: List[str] = []  # Full paste content archive
    paste_counter = 1
    current_problem: Optional[str] = None  # Track active problem context

    for ev in events:
        # Update current problem context when user enters a task
        if ev.get("event_type") in ["task_enter", "task_open"]:
            current_problem = _extract_problem_id(ev)
        # Handle paste events specially
        if ev.get("event_type") == "code_paste":
            paste_id = f"paste_{paste_counter:03d}"
            paste_counter += 1
            
            payload = ev.get("payload", {})
            content = payload.get("content", "")
            length = payload.get("len", 0)
            kind = payload.get("kind", "")
            cell_idx = payload.get("cell_index")
            
            # Use current problem context if not explicitly in payload
            pid = _extract_problem_id(ev) or current_problem
            
            # Add to main log with reference ID
            # Try multiple timestamp fields: client_ts, server_ts, _ts
            ts_ms = ev.get("client_ts") or ev.get("server_ts") or ev.get("_ts", 0)
            ts = _fmt_ts(ts_ms)
            cell_info = f" cell={cell_idx}" if cell_idx is not None else ""
            prob_info = f" problem={pid}" if pid else ""
            line = f"[{ts}] CODE_PASTE id={paste_id} len={length} kind={kind}{cell_info}{prob_info}"
            lines.append(line)
            lines_with_pid.append((line, pid))
            
            # Add full content to paste archive
            paste_entries.extend([
                f"\n{'='*60}",
                f"Paste ID: {paste_id}",
                f"Timestamp: {ts}",
                f"Length: {length} characters",
                f"Type: {kind}",
                f"Cell: {cell_idx if cell_idx is not None else 'N/A'}",
                f"Problem: {pid if pid else 'N/A'}",
                f"{'-'*60}",
                content,
                f"{'='*60}\n"
            ])
        else:
            line = _pretty_line(ev)
            pid = _extract_problem_id(ev) or _extract_problem_id_from_line(line)
            lines.append(line)
            lines_with_pid.append((line, pid))

    # write full log
    log_path = f"sessions/{session_id}/log.txt"
    storage.write_text(log_path, "\n".join(lines) + "\n")
    print(f"[✓] Compiled human log: {log_path}")
    
    # write paste archive if any
    if paste_entries:
        paste_path = f"sessions/{session_id}/log_pastes.txt"
        storage.write_text(paste_path, "\n".join(paste_entries))
        print(f"[✓] Compiled paste archive: {paste_path} ({paste_counter-1} pastes)")

    # split events by problem
    per_paths: Dict[str, Path] = {}
    if split_by_problem:
        grouped: Dict[str, List[str]] = {}
        for line, pid in lines_with_pid:
            if not pid:
                # unscoped events go to a generic file if you like; skip by default
                continue
            grouped.setdefault(str(pid), []).append(line)

        for pid, plines in grouped.items():
            problem_log_path = f"sessions/{session_id}/log_problem_{pid}.txt"
            storage.write_text(problem_log_path, "\n".join(plines) + "\n")
            per_paths[pid] = Path(problem_log_path)

        if per_paths:
            ids = ", ".join(sorted(per_paths.keys(), key=lambda x: str(x)))
            print(f"[✓] Per-problem event logs: {ids}")

    # compile chat logs - use storage abstraction for S3 compatibility
    problems_prefix = f"sessions/{session_id}/problems"
    try:
        # List subdirectories in problems/
        problem_dirs = storage.list_dir(problems_prefix)
        for problem_name in problem_dirs:
            if not problem_name.endswith('/'):
                continue
            problem_id = problem_name.rstrip('/')
            
            chat_file_path = f"{problems_prefix}/{problem_id}/chat.jsonl"
            if storage.exists(chat_file_path):
                try:
                    # Read chat content from storage
                    chat_content = storage.read_text(chat_file_path)
                    
                    # Parse and compile chats
                    lines = []
                    chats = []
                    for line in chat_content.splitlines():
                        try:
                            chat = json.loads(line)
                            chats.append(chat)
                        except:
                            continue
                    chats.sort(key=lambda x: x.get("client_ts", 0))
                    
                    for chat in chats:
                        ts = _fmt_ts(chat.get("client_ts", 0))
                        chat_id = chat.get("id", "unknown")
                        problem = f" (Problem: {chat['problem_id']})" if chat.get("problem_id") else ""
                        lines.extend([
                            f"\n[{ts}] Chat {chat_id}{problem}",
                            "User: " + chat.get("prompt", "(no prompt)"),
                            "Assistant: " + chat.get("response", "(no response)"),
                            ""
                        ])
                    
                    if lines:
                        out_path = f"sessions/{session_id}/log_chat_{problem_id}.txt"
                        storage.write_text(out_path, "\n".join(lines))
                        print(f"[✓] Compiled chat log for problem {problem_id}")
                except Exception as e:
                    print(f"[!] Failed to compile chat for {problem_id}: {e}")
    except Exception as e:
        print(f"[!] Failed to list problems directory: {e}")
    
    # compile general chats (without problem context)
    general_chat_path = f"sessions/{session_id}/raw/chat.jsonl"
    if storage.exists(general_chat_path):
        try:
            chat_content = storage.read_text(general_chat_path)
            lines = []
            chats = []
            for line in chat_content.splitlines():
                try:
                    chat = json.loads(line)
                    chats.append(chat)
                except:
                    continue
            chats.sort(key=lambda x: x.get("client_ts", 0))
            
            for chat in chats:
                ts = _fmt_ts(chat.get("client_ts", 0))
                chat_id = chat.get("id", "unknown")
                problem = f" (Problem: {chat['problem_id']})" if chat.get("problem_id") else ""
                lines.extend([
                    f"\n[{ts}] Chat {chat_id}{problem}",
                    "User: " + chat.get("prompt", "(no prompt)"),
                    "Assistant: " + chat.get("response", "(no response)"),
                    ""
                ])
            
            if lines:
                out_path = f"sessions/{session_id}/log_chat.txt"
                storage.write_text(out_path, "\n".join(lines))
                print(f"[✓] Compiled general chat log")
        except Exception as e:
            print(f"[!] Failed to compile general chat: {e}")

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
    # Try multiple timestamp fields: client_ts, server_ts, _ts
    ts_ms = ev.get("client_ts") or ev.get("server_ts") or ev.get("_ts", 0)
    ts = _fmt_ts(ts_ms)
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
        chat_id = p.get("chat_id", "")
        pid = p.get("problem_id")
        return f"problem={pid} chat={chat_id}" if pid else f"chat={chat_id}"
    if etype.startswith("chat_response"):
        chat_id = p.get("chat_id", "")
        pid = p.get("problem_id")
        return f"problem={pid} chat={chat_id}" if pid else f"chat={chat_id}"
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
