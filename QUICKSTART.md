# Quick Deployment Guide - TL;DR

For detailed instructions, see **DEPLOY.md**. This is the 5-minute overview.

## Prerequisites (5 minutes)
1. GitHub account ✓ (you have this)
2. AWS account → Sign up: https://aws.amazon.com
3. Railway account → Sign up: https://railway.app (or use Render)
4. Netlify account → Sign up: https://netlify.com (or use Vercel)

---

## Step 1: AWS S3 (10 minutes)

```bash
# What: Create bucket for storing research data
# Where: https://console.aws.amazon.com/s3

1. Create bucket: "eduko-research-data"
2. Enable versioning + encryption
3. Create IAM user: "eduko-backend-service"
4. Create policy with S3 access (see DEPLOY.md)
5. Generate access keys → SAVE THEM!
```

**Output**: You now have:
- ✅ S3 bucket name: `eduko-research-data`
- ✅ AWS Access Key ID: `AKIA...`
- ✅ AWS Secret Key: `...`

---

## Step 2: Deploy Backend (10 minutes)

### Option A: Railway (Easiest)
```bash
1. Go to: https://railway.app
2. New Project → Deploy from GitHub → Select "raissaputi/eduko"
3. Settings → Root Directory: "backend"
4. Settings → Dockerfile Path: "Dockerfile.prod"
5. Add Environment Variables:
   STORAGE_BACKEND=s3
   S3_BUCKET=eduko-research-data
   AWS_REGION=ap-southeast-1
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   GEMINI_API_KEY=... (optional)
6. Deploy → Wait 3 minutes
7. Copy URL: https://eduko-production.up.railway.app
```

**Test it works:**
```bash
curl https://your-railway-url.railway.app/health
# Should return: {"status":"ok"}
```

---

## Step 3: Deploy Frontend (10 minutes)

### Option A: Netlify (Easiest)
```bash
1. Go to: https://netlify.com
2. Add new site → Import from GitHub → "raissaputi/eduko"
3. Build settings:
   - Base directory: frontend
   - Build command: npm run build
   - Publish directory: frontend/dist
4. Environment variables:
   VITE_API_BASE=https://your-railway-url.railway.app
5. Deploy → Wait 2 minutes
6. Copy URL: https://amazing-name-123456.netlify.app
```

---

## Step 4: Fix CORS (5 minutes)

```bash
1. Go back to Railway backend dashboard
2. Add environment variable:
   CORS_ORIGINS=https://your-netlify-url.netlify.app,http://localhost:5173
3. Redeploy (or it auto-redeploys)
```

---

## Step 5: Test (5 minutes)

1. Open your Netlify URL in browser
2. Enter name → Start session
3. Allow screen recording
4. Complete a task
5. Check S3:
   ```bash
   aws s3 ls s3://eduko-research-data/sessions/
   ```

**You should see files appearing! 🎉**

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Frontend loads but buttons don't work | Check CORS - add your frontend URL to backend |
| "Access Denied" for S3 | Double-check AWS credentials in Railway |
| Recording doesn't upload | Check browser console, verify endpoint exists |
| Build fails | Check logs in deployment dashboard |

---

## URLs to Save

```
✅ Frontend: https://________________.netlify.app
✅ Backend:  https://________________.railway.app
✅ S3 Bucket: eduko-research-data
✅ Region: ap-southeast-1
```

---

## Cost Summary

- **S3**: ~$1.50/month (100 sessions)
- **Railway**: Free tier (500 hours/month) or $5/month
- **Netlify**: Free (100GB bandwidth)
- **Domain** (optional): ~$10/year

**Total**: ~$1.50-6.50/month depending on usage

---

## Next Steps

1. ✅ Share frontend URL with pilot participants
2. ✅ Monitor first few sessions in S3
3. ✅ Download and analyze data
4. ✅ Scale up when ready

---

**Need help?** See full guide: [DEPLOY.md](DEPLOY.md)  
**Checklist**: [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)
