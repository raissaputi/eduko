# app/routers/submissions_dv.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
import json
from pathlib import Path

from app.services.writer import (
    save_submit_final, append_event, utc_now_iso, 
    problem_path, runs_path, submit_path, diffs_path,
    write_text, write_json
)
from app.services.storage import get_storage
from app.routers.sessions import ensure_session_test_type
from app.services.dv_runner import run_dv_code, run_dv_cells

storage = get_storage()

router = APIRouter(prefix="/api/submissions", tags=["submissions-dv"])


# ---------- Models ----------

class DVCodePayload(BaseModel):
    session_id: str
    problem_id: str
    code: str

class DVRunResponse(BaseModel):
    stdout: str
    stderr: str
    plot: str | None


# ---------- Notebook DV Models ----------

class DVNotebookCell(BaseModel):
    source: str

class DVNotebookPayload(BaseModel):
    session_id: str
    problem_id: str
    cells: list[DVNotebookCell]

class DVCellOutput(BaseModel):
    stdout: str
    stderr: str
    plot: str | None

class DVNotebookResponse(BaseModel):
    cells: list[DVCellOutput]


# ---------- Run DV Code ----------

@router.post("/run/dv", response_model=DVRunResponse)
async def run_dv(payload: DVCodePayload):
    """Run data visualization code and return the output."""
    ensure_session_test_type(payload.session_id, "dv")
    
    stdout, stderr, plot = run_dv_code(payload.code)
    
    # Log the run attempt
    append_event(payload.session_id, {
        "event_type": "dv_run",
        "payload": {
            "problem_id": payload.problem_id,
            "code_size": len(payload.code),
            "has_output": plot is not None,
            "has_error": bool(stderr),
        },
        "client_ts": int(time.time() * 1000),
    })
    
    if stderr and not plot:
        raise HTTPException(status_code=400, detail=stderr)
        
    return DVRunResponse(stdout=stdout, stderr=stderr, plot=plot)


# ---------- DV Final Submission (legacy single-code) ----------

