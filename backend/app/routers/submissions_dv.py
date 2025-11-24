# app/routers/submissions_dv.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
import json
from pathlib import Path

from app.services.writer import save_submit_final, append_event, ensure_dir, utc_now_iso, problem_dir
from app.routers.sessions import ensure_session_test_type
from app.services.dv_runner import run_dv_code, run_dv_cells

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

    # Save notebook as JSON in submit folder
    submit_folder = problem_dir(payload.session_id, payload.problem_id) / "submit"
    ensure_dir(submit_folder)
    
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
    
    notebook_path = submit_folder / "notebook.json"
    with notebook_path.open("w", encoding="utf-8") as f:
        json.dump(notebook_data, f, ensure_ascii=False, indent=2)

    # Also save metadata
    meta_path = submit_folder / "meta.json"
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump({
            "timestamp": utc_now_iso(),
            "problem_id": payload.problem_id,
            "cell_count": len(payload.cells),
            "total_code_size": sum(len(c.source) for c in payload.cells),
            "kind": "dvnb",
        }, f, ensure_ascii=False, indent=2)

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


# ---------- Helper: get next run index for notebook snapshots ----------

def _next_nb_run_index(session_id: str, problem_id: str) -> int:
    """Find next integer index for nb_run_XXXX folders."""
    runs_root = problem_dir(session_id, problem_id) / "nb_runs"
    if not runs_root.exists():
        return 1
    max_idx = 0
    for p in runs_root.iterdir():
        if p.is_dir() and p.name.startswith("nb_run_"):
            try:
                idx = int(p.name.split("_")[-1])
                max_idx = max(max_idx, idx)
            except ValueError:
                continue
    return max_idx + 1


def _get_latest_nb_snapshot(session_id: str, problem_id: str) -> dict | None:
    """Get the most recent notebook snapshot for diff comparison."""
    runs_root = problem_dir(session_id, problem_id) / "nb_runs"
    if not runs_root.exists():
        return None
    
    all_runs = sorted([p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("nb_run_")])
    if not all_runs:
        return None
    
    latest = all_runs[-1]
    notebook_path = latest / "notebook.json"
    if not notebook_path.exists():
        return None
    
    try:
        with notebook_path.open("r", encoding="utf-8") as f:
            return json.load(f)
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
    run_folder = problem_dir(payload.session_id, payload.problem_id) / "nb_runs" / f"nb_run_{run_idx:04d}"
    ensure_dir(run_folder)

    current_cells = [{"source": c.source} for c in payload.cells]
    
    # Compute diff if we have a previous snapshot
    diff_stats = None
    if prev_snapshot:
        diff_stats = _compute_nb_diff(prev_snapshot, current_cells)
        
        # Save diff summary as JSON
        diff_path = run_folder / "diff.json"
        with diff_path.open("w", encoding="utf-8") as f:
            json.dump({
                "from_run": prev_snapshot.get("run_index"),
                "to_run": run_idx,
                "timestamp": utc_now_iso(),
                **diff_stats
            }, f, ensure_ascii=False, indent=2)
        
        # Save human-readable changes log
        changes_path = run_folder / "changes.txt"
        with changes_path.open("w", encoding="utf-8") as f:
            f.write(f"Run #{run_idx:04d} - {utc_now_iso()}\n")
            f.write("=" * 60 + "\n\n")
            
            # Describe trigger
            if payload.trigger == "run_all":
                f.write("Trigger: Run All ▶\n")
            elif payload.trigger == "run_cell" and payload.cell_index is not None:
                f.write(f"Trigger: Run Cell [{payload.cell_index + 1}] ▶\n")
            else:
                f.write(f"Trigger: {payload.trigger}\n")
            f.write(f"Total cells: {len(current_cells)}\n\n")
            
            # Describe changes
            if diff_stats["total_changes"] == 0:
                f.write("No changes since last run.\n")
            else:
                f.write("Changes since last run:\n")
                if diff_stats["added_cells"] > 0:
                    f.write(f"  + Added {diff_stats['added_cells']} cell(s)\n")
                if diff_stats["removed_cells"] > 0:
                    f.write(f"  - Removed {diff_stats['removed_cells']} cell(s)\n")
                if diff_stats["modified_cells"]:
                    f.write(f"  ✎ Modified cells: {', '.join(f'[{i+1}]' for i in diff_stats['modified_cells'])}\n")
            
            f.write("\n" + "=" * 60 + "\n")
            f.write("Cell contents:\n\n")
            
            # Show all cells with their content
            for i, cell in enumerate(current_cells):
                marker = ""
                if diff_stats["modified_cells"] and i in diff_stats["modified_cells"]:
                    marker = " ✎ MODIFIED"
                elif prev_snapshot and i >= len(prev_snapshot.get("cells", [])):
                    marker = " ✨ NEW"
                
                f.write(f"Cell [{i + 1}]{marker}:\n")
                f.write("-" * 40 + "\n")
                f.write(cell["source"] or "(empty)")
                f.write("\n\n")

    # Save notebook state as JSON
    snapshot_data = {
        "timestamp": utc_now_iso(),
        "run_index": run_idx,
        "trigger": payload.trigger,
        "cell_index": payload.cell_index,
        "cells": current_cells,
    }
    
    snapshot_path = run_folder / "notebook.json"
    with snapshot_path.open("w", encoding="utf-8") as f:
        json.dump(snapshot_data, f, ensure_ascii=False, indent=2)

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
