# Step-by-Step Deployment Guide for Eduko Research Platform

## Overview
This guide covers deploying your combined frontend+backend repository to production with cloud storage (AWS S3) for all research data.

**Tech Stack:**
- Frontend: React + Vite → Nginx
- Backend: FastAPI + Python
- Storage: AWS S3
- Hosting: Multiple options (Railway, Render, AWS, VPS)

---

## Pre-Deployment Checklist

- [ ] GitHub repository is up to date
- [ ] All features tested locally
- [ ] AWS account created
- [ ] Domain name purchased (optional but recommended)
- [ ] Deployment platform account created

---

## Part 1: AWS S3 Setup (Data Storage)

### Step 1.1: Create S3 Bucket

1. **Go to AWS Console**: https://console.aws.amazon.com/s3
2. **Click "Create bucket"**
3. **Configure bucket:**
   - **Bucket name**: `eduko-research-data` (must be globally unique)
   - **Region**: Choose closest to your users (e.g., `ap-southeast-1` for Singapore)
   - **Block Public Access**: Keep ALL enabled (data is private)
   - **Bucket Versioning**: Enable (protects against accidental deletion)
   - **Default encryption**: Enable (SSE-S3)
4. **Click "Create bucket"**

### Step 1.2: Create IAM User with S3 Access

1. **Go to IAM Console**: https://console.aws.amazon.com/iam
2. **Click "Users" → "Create user"**
3. **User name**: `eduko-backend-service`
4. **Click "Next"**
5. **Attach policies directly** → Click "Create policy"
6. **JSON tab**, paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::eduko-research-data",
        "arn:aws:s3:::eduko-research-data/*"
      ]
    }
  ]
}
```

7. **Click "Next"**
   - Policy name: `eduko-s3-access`
   - Click "Create policy"

8. **Go back to user creation**, refresh policies, select `eduko-s3-access`
9. **Click "Next"** → **"Create user"**

### Step 1.3: Generate Access Keys

1. **Click on the created user** (`eduko-backend-service`)
2. **Security credentials tab**
3. **Scroll to "Access keys"** → **"Create access key"**
4. **Select "Application running outside AWS"**
5. **Click "Next"** → **"Create access key"**
6. **⚠️ IMPORTANT: Copy these credentials immediately!**
   - `AWS_ACCESS_KEY_ID`: `AKIA...`
   - `AWS_SECRET_ACCESS_KEY`: `...`
7. **Download .csv file as backup**
8. **Click "Done"**

> ⚠️ **Security Note**: Never commit these keys to GitHub! Store them securely.

---

## Part 2: Prepare Repository for Deployment

### Step 2.1: Update Frontend Environment Config

Create `frontend/.env.production`:

```bash
# Production API endpoint (update after backend is deployed)
VITE_API_BASE=https://your-backend-url.com
```

### Step 2.2: Create .gitignore Entries

Verify these are in `.gitignore`:

```
# Environment variables
.env
.env.local
.env.production
*.env

# AWS credentials
.aws/

# Local data
backend/data/
```

### Step 2.3: Update CORS Settings

Edit `backend/app/main.py` to allow your production frontend domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Development
        "https://your-frontend-url.com",  # Production - UPDATE THIS
        "https://eduko.netlify.app",  # Example
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Step 2.4: Commit Production Files

```bash
# From project root
git add backend/Dockerfile.prod
git add frontend/Dockerfile.prod
git add frontend/nginx.conf
git add .env.example
git commit -m "Add production deployment configuration"
git push origin main
```

---

## Part 3: Deploy Backend (Choose ONE Option)

### Option A: Railway (Recommended - Easiest)

**Pros**: Simple, free tier, automatic HTTPS, GitHub integration  
**Cons**: Limited free tier (500 hours/month)

#### Steps:

1. **Go to**: https://railway.app
2. **Sign up with GitHub**
3. **Click "New Project"** → **"Deploy from GitHub repo"**
4. **Select `raissaputi/eduko` repository**
5. **Click "Add variables"** and add:

```bash
# Storage
STORAGE_BACKEND=s3
S3_BUCKET=eduko-research-data
AWS_REGION=ap-southeast-1

