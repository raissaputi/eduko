# Eduko Research Platform

Web-based platform for conducting coding research studies with automatic data collection and cloud storage.

## Features

- 🖥️ **Dual Task Types**: Frontend (HTML/CSS) and Data Visualization (Python notebook)
- 🎥 **Screen Recording**: Automatic capture with browser MediaRecorder API
- 💬 **Multimodal Chat**: AI assistant with image paste support (Gemini)
- 📓 **Notebook Workbench**: Jupyter-like multi-cell execution for DV tasks
- 📊 **Comprehensive Logging**: Events, submissions, chat history, paste tracking
- ☁️ **Cloud Storage**: Automatic upload to AWS S3 (production) or local (development)
- 📝 **Human-Readable Logs**: Auto-compiled summaries with diff tracking

## Tech Stack

**Frontend:**
- React 18 + Vite
- Monaco Editor (code editing)
- React Markdown (rendering)
- WebSocket (real-time chat)

**Backend:**
- FastAPI (Python 3.11)
- Google Generative AI (Gemini/Gemma)
- Matplotlib + Pandas (DV execution)
- boto3 (AWS S3 integration)

**Infrastructure:**
- Docker + Docker Compose
- AWS S3 (data storage)
- Railway/Render (backend hosting)
- Netlify/Vercel (frontend hosting)

## Quick Start (Local Development)

### Prerequisites
- Docker & Docker Compose
- Git

### 1. Clone Repository
```bash
git clone https://github.com/raissaputi/eduko.git
cd eduko
```

### 2. Configure Environment

Create `backend/.env`:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
STORAGE_BACKEND=local  # Use local storage for development
```

### 3. Start Services
```bash
docker-compose up --build
```

### 4. Access Application
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 5. Test Flow
1. Open frontend
2. Enter name and consent
3. Start task (allows screen recording)
4. Complete task and submit
5. Check data in `backend/data/sessions/`

## Production Deployment

See **[DEPLOY.md](DEPLOY.md)** for complete step-by-step guide.

### Quick Summary

1. **Set up AWS S3** for data storage
2. **Deploy Backend** to Railway/Render
3. **Deploy Frontend** to Netlify/Vercel
4. **Configure CORS** between services
5. **Test end-to-end** flow

**Estimated monthly cost**: ~$1.50 (S3 only, free hosting tiers available)

## Project Structure

```
eduko/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── flow/            # Main app flow (consent, tasks, survey)
│   │   ├── components/      # Reusable components
│   │   │   ├── Chat/        # Chat panel with image support
│   │   │   └── workbench/   # Code editors (FE + DV notebook)
│   │   └── lib/             # Utilities (logger, recorder)
│   ├── Dockerfile           # Dev container
│   ├── Dockerfile.prod      # Production build
│   └── nginx.conf           # Production server config
│
├── backend/                 # FastAPI server
│   ├── app/
│   │   ├── routers/         # API endpoints
│   │   │   ├── chat.py      # Chat with LLM
│   │   │   ├── sessions.py  # Session management + recording upload
│   │   │   ├── events.py    # Telemetry logging
│   │   │   ├── submissions_fe.py  # FE submissions
│   │   │   └── submissions_dv.py  # DV submissions + snapshots
│   │   └── services/        # Business logic
│   │       ├── storage.py   # Storage abstraction (local/S3)
│   │       ├── dv_runner.py # Python code execution
│   │       ├── llm.py       # Gemini integration
│   │       └── compile_human.py  # Human-readable log generation
│   ├── data/               # Local data storage (dev only)
│   ├── Dockerfile          # Dev container
│   └── Dockerfile.prod     # Production build
│
├── docker-compose.yml      # Local development
├── DEPLOY.md              # Deployment guide
└── DEPLOY_CHECKLIST.md    # Step-by-step checklist
```

## Data Collection

All participant data is automatically saved:

### Events Logged
- Session start/end
- Task enter/leave
- Code changes
- Preview/run clicks
- Chat interactions
- Paste events (with content)
- Submission attempts
- Recording start/stop

### Files Saved (per session)

```
sessions/{session-id}/
├── session.json              # Metadata (name, timestamps)
├── events.jsonl              # All telemetry events
├── recording_fe1_*.webm      # Screen recordings (per task)
├── recording_dv1_*.webm
├── submission_fe1.html       # Final FE submissions
├── nb_runs/                  # DV notebook snapshots
│   └── nb_run_0001/
│       ├── notebook.json     # Cell contents
│       ├── diff.json         # Changes from previous run
│       └── changes.txt       # Human-readable diff
├── chat.jsonl                # Chat history
├── media/                    # Pasted images from chat
│   └── *.png
├── log.txt                   # Human-readable session log
├── log_problem_fe1.txt       # Per-problem event log
├── log_chat_fe1.txt          # Per-problem chat log
└── log_pastes.txt            # Archive of pasted content
```

## Development

### Local Changes with Hot Reload
```bash
docker-compose up
# Edit files in frontend/src or backend/app
# Changes auto-reload in containers
```

### Run Tests
```bash
# Backend tests
cd backend
python -m pytest

