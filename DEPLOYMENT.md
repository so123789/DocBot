# Render Deployment Guide

## Prerequisites
- GitHub account with your repo pushed
- Render account (render.com)
- An Anthropic API key for Claude (`ANTHROPIC_API_KEY`)

## Deployment Steps

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Create Backend Service on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `qabot-backend`
   - **Environment**: `Python 3.11`
   - **Build Command**: `pip install -r qabot/backend/requirements.txt`
   - **Start Command**: `cd qabot/backend && gunicorn -w 1 --timeout 180 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT main:app`
   - **Plan**: Starter or higher (at least 1 GB RAM). The embedding model plus the OCR engine use about 600 MB, which exceeds the 512 MB free tier.

> Keep a single worker (`-w 1`): the loaded document is held in process memory, so extra workers would not see it.

### Step 3: Add Environment Variables

In Render dashboard for backend service:
- Add `ANTHROPIC_API_KEY` = your Claude API key
- Add `PYTHON_VERSION` = `3.11`

### Step 4: Create Frontend Service on Render

1. Click **New +** → **Static Site**
2. Connect the same GitHub repository
3. Configure:
   - **Name**: `qabot-frontend`
   - **Build Command**: `cd qabot/frontend/frontend && npm install && npm run build`
   - **Publish Directory**: `qabot/frontend/frontend/dist`

### Step 5: Add Frontend Environment Variables

In Render dashboard for frontend service:
- Add `VITE_API_URL` = `https://qabot-backend.onrender.com` (replace with your actual backend URL)

### Step 6: Allow Your Frontend Origin (CORS)

`http://localhost:5173` and `https://qabot-frontend.onrender.com` are allowed by default. For any other frontend URL, set this on the backend service (comma-separated, no code change needed):

- `ALLOWED_ORIGINS` = `https://your-frontend.example.com`

### Step 7: Deploy

1. Both services will automatically deploy when you push to GitHub
2. Backend deployment: ~2-3 minutes
3. Frontend deployment: ~2-3 minutes

## Important Notes

### PDF Storage
- **Current setup**: Chroma DB uses local SQLite (won't persist on Render free tier)
- **Options**:
  1. **Use Chroma Cloud** (recommended): Sign up and get API key
  2. **Use Render Disk** (paid): Add persistent disk to backend
  3. **Use external DB**: PostgreSQL, MongoDB, etc.

### Update Frontend URL
Replace `https://qabot-backend.onrender.com` with your actual Render backend URL after creation.

## Testing

After deployment:
1. Visit `https://qabot-frontend.onrender.com`
2. Upload a PDF, Word document or image (try a scanned page to check OCR)
3. Ask questions to verify the backend connection

## Troubleshooting

- **CORS errors**: Check frontend and backend URLs match in CORS config
- **API not found**: Ensure backend environment variables are set
- **PDF uploads fail**: Check backend logs in Render dashboard
- **Port issues**: Render automatically assigns ports, don't hard-code 8000

## Local Testing Before Deploy

```bash
# Backend
cd qabot/backend
python -m pytest          # run the test suite
python -m uvicorn main:app --reload

# Frontend (new terminal)
cd qabot/frontend/frontend
npm test                  # run the test suite
npm run dev
```

Visit `http://localhost:5173` and test everything works.