# AWS Credentials (from Step 1.3)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Gemini API (if using chat)
GEMINI_API_KEY=your_gemini_key
```

6. **Settings** → **Root Directory**: Set to `backend`
7. **Settings** → **Build Command**: Leave empty (uses Dockerfile)
8. **Settings** → **Dockerfile Path**: `Dockerfile.prod`
9. **Settings** → **Port**: `8000`
10. **Click "Deploy"**
11. **Wait for deployment** (~3-5 minutes)
12. **Copy your backend URL**: `https://eduko-production.up.railway.app`

#### Verify:
```bash
curl https://your-railway-url.railway.app/health
# Should return: {"status":"ok"}
```

---

### Option B: Render

**Pros**: Generous free tier, simple setup  
**Cons**: Slower cold starts on free tier

#### Steps:

1. **Go to**: https://render.com
2. **Sign up with GitHub**
3. **Click "New +" → "Web Service"**
4. **Connect `raissaputi/eduko` repository**
5. **Configure:**
   - **Name**: `eduko-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Docker`
   - **Docker Build Context**: `backend`
   - **Dockerfile Path**: `./Dockerfile.prod`
   - **Instance Type**: Free (or Starter for better performance)

6. **Add Environment Variables** (same as Railway above)
7. **Click "Create Web Service"**
8. **Copy your backend URL**: `https://eduko-backend.onrender.com`

---

### Option C: AWS ECS/Fargate (Production-Grade)

See `DEPLOYMENT.md` for full AWS deployment guide.

---

## Part 4: Deploy Frontend (Choose ONE Option)

### Option A: Netlify (Recommended - Free)

**Pros**: Free, fast CDN, automatic HTTPS, easy setup  
**Cons**: Static hosting only (perfect for React SPA)

#### Steps:

1. **Go to**: https://www.netlify.com
2. **Sign up with GitHub**
3. **Click "Add new site" → "Import an existing project"**
4. **Connect to GitHub** → Select `raissaputi/eduko`
5. **Configure build settings:**
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`

6. **Click "Show advanced"** → **"New variable"**:
   ```
   Key: VITE_API_BASE
   Value: https://your-backend-url.railway.app
   ```
   (Use the URL from your backend deployment)

7. **Click "Deploy site"**
8. **Wait for build** (~2-3 minutes)
9. **Copy your site URL**: `https://amazing-name-123456.netlify.app`

#### Custom Domain (Optional):
1. **Site settings** → **Domain management**
2. **Add custom domain**: `eduko.yourdomain.com`
3. **Follow DNS instructions** (add CNAME record)

---

### Option B: Vercel (Alternative)

**Pros**: Similar to Netlify, great for React  
**Cons**: None significant

#### Steps:

1. **Go to**: https://vercel.com
2. **Sign up with GitHub**
3. **Click "Add New..." → "Project"**
4. **Import `raissaputi/eduko`**
5. **Configure:**
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

6. **Environment Variables**:
   ```
   VITE_API_BASE=https://your-backend-url.railway.app
   ```

7. **Click "Deploy"**
8. **Copy URL**: `https://eduko.vercel.app`

---

### Option C: Same Platform as Backend

If you deployed backend on Railway/Render, you can deploy frontend there too:

#### Railway:
1. **New Project** → **Deploy from GitHub**
2. **Root Directory**: `frontend`
3. **Dockerfile Path**: `Dockerfile.prod`
4. **Environment**: `VITE_API_BASE=https://your-backend-url`
5. **Deploy**

---

## Part 5: Update CORS & Test Full Stack

### Step 5.1: Update Backend CORS

Now that you have your frontend URL, update backend CORS:

**Railway/Render Dashboard** → **Environment Variables** → Add/Edit:
```bash
CORS_ORIGINS=https://your-frontend-url.netlify.app,http://localhost:5173
```

Or manually edit `backend/app/main.py`:
```python
allow_origins=[
    "http://localhost:5173",
    "https://your-frontend-url.netlify.app",  # Add your actual URL
]
```

Then redeploy backend (commit and push, or use dashboard redeploy button).

### Step 5.2: Test Everything

1. **Open your frontend URL**: `https://your-frontend-url.netlify.app`
2. **Test session creation**:
   - Enter name and consent
   - Start session
