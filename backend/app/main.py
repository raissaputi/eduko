from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat

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

# --- Separate problem sets ---
@app.get("/api/problems/fe")
def problems_fe():
    return [
        {
            "id": 1,
            "type": "FE",
            "title": "FE #1: Simple card",
            "statement": "Build a centered card with a title and button.",
            "starter_html": "<!doctype html><html><head><style>body{font-family:sans-serif;margin:0;padding:24px}.card{max-width:420px;margin:40px auto;padding:16px;border:1px solid #e5e7eb;border-radius:12px}</style></head><body><div class='card'><h2>Title</h2><p>Write your content…</p><button>Action</button></div><script>// add click behavior here</script></body></html>"
        },
        {
            "id": 2,
            "type": "FE",
            "title": "FE #2: Dropdown",
            "statement": "Create a dropdown that opens/closes on click.",
            "starter_html": "<!doctype html><html><head><style>body{font-family:sans-serif;margin:0;padding:24px}.menu{position:relative;display:inline-block}.list{position:absolute;top:36px;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;display:none}</style></head><body><div class='menu'><button id='toggle'>Open ▼</button><div id='list' class='list'><a href='#'>Item 1</a><br/><a href='#'>Item 2</a></div></div><script>const t=document.getElementById('toggle');const l=document.getElementById('list');t.addEventListener('click',()=>{l.style.display=l.style.display==='block'?'none':'block';});</script></body></html>"
        }
    ]

@app.get("/api/problems/dv")
def problems_dv():
    return [
        {"id": "DV1", "type": "DV", "title": "DV #1: Line chart", "statement": "Plot a line chart."},
        {"id": "DV2", "type": "DV", "title": "DV #2: Bar chart",  "statement": "Compare categories."},
    ]
