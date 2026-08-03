from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pdfplumber
import os
import tempfile
from dotenv import load_dotenv
import logging

logging.basicConfig(level=logging.DEBUG)

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

load_dotenv()

app = FastAPI()

# CORS configuration - must be added first
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173',           # Local frontend
        'https://qabot-frontend.onrender.com',  # Render frontend (update with your URL)
        'https://your-frontend.vercel.app'
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)

vector_store = None


@app.post('/upload')
async def upload_pdf(file: UploadFile = File(...)):
    global vector_store

    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files allowed')

    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    text = ''
    with pdfplumber.open(tmp_path) as pdf:
        for page in pdf.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + '\n'

    os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=400, detail='Could not extract text from PDF')

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    chunks = splitter.split_text(text)

    embeddings = HuggingFaceEmbeddings(
        model_name='all-MiniLM-L6-v2'
    )
    vector_store = Chroma.from_texts(
        texts=chunks,
        embedding=embeddings,
        persist_directory='./chroma_db'
    )

    return {
        'message': 'PDF processed successfully',
        'chunks': len(chunks),
        'characters': len(text)
    }


class QuestionRequest(BaseModel):
    question: str


@app.post('/ask')
async def ask_question(body: QuestionRequest):
    global vector_store

    if vector_store is None:
        raise HTTPException(status_code=400, detail='Please upload a PDF first')

    if not os.getenv('GROQ_API_KEY'):
        raise HTTPException(status_code=500, detail='GROQ_API_KEY not configured')

    try:
        llm = ChatGroq(
            model='llama-3.3-70b-versatile',
            api_key=os.getenv('GROQ_API_KEY'),
            temperature=0.3
        )

        retriever = vector_store.as_retriever(search_kwargs={'k': 4})
        docs = retriever.invoke(body.question)

        context = '\n\n'.join([doc.page_content for doc in docs])

        prompt = f"""Use the following context to answer the question. 
If the answer is not in the context, say "I couldn't find that in the document."

Context:
{context}

Question: {body.question}

Answer:"""

        response = llm.invoke(prompt)

        sources = [doc.page_content[:200] + '...' for doc in docs]

        return {
            'answer': response.content,
            'sources': sources
        }
    except Exception as e:
        logging.error(f"Error in /ask endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post('/summarize')
async def summarize_pdf():
    global vector_store

    if vector_store is None:
        raise HTTPException(status_code=400, detail='Please upload a PDF first')

    llm = ChatGroq(
        model='llama-3.3-70b-versatile',
        api_key=os.getenv('GROQ_API_KEY'),
        temperature=0.3
    )

    # Get all chunks from the vector store
    all_docs = vector_store.get()
    all_text = '\n\n'.join(all_docs['documents'])

    # Limit to first 6000 characters to avoid token limits
    truncated_text = all_text[:6000]

    prompt = f"""You are a document summarizer. Read the following document content and provide:
1. A brief overview (2-3 sentences)
2. Key topics covered (bullet points)
3. Important details or conclusions

Document content:
{truncated_text}

Summary:"""

    response = llm.invoke(prompt)

    return {
        'summary': response.content
    }

@app.get('/')
def root():
    return {'status': 'running', 'pdf_loaded': vector_store is not None}

