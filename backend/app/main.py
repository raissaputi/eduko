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
            "title": "DV #1: Temperature Trends",
            "statement": """Create a line plot showing temperature trends over time.

Sample data is provided below. Your task:
1. Create a line plot using matplotlib
2. Add proper title and axis labels
3. Customize the line style and color
4. Add a grid for better readability

Use this starter code:""",
            "starter_code": """import matplotlib.pyplot as plt
import numpy as np

# Sample data
months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
temperatures = [20, 22, 25, 27, 29, 31]

# Your code here:
plt.figure(figsize=(10, 6))
# Create the line plot
# Add labels and title
# Customize the appearance"""
        },
        {
            "id": "dv2",
            "type": "DV",
            "title": "DV #2: Sales Comparison",
            "statement": """Create a bar chart comparing product sales.

Your task:
1. Create a bar chart showing sales by product
2. Add value labels on top of each bar
3. Use different colors for each category
4. Add a legend and proper labels

Use this starter code:""",
            "starter_code": """import matplotlib.pyplot as plt
import numpy as np

# Sample data
products = ['Laptop', 'Phone', 'Tablet', 'Watch']
sales = [850, 1200, 400, 300]

# Your code here:
plt.figure(figsize=(10, 6))
# Create the bar chart
# Add value labels
# Customize colors and add legend"""
        }
    ]
