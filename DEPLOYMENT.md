# Cloud Deployment Guide

## Overview
This guide shows how to deploy the application with all data (events, recordings, submissions) automatically uploaded to AWS S3 instead of stored locally.

## Architecture

### Current (Local Development)
```
Frontend → Backend → data/sessions/{id}/
                        ├── events.jsonl
                        ├── recording_*.webm
                        ├── submission_*.html
                        └── ...
```

### Production (Cloud)
```
Frontend → Backend → AWS S3 bucket
                        s3://eduko-research-data/
                          └── sessions/{id}/
                              ├── events.jsonl
                              ├── recording_*.webm
                              ├── submission_*.html
                              └── ...
```

---

## Step 1: Create S3 Bucket

### AWS Console
1. Go to AWS S3 Console
2. Click "Create bucket"
3. Bucket name: `eduko-research-data` (or your choice)
4. Region: `ap-southeast-1` (Singapore) or closest to your users
5. **Block Public Access**: Keep all enabled (data is private)
6. **Versioning**: Enable (protects against accidental deletions)
7. **Encryption**: Enable (AES-256 SSE-S3)
8. Click "Create bucket"

### AWS CLI (Alternative)
```bash
aws s3 mb s3://eduko-research-data --region ap-southeast-1
aws s3api put-bucket-versioning --bucket eduko-research-data --versioning-configuration Status=Enabled
```

---

## Step 2: Configure IAM Permissions

### Create IAM Policy
Create policy `eduko-backend-s3-access`:

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

### Create IAM User or Role

**Option A: IAM User (for EC2/VPS deployment)**
1. Create user `eduko-backend-service`
2. Attach policy `eduko-backend-s3-access`
3. Generate access key
4. Save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

**Option B: IAM Role (for ECS/Lambda)**
1. Create role with trusted entity: ECS or Lambda
2. Attach policy `eduko-backend-s3-access`
3. Assign role to your service

---

## Step 3: Set Environment Variables

### Docker Deployment
Update `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - STORAGE_BACKEND=s3                    # Enable S3 storage
      - S3_BUCKET=eduko-research-data         # Your bucket name
      - AWS_REGION=ap-southeast-1             # Your region
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}     # From IAM user
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
```

Create `.env` file (add to .gitignore):
```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Direct Python Deployment
```bash
export STORAGE_BACKEND=s3
export S3_BUCKET=eduko-research-data
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

### Kubernetes
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: aws-credentials
stringData:
  AWS_ACCESS_KEY_ID: "AKIA..."
  AWS_SECRET_ACCESS_KEY: "..."

---

apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: STORAGE_BACKEND
          value: "s3"
        - name: S3_BUCKET
          value: "eduko-research-data"
        - name: AWS_REGION
          value: "ap-southeast-1"
        envFrom:
        - secretRef:
            name: aws-credentials
```

---

## Step 4: Update Application Code

### Backend Migration

The storage abstraction layer (`app/services/storage.py`) is already created. Now you need to update existing routers to use it.

#### Before (Local Storage):
```python
# sessions.py
import os, json

path = f"data/sessions/{session_id}/session.json"
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f:
    json.dump(data, f)
```

#### After (Cloud-Ready):
```python
# sessions.py
from app.services import storage

path = f"sessions/{session_id}/session.json"
storage.write_json(path, data)
```

### Files to Migrate

Priority order (most critical first):

1. **✅ Already abstracted**: `storage.py` created
2. **🔄 TODO**: Update these files:
   - `app/services/writer.py` - Event logging
   - `app/routers/sessions.py` - Session management
   - `app/routers/submissions_fe.py` - FE submissions
   - `app/routers/submissions_dv.py` - DV submissions + snapshots
   - `app/routers/events.py` - Event endpoints
   - `app/routers/chat.py` - Chat logs + images
   - `app/services/compile_human.py` - Log compilation

---

## Step 5: Test Locally with S3

Before deploying, test S3 integration locally:

```bash
# Install boto3
pip install boto3

# Set env vars
export STORAGE_BACKEND=s3
export S3_BUCKET=eduko-research-data-test  # Use test bucket
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Start backend
cd backend
python -m uvicorn app.main:app --reload

# Check logs - should see:
# ✓ Storage: S3 bucket=eduko-research-data-test
```

Run a test session and verify files appear in S3:
```bash
aws s3 ls s3://eduko-research-data-test/sessions/
```

---

## Step 6: Deploy to Production

### Option A: Docker on EC2/VPS

```bash
# SSH to server
ssh your-server

