from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, sessions, events
from app.routers.submissions_fe import router as fe_router
from app.routers.submissions_dv import router as dv_router
from app.routers.recording import router as rec_router
from app.routers.survey import router as survey_router

app = FastAPI(title="Research MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(chat.router)
app.include_router(fe_router)
app.include_router(dv_router)
app.include_router(sessions.router)
app.include_router(events.router)
app.include_router(rec_router)
app.include_router(survey_router)


    
# --- Separate problem sets ---
@app.get("/api/problems/fe")
def problems_fe():
    return [
        {
            "id": "fe1",
            "type": "FE",
            "title": "FE #1: Simple card",
            "statement": "Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button. Build a centered card with a title and button."
        },
        {
            "id": "fe2",
            "type": "FE",
            "title": "FE #2: Dropdown",
            "statement": "Create a dropdown that opens/closes on click."
        }
    ]

@app.get("/api/problems/dv")
def problems_dv():
    return [
        {
            "id": "dv1",
            "type": "DV",
            "title": "DV #1: Line chart",
            "statement": "Plot a line chart."
        },
        {
            "id": "dv2",
            "type": "DV",
            "title": "DV #2: Bar chart",
            "statement": "Compare categories."
        }
    ]
