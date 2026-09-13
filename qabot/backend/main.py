from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pdfplumber
import os
import tempfile
from dotenv import load_dotenv
import logging
import shutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_anthropic import ChatAnthropic

load_dotenv()

# ── Singleton Embedding Model ────────────────────────────────────
# Load once at startup — avoids ~2-3s model reload on every upload
logger.info("Loading embedding model (all-MiniLM-L6-v2)...")
_embeddings = HuggingFaceEmbeddings(model_name='all-MiniLM-L6-v2')
logger.info("Embedding model loaded.")


def get_llm():
    """Initialize the LLM with proper error handling."""
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="CLAUDE_API_KEY not configured in .env"
        )
    return ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=api_key,
        temperature=0.3
    )


# ── App Setup ────────────────────────────────────────────────────
app = FastAPI(title="DocBot API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173',
        'http://localhost:5174',
        'https://qabot-frontend.onrender.com',
        'https://your-frontend.vercel.app'
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)

# ── Global State ─────────────────────────────────────────────────
vector_store = None
doc_metadata = None  # Track document info for the stats endpoint


class QuestionRequest(BaseModel):
    question: str


# ── Upload Endpoint ──────────────────────────────────────────────
@app.post('/upload')
async def upload_pdf(file: UploadFile = File(...)):
    global vector_store, doc_metadata

    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are allowed')

    # Clear previous data
    if vector_store is not None:
        try:
            vector_store.delete_collection()
        except Exception as e:
            logger.warning(f"Could not delete collection: {e}")
        vector_store = None

    if os.path.exists('./chroma_db'):
        try:
            shutil.rmtree('./chroma_db')
        except Exception as e:
            logger.warning(f"Could not remove chroma_db: {e}")

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract text with page-level tracking for metadata
        pages_text = []
        with pdfplumber.open(tmp_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                extracted = page.extract_text()
                if extracted:
                    pages_text.append((page_num, extracted))
    finally:
        os.unlink(tmp_path)

    if not pages_text:
        raise HTTPException(status_code=400, detail='Could not extract text from PDF')

    full_text = '\n'.join([text for _, text in pages_text])

    # Split with page-aware metadata
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,       # Slightly smaller chunks for better retrieval precision
        chunk_overlap=150,    # Overlap for context continuity
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    chunks = []
    metadatas = []
    chunk_idx = 0
    for page_num, page_text in pages_text:
        page_chunks = splitter.split_text(page_text)
        for chunk_text in page_chunks:
            chunks.append(chunk_text)
            metadatas.append({
                'page': page_num,
                'chunk_index': chunk_idx,
                'source': file.filename
            })
            chunk_idx += 1

    # Build vector store with metadata (reuse singleton embeddings)
    vector_store = Chroma.from_texts(
        texts=chunks,
        embedding=_embeddings,
        metadatas=metadatas,
        persist_directory='./chroma_db'
    )

    doc_metadata = {
        'filename': file.filename,
        'pages': len(pages_text),
        'chunks': len(chunks),
        'characters': len(full_text)
    }

    logger.info(f"Indexed '{file.filename}': {len(pages_text)} pages, {len(chunks)} chunks")

    return {
        'message': 'PDF processed successfully',
        'chunks': len(chunks),
        'characters': len(full_text),
        'pages': len(pages_text)
    }


# ── Ask Endpoint ─────────────────────────────────────────────────
@app.post('/ask')
async def ask_question(body: QuestionRequest):
    global vector_store

    if vector_store is None:
        raise HTTPException(status_code=400, detail='Please upload a PDF first')

    try:
        llm = get_llm()

        # MMR retrieval for diverse, non-redundant results
        retriever = vector_store.as_retriever(
            search_type="mmr",
            search_kwargs={
                'k': 4,              # Return 4 docs
                'fetch_k': 10,       # Consider top 10 before MMR filtering
                'lambda_mult': 0.7   # Balance relevance vs diversity
            }
        )
        docs = retriever.invoke(body.question)
        context = '\n\n'.join([doc.page_content for doc in docs])

        # Structured system/user prompt for better answer quality
        prompt = f"""You are a precise document analysis assistant. Answer the user's question based ONLY on the provided context from their uploaded document.

Rules:
- Answer directly and concisely based on the context
- Use markdown formatting (headings, bullet points, bold) for readability
- If the answer is not in the context, say "I couldn't find that information in the document."
- Do not make up information beyond what's in the context
- Quote relevant passages when appropriate

Context from document:
---
{context}
---

User's question: {body.question}"""

        response = llm.invoke(prompt)

        # Format sources with page numbers from metadata
        sources = []
        for doc in docs:
            page = doc.metadata.get('page', '?')
            preview = doc.page_content[:180].strip()
            sources.append(f"Page {page}: {preview}...")

        return {
            'answer': response.content,
            'sources': sources
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /ask: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Summarize Endpoint ───────────────────────────────────────────
@app.post('/summarize')
async def summarize_pdf():
    global vector_store

    if vector_store is None:
        raise HTTPException(status_code=400, detail='Please upload a PDF first')

    try:
        llm = get_llm()

        # Get all chunks
        all_docs = vector_store.get()
        all_chunks = all_docs['documents']

        # Iterative summarization for long documents
        # Instead of truncating at 6000 chars, summarize in batches then combine
        MAX_BATCH_CHARS = 5000

        if len('\n\n'.join(all_chunks)) <= MAX_BATCH_CHARS:
            # Short document — single pass
            combined = '\n\n'.join(all_chunks)
            summary = await _generate_summary(llm, combined, is_final=True)
        else:
            # Long document — map-reduce style
            batch_summaries = []
            current_batch = []
            current_chars = 0

            for chunk in all_chunks:
                if current_chars + len(chunk) > MAX_BATCH_CHARS and current_batch:
                    batch_text = '\n\n'.join(current_batch)
                    batch_summary = await _generate_summary(llm, batch_text, is_final=False)
                    batch_summaries.append(batch_summary)
                    current_batch = []
                    current_chars = 0
                current_batch.append(chunk)
                current_chars += len(chunk)

            # Process remaining batch
            if current_batch:
                batch_text = '\n\n'.join(current_batch)
                batch_summary = await _generate_summary(llm, batch_text, is_final=False)
                batch_summaries.append(batch_summary)

            # Combine batch summaries into final summary
            combined_summaries = '\n\n'.join(batch_summaries)
            summary = await _generate_final_summary(llm, combined_summaries)

        return {'summary': summary}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /summarize: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _generate_summary(llm, text: str, is_final: bool) -> str:
    """Generate a summary for a chunk of text."""
    if is_final:
        prompt = f"""You are a document summarizer. Read the following document content and provide a comprehensive summary in markdown format:

1. **Overview** — 2-3 sentence summary of the document
2. **Key Topics** — bullet points of main topics covered
3. **Important Details** — key findings, conclusions, or notable information

Document content:
---
{text}
---

Summary:"""
    else:
        prompt = f"""Summarize the following section of a document concisely, preserving all key information, facts, and conclusions:

{text}

Concise summary:"""

    response = llm.invoke(prompt)
    return response.content


async def _generate_final_summary(llm, combined_summaries: str) -> str:
    """Combine multiple batch summaries into one cohesive final summary."""
    prompt = f"""You are a document summarizer. Below are summaries of different sections of the same document. Combine them into one cohesive, comprehensive summary in markdown format:

1. **Overview** — 2-3 sentence summary of the entire document
2. **Key Topics** — bullet points of main topics covered
3. **Important Details** — key findings, conclusions, or notable information

Section summaries:
---
{combined_summaries}
---

Combined summary:"""

    response = llm.invoke(prompt)
    return response.content


# ── Stats Endpoint ───────────────────────────────────────────────
@app.get('/stats')
def get_stats():
    """Return metadata about the currently loaded document."""
    if doc_metadata is None:
        raise HTTPException(status_code=400, detail='No document loaded')
    return doc_metadata


# ── Health Check ─────────────────────────────────────────────────
@app.get('/')
def root():
    return {
        'status': 'running',
        'version': '2.0.0',
        'pdf_loaded': vector_store is not None,
        'document': doc_metadata
    }
