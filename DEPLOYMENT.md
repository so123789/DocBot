# Render Deployment Guide

## Prerequisites
- GitHub account with your repo pushed
- Render account (render.com)
- GEMINI_API_KEY and GROQ_API_KEY

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
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app`
   - **Plan**: Free (or Pro for persistence)

### Step 3: Add Environment Variables

In Render dashboard for backend service:
- Add `GEMINI_API_KEY` = your actual API key
- Add `GROQ_API_KEY` = your actual API key
- Add `PYTHON_VERSION` = `3.11`

### Step 4: Create Frontend Service on Render

1. Click **New +** → **Static Site**
2. Connect the same GitHub repository
3. Configure:
   - **Name**: `qabot-frontend`
   - **Build Command**: `cd frontend/frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/frontend/dist`

### Step 5: Add Frontend Environment Variables

In Render dashboard for frontend service:
- Add `VITE_API_URL` = `https://qabot-backend.onrender.com` (replace with your actual backend URL)

### Step 6: Update CORS in Backend

Update `backend/main.py` to allow your Render frontend:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173',  # Local development
        'https://qabot-frontend.onrender.com'  # Your Render frontend URL
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)
```

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

### Install Gunicorn
Add to `backend/requirements.txt`:
```
gunicorn
```

## Testing

After deployment:
1. Visit `https://qabot-frontend.onrender.com`
2. Upload a PDF
3. Ask questions to verify the backend connection

## Troubleshooting

- **CORS errors**: Check frontend and backend URLs match in CORS config
- **API not found**: Ensure backend environment variables are set
- **PDF uploads fail**: Check backend logs in Render dashboard
- **Port issues**: Render automatically assigns ports, don't hard-code 8000

## Local Testing Before Deploy

```bash
# Backend
cd backend
python -m uvicorn main:app --reload

# Frontend (new terminal)
cd frontend/frontend
npm run dev
```

Visit `http://localhost:5173` and test everything works.
