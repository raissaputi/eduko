# Deployment Checklist

Copy this checklist and mark items as you complete them.

## Pre-Deployment

- [ ] All code committed and pushed to GitHub
- [ ] Tested locally with `docker-compose up`
- [ ] AWS account created
- [ ] Credit card added to AWS (for S3)
- [ ] Deployment platform account created (Railway/Render/Netlify)

## AWS S3 Setup

- [ ] Created S3 bucket: `eduko-research-data`
- [ ] Enabled bucket versioning
- [ ] Enabled encryption
- [ ] Created IAM policy: `eduko-s3-access`
- [ ] Created IAM user: `eduko-backend-service`
- [ ] Generated access keys
- [ ] Saved credentials securely (not in git!)
- [ ] Tested S3 access locally

## Backend Deployment

- [ ] Chose platform: Railway ☐ / Render ☐ / AWS ☐
- [ ] Connected GitHub repository
- [ ] Set root directory to `backend`
- [ ] Configured Dockerfile path: `Dockerfile.prod`
- [ ] Added environment variables:
  - [ ] `STORAGE_BACKEND=s3`
  - [ ] `S3_BUCKET=eduko-research-data`
  - [ ] `AWS_REGION=ap-southeast-1`
  - [ ] `AWS_ACCESS_KEY_ID=...`
  - [ ] `AWS_SECRET_ACCESS_KEY=...`
  - [ ] `GEMINI_API_KEY=...` (if using chat)
- [ ] Deployed successfully
- [ ] Copied backend URL: `https://________________`
- [ ] Tested health endpoint: `curl https://your-backend/health`
- [ ] Checked logs show: `✓ Storage: S3 bucket=eduko-research-data`

## Frontend Deployment

- [ ] Chose platform: Netlify ☐ / Vercel ☐ / Other ☐
- [ ] Connected GitHub repository
- [ ] Set root directory to `frontend`
- [ ] Set build command: `npm run build`
- [ ] Set publish directory: `dist`
- [ ] Added environment variable:
  - [ ] `VITE_API_BASE=` (your backend URL)
- [ ] Deployed successfully
- [ ] Copied frontend URL: `https://________________`
- [ ] Site loads correctly in browser

## CORS Configuration

- [ ] Updated backend CORS with frontend URL
- [ ] Redeployed backend
- [ ] Cleared browser cache
- [ ] Tested API calls from frontend (check browser console)

## End-to-End Testing

- [ ] Open frontend URL in browser
- [ ] Can create new session (name + consent)
- [ ] Screen recording permission prompt appears
- [ ] Recording indicator shows: 🔴 Recording
- [ ] Can use chat (if enabled)
- [ ] Can write code in workbench
- [ ] Can submit task
- [ ] Recording uploads successfully
- [ ] Check S3 bucket has data:
  ```bash
  aws s3 ls s3://eduko-research-data/sessions/ --recursive
  ```
- [ ] Files appear in S3:
  - [ ] `events.jsonl`
  - [ ] `recording_*.webm`
  - [ ] `submission_*.html` or `notebook.json`
  - [ ] `session.json`

## Optional: Custom Domain

- [ ] Purchased domain name
- [ ] Added DNS CNAME for frontend
- [ ] Added DNS CNAME for backend (api subdomain)
- [ ] SSL certificates auto-generated
- [ ] Updated CORS with new domain
- [ ] Updated frontend `VITE_API_BASE` with new backend domain
- [ ] Redeployed both services

## Monitoring Setup

- [ ] Set up AWS billing alerts (e.g., $10/month threshold)
- [ ] Bookmarked deployment dashboards:
  - Backend: `https://________________`
  - Frontend: `https://________________`
- [ ] Set up log monitoring (check daily for errors)
- [ ] Created backup script for S3 data
- [ ] Documented emergency rollback procedure

## Documentation

- [ ] Updated README with production URLs
- [ ] Documented environment variables
- [ ] Created participant instructions
- [ ] Shared URLs with research team
- [ ] Scheduled first pilot test

## Post-Deployment

- [ ] Run pilot test with 1-2 participants
- [ ] Verify all data captured correctly
- [ ] Download and inspect session data
- [ ] Check recording quality
- [ ] Verify event logs are complete
- [ ] Monitor S3 storage usage
- [ ] Calculate actual costs after first week

## Emergency Contacts

- AWS Support: https://console.aws.amazon.com/support
- Railway Support: support@railway.app
- Netlify Support: support@netlify.com
- GitHub Issues: https://github.com/raissaputi/eduko/issues

## Rollback Plan

If critical issues occur:

1. **Frontend**: 
   - Netlify: Deploys → Select previous deploy → Publish
   - Vercel: Deployments → Select previous → Promote to Production

2. **Backend**:
   - Railway: Deployments → Rollback to previous
   - Render: Manual → Revert git commit → Redeploy

3. **Emergency disable**:
   - Take down frontend (users can't access)
   - Keep backend running (data still saves)
   - Fix issues → Redeploy → Restore frontend

---

## Success Criteria

Your deployment is successful when:
✅ Frontend loads at public URL
✅ Backend responds to health check
✅ Users can complete full session flow
✅ Screen recordings upload to S3
✅ Event logs save to S3
✅ No console errors in browser
✅ No 500 errors in backend logs
✅ S3 costs are reasonable (<$5/month for pilot)

---

**Deployment Date**: _______________  
**Frontend URL**: _______________  
**Backend URL**: _______________  
**S3 Bucket**: _______________  
**Deployed By**: _______________