@router.post("/dv")
async def submit_dv(payload: DVCodePayload):
    """
    Save Data Visualization (DV) final submission and log it.
    Each participant is locked to test_type='dv'.
    (Legacy route for single-code DV workbench)
    """
    ensure_session_test_type(payload.session_id, "dv")

    # Run the code one last time to get the final output
    stdout, stderr, plot = run_dv_code(payload.code)

    # Save both code and output
    save_submit_final(payload.session_id, payload.problem_id, payload.code, {
        "kind": "dv",
        "stdout": stdout,
        "stderr": stderr,
        "plot": plot
    })

    append_event(payload.session_id, {
        "event_type": "submission_saved_dv",
        "payload": {
            "problem_id": payload.problem_id,
            "code_size": len(payload.code),
            "has_output": plot is not None,
            "has_error": bool(stderr),
        },
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok"}


# ---------- DV Notebook Final Submission ----------

@router.post("/dvnb")
async def submit_dvnb(payload: DVNotebookPayload):
    """
    Save DV Notebook final submission as notebook.json (not HTML).
    Runs all cells one final time and saves outputs + code.
    """
    ensure_session_test_type(payload.session_id, "dv")

    code_cells = [c.source for c in payload.cells or []]
    
    # Try to run cells, but don't fail submission if execution fails
    try:
        results = run_dv_cells(code_cells)
    except Exception as e:
        # If execution fails, save cells with error output
        results = [
            {"stdout": "", "stderr": f"Execution error: {str(e)}", "plot": None}
            for _ in code_cells
        ]

    # Save notebook as JSON in submit folder (S3-compatible)
    submit_base = submit_path(payload.session_id, payload.problem_id)
    
    notebook_data = {
        "timestamp": utc_now_iso(),
        "kind": "dvnb_final",
        "cells": [
            {
                "source": c.source,
                "output": {
                    "stdout": results[i].get("stdout", ""),
                    "stderr": results[i].get("stderr", ""),
                    "plot": results[i].get("plot")
                }
            }
            for i, c in enumerate(payload.cells)
        ]
    }
    
    # Write notebook to storage
    notebook_file = f"{submit_base}/notebook.json"
    write_json(notebook_file, notebook_data)

    # Also save metadata
    meta_data = {
        "timestamp": utc_now_iso(),
        "problem_id": payload.problem_id,
        "cell_count": len(payload.cells),
        "total_code_size": sum(len(c.source) for c in payload.cells),
        "kind": "dvnb",
    }
    meta_file = f"{submit_base}/meta.json"
    write_json(meta_file, meta_data)

    append_event(payload.session_id, {
        "event_type": "submission_saved_dvnb",
        "payload": {
            "problem_id": payload.problem_id,
            "cell_count": len(payload.cells),
            "total_code_size": sum(len(c.source) for c in payload.cells),
        },
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok"}


# ---------- Run DV Notebook (multi-cell) ----------

@router.post("/run/dvnb", response_model=DVNotebookResponse)
async def run_dv_notebook(payload: DVNotebookPayload):
    """Run multiple DV cells with shared state and return per-cell outputs."""
    ensure_session_test_type(payload.session_id, "dv")

    code_cells = [c.source for c in payload.cells or []]
    results = run_dv_cells(code_cells)

    append_event(payload.session_id, {
        "event_type": "dv_run_nb",
        "payload": {
            "problem_id": payload.problem_id,
            "cells": len(code_cells)
        },
        "client_ts": int(time.time() * 1000),
    })

    return DVNotebookResponse(cells=[DVCellOutput(**r) for r in results])


# ---------- Helper: get next run index for notebook snapshots (S3-compatible) ----------

def _next_nb_run_index(session_id: str, problem_id: str) -> int:
    """Find next integer index for nb_run_XXXX folders using storage."""
    nb_runs_prefix = f"{problem_path(session_id, problem_id)}/nb_runs"
    try:
        items = storage.list_dir(nb_runs_prefix)
        max_idx = 0
        for item in items:
            if item.endswith('/') and item.startswith('nb_run_'):
                try:
                    idx = int(item.rstrip('/').split("_")[-1])
                    max_idx = max(max_idx, idx)
                except ValueError:
                    continue
        return max_idx + 1
    except:
        return 1


def _get_latest_nb_snapshot(session_id: str, problem_id: str) -> dict | None:
    """Get the most recent notebook snapshot for diff comparison using storage."""
    nb_runs_prefix = f"{problem_path(session_id, problem_id)}/nb_runs"
    try:
        items = storage.list_dir(nb_runs_prefix)
        all_runs = sorted([item.rstrip('/') for item in items if item.endswith('/') and item.startswith('nb_run_')])
        if not all_runs:
            return None
        
        latest = all_runs[-1]
        notebook_file = f"{nb_runs_prefix}/{latest}/notebook.json"
        if not storage.exists(notebook_file):
            return None
        
        return storage.read_json(notebook_file)
    except Exception:
        return None


def _compute_nb_diff(prev_snapshot: dict, current_cells: list) -> dict:
    """Compute diff statistics between two notebook states.
    Returns: {
      added_cells: int,
      removed_cells: int,
      modified_cells: list[int],  # indices of cells that changed
      total_changes: int
    }
    """
    prev_cells = prev_snapshot.get("cells", [])
    
    added = max(0, len(current_cells) - len(prev_cells))
    removed = max(0, len(prev_cells) - len(current_cells))
    modified = []
    
    # Check each cell for changes
    for i in range(min(len(prev_cells), len(current_cells))):
        prev_src = prev_cells[i].get("source", "")
        curr_src = current_cells[i].get("source", "")
        if prev_src != curr_src:
            modified.append(i)
    
    return {
        "added_cells": added,
        "removed_cells": removed,
        "modified_cells": modified,
        "total_changes": added + removed + len(modified)
    }


# ---------- Notebook snapshot ----------

class DVNotebookSnapshotPayload(BaseModel):
    session_id: str
    problem_id: str
    cells: list[DVNotebookCell]
    trigger: str  # "run_all" | "run_cell"
    cell_index: int | None = None  # which cell triggered (if run_cell)


@router.post("/snapshots/dvnb")
async def snapshot_dvnb(payload: DVNotebookSnapshotPayload):
    """
    Save notebook snapshot on every run, like FE snapshots.
    Captures full notebook state (all cells) with metadata and diffs.
    """
    ensure_session_test_type(payload.session_id, "dv")

    # Get previous snapshot for diff
    prev_snapshot = _get_latest_nb_snapshot(payload.session_id, payload.problem_id)
    
    run_idx = _next_nb_run_index(payload.session_id, payload.problem_id)
    run_folder = f"{problem_path(payload.session_id, payload.problem_id)}/nb_runs/nb_run_{run_idx:04d}"

    current_cells = [{"source": c.source} for c in payload.cells]
    
    # Compute diff if we have a previous snapshot
    diff_stats = None
    if prev_snapshot:
        diff_stats = _compute_nb_diff(prev_snapshot, current_cells)
        
        # Save diff summary as JSON
        diff_file = f"{run_folder}/diff.json"
        write_json(diff_file, {
            "from_run": prev_snapshot.get("run_index"),
            "to_run": run_idx,
            "timestamp": utc_now_iso(),
            **diff_stats
        })
        
        # Save human-readable changes log
        changes_text = []
        changes_text.append(f"Run #{run_idx:04d} - {utc_now_iso()}")
        changes_text.append(f"Trigger: {payload.trigger}")
        changes_text.append(f"Total cells: {len(current_cells)}\n")
        
        # Describe changes
        if diff_stats["total_changes"] == 0:
            changes_text.append("No changes since last run.")
        else:
            changes_text.append("Changes since last run:")
            if diff_stats["added_cells"] > 0:
                changes_text.append(f"  + Added {diff_stats['added_cells']} cell(s)")
            if diff_stats["removed_cells"] > 0:
                changes_text.append(f"  - Removed {diff_stats['removed_cells']} cell(s)")
            if diff_stats["modified_cells"]:
                changes_text.append(f"  ✎ Modified cells: {', '.join(f'[{i+1}]' for i in diff_stats['modified_cells'])}")
        
        changes_text.append("\n" + "=" * 60)
        changes_text.append("Cell contents:\n")
        
        # Show all cells with their content
        for i, cell in enumerate(current_cells):
            marker = ""
            if diff_stats["modified_cells"] and i in diff_stats["modified_cells"]:
                marker = " ✎ MODIFIED"
            elif prev_snapshot and i >= len(prev_snapshot.get("cells", [])):
                marker = " ✨ NEW"
            
            changes_text.append(f"Cell [{i + 1}]{marker}:")
            changes_text.append("-" * 40)
            changes_text.append(cell["source"] or "(empty)")
            changes_text.append("")
        
        # Write changes file
        changes_file = f"{run_folder}/changes.txt"
        write_text(changes_file, "\n".join(changes_text))

    # Save notebook state as JSON
    snapshot_data = {
        "timestamp": utc_now_iso(),
        "run_index": run_idx,
        "trigger": payload.trigger,
        "cell_index": payload.cell_index,
        "cells": current_cells,
    }
    
    snapshot_file = f"{run_folder}/notebook.json"
    write_json(snapshot_file, snapshot_data)

    # Log event with diff stats
    event_payload = {
        "problem_id": payload.problem_id,
        "run_index": run_idx,
        "trigger": payload.trigger,
        "cell_index": payload.cell_index,
        "total_cells": len(payload.cells),
    }
    if diff_stats:
        event_payload["diff"] = diff_stats
    
    append_event(payload.session_id, {
        "event_type": "dvnb_snapshot",
        "payload": event_payload,
        "client_ts": int(time.time() * 1000),
    })

    return {"status": "ok", "run_index": run_idx}
