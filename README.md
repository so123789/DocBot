# DocumentChatBot / QABot

A full-stack document Q&A application that lets users upload PDF files, extract their text, store the content in a vector database, and then ask questions about the document.

## Features

- Upload PDF documents
- Extract text from uploaded files
- Index document content for semantic search
- Ask questions about the uploaded document
- Generate a document summary
- Modern React frontend with a FastAPI backend

## Screenshots

Here are some screenshots of the application in action:

### 1. Document Upload & Processing
![Document Upload](./qabot/doc1.png)

### 2. Asking Questions
![Asking Questions](./qabot/doc2.png)

### 3. Document Summary
![Document Summary](./qabot/doc3.png)

## Tech Stack

- Backend: FastAPI, Uvicorn, Python
- Frontend: React + Vite
- Vector search: Chroma + sentence-transformers
- LLM integration: Groq
- PDF extraction: pdfplumber

## Project Structure

```text
DocumentChatBot/
├── DEPLOYMENT.md
├── render.yaml
├── qabot/
│   ├── backend/
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── wsgi.py
│   └── frontend/
│       └── frontend/
│           ├── package.json
│           ├── src/
│           └── vite.config.js
└── chroma_db/
```

## Prerequisites

- Python 3.10+ (recommended 3.11)
- Node.js 18+
- A Groq API key
- Optional: a Google AI API key if you plan to enable additional Gemini-based features

## Backend Setup

1. Navigate to the backend folder:

```bash
cd qabot/backend
```

2. Create and activate a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Create a `.env` file with your API key:

```env
GROQ_API_KEY=your_groq_api_key
```

5. Start the backend server:

```bash
python -m uvicorn main:app --reload
```

The backend will be available at:

- http://localhost:8000

## Frontend Setup

1. Navigate to the frontend folder:

```bash
cd qabot/frontend/frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The frontend will be available at:

- http://localhost:5173

## Usage

1. Open the frontend in your browser.
2. Upload a PDF file.
3. Wait for the document to be processed.
4. Ask questions related to the uploaded document.
5. Use the summary feature to get a quick overview of the document.

## Deployment

Deployment instructions for Render are available in [DEPLOYMENT.md](DEPLOYMENT.md).

The repository also includes a Render config file at [render.yaml](render.yaml).

## Notes

- Uploaded PDF content is stored locally in the Chroma database folder during development.
- For production, you may want to switch to a more persistent vector storage solution.
- Make sure your backend CORS settings allow your frontend origin when deploying.