# Frontend tests
cd frontend
npm test
```

### Compile Human Logs
```bash
docker exec research-backend python -m app.services.compile_human {session-id}
```

### Check S3 Storage (Production)
```bash
aws s3 ls s3://eduko-research-data/sessions/ --recursive
```

## Environment Variables

### Backend
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `STORAGE_BACKEND` | Storage type: `local` or `s3` | No | `local` |
| `S3_BUCKET` | S3 bucket name | If using S3 | - |
| `AWS_REGION` | AWS region | If using S3 | `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID` | AWS credentials | If using S3 | - |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | If using S3 | - |
| `GEMINI_API_KEY` | Google Gemini API key | For chat | - |

### Frontend
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_BASE` | Backend URL | Yes | `http://localhost:8000` |

## Architecture

### Request Flow
```
User Browser
    ↓
Frontend (React SPA)
    ↓ REST API / WebSocket
Backend (FastAPI)
    ↓
Storage Layer (abstraction)
    ↓
├─→ Local Filesystem (dev)
└─→ AWS S3 (production)
```

### Screen Recording Flow
```
1. Task starts → Request screen capture permission
2. User allows → MediaRecorder starts (VP9/VP8 codec)
3. Recording continues → UI shows 🔴 indicator
4. Task ends → Stop recording, create blob
5. Upload → POST /api/session/{id}/recording
6. Backend → Save to storage (local or S3)
```

## Troubleshooting

### Common Issues

**"CORS error" in browser**
- Update backend `allow_origins` in `main.py`
- Ensure `VITE_API_BASE` matches backend URL

**"Recording permission denied"**
- Check browser permissions (chrome://settings/content/screenCapture)
- Recording is optional - app continues without it

**"S3 Access Denied"**
- Verify AWS credentials in environment
- Check IAM policy includes bucket name
- Ensure `STORAGE_BACKEND=s3` is set

**"Cannot connect to backend"**
- Verify backend is running: `docker ps`
- Check health endpoint: `curl http://localhost:8000/health`
- Review backend logs: `docker logs research-backend`

## Contributing

This is a research project. For issues or improvements:
1. Open an issue with detailed description
2. Include error logs if applicable
3. Mention your deployment platform (local/Railway/etc.)

## License

MIT License - see LICENSE file

## Citation

If you use this platform in your research, please cite:

```bibtex
@software{eduko2025,
  title={Eduko: Web-based Research Platform for Coding Studies},
  author={[Your Name]},
  year={2025},
  url={https://github.com/raissaputi/eduko}
}
```

## Support

- **Documentation**: See DEPLOY.md and DEPLOYMENT.md
- **Issues**: https://github.com/raissaputi/eduko/issues
- **AWS Help**: https://console.aws.amazon.com/support

---

**Status**: ✅ Production Ready  
**Last Updated**: November 2025  
**Version**: 1.0.0