3. **Test task features**:
   - Screen recording permission prompt (allow it)
   - Check recording indicator appears: 🔴 Recording
   - Type some code
   - Submit task
4. **Check S3 bucket**:
   ```bash
   aws s3 ls s3://eduko-research-data/sessions/ --recursive
   ```
   Should see files appearing!

---

## Part 6: Monitoring & Maintenance

### Monitor S3 Storage

```bash
# Check total storage
aws s3 ls s3://eduko-research-data/sessions/ --recursive --summarize

# Download a session for analysis
aws s3 sync s3://eduko-research-data/sessions/SESSION_ID ./local-analysis/
```

### Monitor Backend Logs

**Railway**: Click on deployment → Logs tab  
**Render**: Logs tab in dashboard  

Look for:
```
✓ Storage: S3 bucket=eduko-research-data
```

### Monitor Costs

**AWS Billing Dashboard**: https://console.aws.amazon.com/billing

Expected costs (100 sessions/month):
- S3 Storage: ~$1.15
- S3 API Requests: ~$0.01
- **Total: ~$1.50/month**

Railway/Render free tiers should cover backend hosting initially.

---

## Part 7: Set Up Custom Domain (Optional)

### Buy Domain
- **Namecheap**: ~$10/year for .com
- **Google Domains**: ~$12/year
- **Cloudflare**: At-cost pricing

### Configure DNS

#### For Frontend (Netlify):
1. **Netlify Dashboard** → **Domain settings** → **Add custom domain**
2. **Add CNAME record** in your DNS:
   ```
   Type: CNAME
   Name: eduko (or www)
   Value: your-site.netlify.app
   ```

#### For Backend (Railway):
1. **Railway Dashboard** → **Settings** → **Domains** → **Custom Domain**
2. **Add CNAME record**:
   ```
   Type: CNAME
   Name: api
   Value: your-project.railway.app
   ```

Result:
- Frontend: `https://eduko.yourdomain.com`
- Backend: `https://api.yourdomain.com`

---

## Troubleshooting

### "Access Denied" when uploading to S3
- ✅ Check AWS credentials are correct
- ✅ Verify IAM policy includes your bucket name
- ✅ Ensure `STORAGE_BACKEND=s3` is set

### CORS errors in browser
- ✅ Update backend `allow_origins` with frontend URL
- ✅ Redeploy backend after CORS changes
- ✅ Clear browser cache

### Frontend shows "Failed to fetch"
- ✅ Check `VITE_API_BASE` points to correct backend URL
- ✅ Verify backend is running: `curl https://your-backend/health`
- ✅ Check backend logs for errors

### Recording not uploading
- ✅ Check browser console for errors
- ✅ Verify `/api/session/{id}/recording` endpoint exists
- ✅ Test with small recording first

### Build fails
- ✅ Check `package.json` has all dependencies
- ✅ Verify Node version (need 18+)
- ✅ Check Python version (need 3.11+)

---

## Quick Reference - Environment Variables

### Backend (Railway/Render)
```bash
STORAGE_BACKEND=s3
S3_BUCKET=eduko-research-data
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
GEMINI_API_KEY=... (optional)
```

### Frontend (Netlify/Vercel)
```bash
VITE_API_BASE=https://your-backend-url.railway.app
```

---

## Next Steps After Deployment

1. **Test with real participants**
2. **Monitor S3 storage growth**
3. **Set up backup/export scripts**
4. **Add Google Analytics** (optional)
5. **Configure alert notifications**
6. **Document your research workflow**

---

## Summary - What You've Deployed

✅ **Frontend**: React SPA on Netlify/Vercel with CDN  
✅ **Backend**: FastAPI on Railway/Render with auto-scaling  
✅ **Storage**: AWS S3 with automatic data persistence  
✅ **Features**:
- Screen recording with auto-upload
- Multi-modal chat with image support
- Notebook-style DV workbench
- Comprehensive event logging
- Human-readable log compilation
- Paste content archiving

**Your research platform is now live! 🎉**

Participants can access: `https://your-frontend-url.netlify.app`  
All data automatically saves to: `s3://eduko-research-data/sessions/`
