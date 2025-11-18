# app/routers/submissions_dv.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time

from app.services.writer import save_submit_final, append_event
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


# ---------- DV Final Submission ----------

@router.post("/dv")
async def submit_dv(payload: DVCodePayload):
    """
    Save Data Visualization (DV) final submission and log it.
    Each participant is locked to test_type='dv'.
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