# Pull latest code
git pull origin main

# Set environment variables in .env file
nano .env
# Add:
# STORAGE_BACKEND=s3
# S3_BUCKET=eduko-research-data
# AWS_REGION=ap-southeast-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...

# Rebuild and restart
docker-compose down
docker-compose up --build -d

# Check logs
docker-compose logs -f backend | grep Storage
# Should see: ✓ Storage: S3 bucket=eduko-research-data
```

### Option B: AWS ECS/Fargate

1. Push Docker image to ECR
2. Create ECS task definition with environment variables
3. Attach IAM role to task (no need for access keys)
4. Deploy service

### Option C: Railway/Render/Fly.io

1. Add environment variables in platform dashboard:
   - `STORAGE_BACKEND=s3`
   - `S3_BUCKET=eduko-research-data`
   - `AWS_REGION=ap-southeast-1`
   - `AWS_ACCESS_KEY_ID=...`
   - `AWS_SECRET_ACCESS_KEY=...`

2. Deploy via Git push

---

## Step 7: Monitoring & Verification

### Verify S3 Upload
```bash
# List all sessions
aws s3 ls s3://eduko-research-data/sessions/

# Check specific session
aws s3 ls s3://eduko-research-data/sessions/{session-id}/ --recursive

# Download for analysis
aws s3 sync s3://eduko-research-data/sessions/{session-id}/ ./local-copy/
```

### CloudWatch Metrics (Optional)
Enable S3 metrics in AWS Console:
- Request metrics
- Storage metrics
- Monitor PUT/GET request rates

### Cost Estimation
For 100 sessions/month with ~500MB each:
- Storage: 50GB × $0.023/GB = $1.15/month
- PUT requests: ~1000 × $0.005/1000 = $0.005
- GET requests: ~100 × $0.0004/1000 = $0.00004
- **Total: ~$1.50/month**

---

## Step 8: Backup & Recovery

### Enable S3 Lifecycle Policies

Archive old data to Glacier:
```json
{
  "Rules": [
    {
      "Id": "Archive old sessions",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        }
      ]
    }
  ]
}
```

### Enable Cross-Region Replication

For disaster recovery, replicate to another region:
1. Create replica bucket in different region
2. Enable replication rule in source bucket
3. Select "All objects" replication

---

## Development Workflow

### Local Development
```bash
# Use local storage (default)
export STORAGE_BACKEND=local
docker-compose up
```

### Staging
```bash
# Use test S3 bucket
export STORAGE_BACKEND=s3
export S3_BUCKET=eduko-research-data-staging
```

### Production
```bash
# Use production S3 bucket
export STORAGE_BACKEND=s3
export S3_BUCKET=eduko-research-data
```

---

## Migration Checklist

- [ ] Create S3 bucket
- [ ] Configure IAM permissions
- [ ] Update `requirements.txt` (already done ✓)
- [ ] Create storage abstraction layer (already done ✓)
- [ ] Migrate `writer.py` to use storage layer
- [ ] Migrate `sessions.py` to use storage layer
- [ ] Migrate `submissions_*.py` to use storage layer
- [ ] Migrate `events.py` to use storage layer
- [ ] Migrate `chat.py` to use storage layer
- [ ] Test locally with S3
- [ ] Deploy to staging
- [ ] Verify all data flows to S3
- [ ] Deploy to production
- [ ] Set up monitoring
- [ ] Configure backups

---

## Troubleshooting

### "Access Denied" Error
- Check IAM permissions
- Verify AWS credentials in environment
- Confirm bucket name matches

### "Bucket Not Found"
- Check region matches (bucket must be in same region as specified)
- Verify bucket name spelling

### Slow Upload
- Consider using S3 Transfer Acceleration
- Enable multipart upload for large files (>5MB)
- Check network bandwidth

### Local Testing
```python
# Test storage connection
from app.services.storage import storage

# Write test
storage.write_text("test.txt", "hello world")

# Read test
content = storage.read_text("test.txt")
print(content)  # Should print: hello world

# List test
files = storage.list_dir(".")
print(files)
```

---

## Next Steps

Once S3 is working, you can add:
1. **CloudFront CDN**: Faster delivery of recordings
2. **Lambda triggers**: Auto-process recordings on upload
3. **Athena queries**: SQL analysis of events.jsonl files
4. **QuickSight**: Visual dashboards of research data
