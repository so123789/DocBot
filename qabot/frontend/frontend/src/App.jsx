// src/App.jsx — the complete app in one file (easy to understand)
import { useState } from 'react'
import axios from 'axios'
import './App.css'
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export default function App() {
const [file, setFile] = useState(null)
const [uploading, setUploading] = useState(false)
const [uploaded, setUploaded] = useState(false)
const [question, setQuestion] = useState('')
const [loading, setLoading] = useState(false)
const [messages, setMessages] = useState([])
const [error, setError] = useState('')
// nn Handle PDF upload nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
const handleUpload = async () => {
if (!file) return
setUploading(true)
setError('')
const formData = new FormData()
formData.append('file', file)
try {
const res = await axios.post(`${API}/upload`, formData)
setUploaded(true)
setMessages([{
role: 'system',
text: `PDF loaded! ${res.data.chunks} chunks created. Ask anything.`
}])
} catch (e) {
setError(e.response?.data?.detail || 'Upload failed')
}
setUploading(false)
}
// nn Handle question nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
const handleAsk = async () => {
if (!question.trim() || loading) return
const q = question
setQuestion('')
setMessages(prev => [...prev, { role: 'user', text: q }])
setLoading(true)
try {
const res = await axios.post(`${API}/ask`, { question: q })
setMessages(prev => [...prev, {
role: 'assistant',
text: res.data.answer,
sources: res.data.sources
}])
} catch (e) {
setMessages(prev => [...prev, {
role: 'error',
text: e.response?.data?.detail || 'Something went wrong'
}])
}
setLoading(false)
}
// nn Handle reset nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
const handleReset = () => {
setFile(null)
setUploaded(false)
setMessages([])
setQuestion('')
setError('')
}
// nn Handle summarize nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
const handleSummarize = async () => {
setLoading(true)
try {
const res = await axios.post(`${API}/summarize`)
setMessages(prev => [...prev, {
role: 'assistant',
text: res.data.summary,
isSummary: true
}])
} catch (e) {
setMessages(prev => [...prev, {
role: 'error',
text: e.response?.data?.detail || 'Summarization failed',
isSummary: true
}])
}
setLoading(false)
}
// nn UI nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
return (
<div className='app'>
<header>
<h1>Document QA</h1>
<p>Upload a PDF. Ask questions. Get answers.</p>
</header>
{/* Upload section */}
{!uploaded && (
<div className='upload-box'>
<div style={{ marginBottom: '20px' }}>
<svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto' }}>
<path d="M32 4V44M32 44L18 30M32 44L46 30" stroke="#667eea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M8 56H56" stroke="#667eea" strokeWidth="3" strokeLinecap="round"/>
</svg>
</div>
<h2 style={{ fontSize: '24px', marginBottom: '8px', color: '#1a1a1a' }}>Upload PDF Document</h2>
<p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>Choose a PDF file to get started</p>
<input type='file' accept='.pdf'
onChange={e => setFile(e.target.files[0])} />
<button onClick={handleUpload} disabled={!file || uploading}>
{uploading ? '⏳ Processing PDF...' : '📤 Upload PDF'}
</button>
{error && <p className='error'>❌ {error}</p>}
{file && !uploading && <p style={{ marginTop: '16px', color: '#667eea', fontSize: '14px', fontWeight: '600' }}>✓ File selected: {file.name}</p>}
</div>
)}
{/* Chat section - Two Column Layout */}
{uploaded && (
<div>
<div className='dual-container'>
{/* Left Column: Ask Questions */}
<div className='chat-column'>
<h2 className='column-title'>💬 Ask Questions</h2>
<div className='messages'>
{messages.filter(m => !m.isSummary).map((m, i) => (
<div key={i} className={`msg ${m.role}`}>
<p>{m.text}</p>
{m.sources && (
<details>
<summary>📎 View sources ({m.sources.length})</summary>
<div>
{m.sources.map((s, j) => <p key={j} className='source'>{s}</p>)}
</div>
</details>
)}
</div>
))}
{loading && messages.some(m => !m.isSummary && m.role === 'user') && (
<div className='msg assistant'>
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
<span>🤖 Thinking</span>
<span style={{ 
animation: 'pulse 1.5s infinite',
display: 'inline-block'
}}>...</span>
</div>
</div>
)}
</div>
<div className='input-section'>
<input value={question} onChange={e => setQuestion(e.target.value)}
onKeyDown={e => e.key === 'Enter' && handleAsk()}
placeholder='🔍 Ask anything about your PDF...' />
<button onClick={handleAsk} disabled={loading}>💬 Ask</button>
</div>
</div>

{/* Right Column: Summarize */}
<div className='chat-column'>
<h2 className='column-title'>📋 Document Summary</h2>
<div className='messages'>
{messages.filter(m => m.isSummary).length > 0 ? (
messages.filter(m => m.isSummary).map((m, i) => (
<div key={i} className={`msg ${m.role}`}>
<p>{m.text}</p>
</div>
))
) : (
<div style={{ padding: '20px', textAlign: 'center', color: '#999', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<p>📄 Click "Generate" to create a summary</p>
</div>
)}
{loading && messages.some(m => m.isSummary) && (
<div className='msg assistant'>
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
<span>📝 Generating summary</span>
<span style={{ 
animation: 'pulse 1.5s infinite',
display: 'inline-block'
}}>...</span>
</div>
</div>
)}
</div>
<div className='input-section'>
<button onClick={handleSummarize} disabled={loading} className='summarize-btn' style={{ width: '100%' }}>
📋 Generate Summary
</button>
</div>
</div>
</div>

{/* Reset Button */}
<div style={{ marginTop: '20px', textAlign: 'center' }}>
<button onClick={handleReset} className='reset-btn' style={{ fontSize: '16px', padding: '12px 32px' }}>
🔄 Reset & Start Over
</button>
</div>
</div>
)}
</div>
)
}