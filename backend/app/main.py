from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, sessions, events
from app.routers.submissions_fe import router as fe_router
from app.routers.submissions_dv import router as dv_router
from app.routers.recording import router as rec_router
from app.routers.survey import router as survey_router
import os

app = FastAPI(title="Research MVP")

# Get CORS origins from environment variable
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Serve data folder for media (images saved from chat)
app.mount("/media", StaticFiles(directory="data", html=False), name="media")

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
            "title": "FE #1: Simple Card Carousel",
            "statement": "Bangun sebuah carousel card (isi: 1, 2, 3) dengan tombol kiri/kanan.",
            # Optional media URL (served from frontend/public). Place a GIF named fe1-demo.gif under frontend/public/gifs
            "media_url": "/gifs/fe1-demo.gif"
        },
        {
            "id": "fe2",
            "title": "FE #2: FAQ Section",
            "statement": """Bangun section FAQ berisi beberapa item. Anda bebas menentukan gaya visual & layout, selama memenuhi kebutuhan aksesibilitas, responsivitas, dan kualitas dasar FE.
What is CSS?: CSS (Cascading Style Sheets) describes how HTML elements are presented.
What is JavaScript?: JavaScript lets you create dynamic, interactive behavior in web pages.
What is HTML?: HTML (HyperText Markup Language) structures content on the web.""",
            # No GIF for problem 2
            # "media_url": "/gifs/fe2-demo.gif"
        }
    ]

@app.get("/api/problems/dv")
def problems_dv():
    return [
        {
            "id": "dv1",
            "type": "DV",
            "title": "DV #1: Distribusi Wage berdasarkan Race dan Jobclass",
            "statement": """Buatlah visualisasi boxplot seperti contoh di bawah ini yang menunjukkan distribusi wage berdasarkan race, dengan warna berbeda untuk tiap jobclass, lalu tambahkan scatter plot untuk setiap observasi dengan marker berbeda berdasarkan status health insurance (o untuk Yes, X untuk No).""",
            "starter_code": """import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Load Wage dataset
# Anda bisa menggunakan: from ISLR import Wage
# atau load dari CSV jika tersedia

# Batasi data menjadi 500 baris pertama
df = df.head(500)

# Your code here:
# 1. Load data
# 2. Prepare figure
# 3. Create boxplot dengan hue jobclass
# 4. Overlay scatter plot dengan marker berdasarkan health_ins
# 5. Customize legend dan labels"""
            ,
            "media_url": "/gifs/dv1-demo.png"
        },
        {
            "id": "dv2",
            "type": "DV",
            "title": "DV #2: Faktor-faktor Berpengaruh terhadap Wage",
            "statement": """Visualisasikan faktor-faktor yang paling berpengaruh terhadap tingkat pendapatan (wage) pekerja dari tahun ke tahun!""",
            "starter_code": """import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import seaborn as sns

# Load Wage dataset
# Anda bisa menggunakan: from ISLR import Wage
# atau load dari CSV jika tersedia

# Batasi data menjadi 500 baris pertama
df = df.head(500)

# Your code here:
# 1. Load data
# 2. Analisis korelasi atau feature importance
# 3. Visualisasikan tren wage per tahun dengan breakdown faktor
# 4. Tambahkan interpretasi visual"""
        }
    ]
