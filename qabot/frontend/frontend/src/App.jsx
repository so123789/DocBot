import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Icon Components ──────────────────────────────────────────────
const Icons = {
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Chevron: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  MessageCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  FileText: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  AlertCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  Bot: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.07A7.001 7.001 0 0 1 7.07 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73A2.002 2.002 0 0 1 12 2zm-1 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm6 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0z" />
    </svg>
  ),
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  // Upload state
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [docMeta, setDocMeta] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Right panel state: null | 'choose' | 'qa' | 'summary'
  const [rightView, setRightView] = useState(null)

  // QA state
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [qaMessages, setQaMessages] = useState([])
  const [openSources, setOpenSources] = useState({})

  // Summary state
  const [summarizing, setSummarizing] = useState(false)
  const [summaryResult, setSummaryResult] = useState(null)
  const [summaryError, setSummaryError] = useState('')

  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qaMessages, loading])

  // Focus input when entering QA mode
  useEffect(() => {
    if (rightView === 'qa') inputRef.current?.focus()
  }, [rightView])

  // ── Drag & Drop ──
  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setDragOver(false) }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') { setFile(f); setUploadError('') }
    else setUploadError('Please drop a PDF file')
  }, [])

  // ── Upload ──
  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post(`${API}/upload`, formData)
      setUploaded(true)
      setDocMeta({ chunks: res.data.chunks, characters: res.data.characters, pages: res.data.pages })
      setRightView('choose')
      // Reset any previous session data
      setQaMessages([])
      setSummaryResult(null)
      setSummaryError('')
      setOpenSources({})
    } catch (e) {
      setUploadError(e.response?.data?.detail || 'Upload failed. Please try again.')
    }
    setUploading(false)
  }

  // ── New Upload (reset right side) ──
  const handleNewUpload = () => {
    setFile(null)
    setUploaded(false)
    setDocMeta(null)
    setRightView(null)
    setQaMessages([])
    setSummaryResult(null)
    setSummaryError('')
    setUploadError('')
    setOpenSources({})
    setQuestion('')
  }

  // ── Ask Question ──
  const handleAsk = async () => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setQuestion('')
    setQaMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await axios.post(`${API}/ask`, { question: q })
      setQaMessages(prev => [...prev, {
        role: 'assistant',
        text: res.data.answer,
        sources: res.data.sources
      }])
    } catch (e) {
      setQaMessages(prev => [...prev, {
        role: 'error',
        text: e.response?.data?.detail || 'Something went wrong.'
      }])
    }
    setLoading(false)
  }

  // ── Summarize ──
  const handleSummarize = async () => {
    setSummarizing(true)
    setSummaryError('')
    try {
      const res = await axios.post(`${API}/summarize`)
      setSummaryResult(res.data.summary)
    } catch (e) {
      setSummaryError(e.response?.data?.detail || 'Summarization failed.')
    }
    setSummarizing(false)
  }

  const toggleSources = (idx) => {
    setOpenSources(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() }
    if (e.key === 'Escape') setQuestion('')
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      <div className="app-bg" aria-hidden="true" />

      <div className="split-layout">
        {/* ════════════════ LEFT PANEL ════════════════ */}
        <aside className="left-panel">
          <div className="left-panel-inner">
            {/* Branding */}
            <div className="brand">
              <div className="brand-icon">
                <Icons.FileText />
              </div>
              <h1>DocBot</h1>
              <p className="brand-tagline">AI-powered document analysis. Upload a PDF, ask questions, and get instant answers.</p>
            </div>

            {/* Upload Area */}
            <div
              className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploaded ? 'uploaded' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload PDF document"
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setUploadError('') } }}
                aria-label="Select PDF file"
              />

              {!uploaded ? (
                <>
                  <div className="upload-icon-wrap">
                    <Icons.Upload />
                  </div>
                  <p className="upload-label">
                    Drop PDF here or <span>browse</span>
                  </p>
                </>
              ) : (
                <>
                  <div className="upload-icon-wrap success">
                    <Icons.Check />
                  </div>
                  <p className="upload-label">Document ready</p>
                </>
              )}
            </div>

            {/* File chip */}
            {file && (
              <div className="file-chip" onClick={(e) => e.stopPropagation()}>
                <Icons.File />
                <span className="file-name">{file.name}</span>
                <button className="remove-file" onClick={() => { setFile(null); setUploaded(false); setRightView(null) }} aria-label="Remove file">✕</button>
              </div>
            )}

            {/* Upload / Re-upload button */}
            {file && !uploading && (
              <button className="btn-upload" onClick={(e) => { e.stopPropagation(); handleUpload() }} disabled={uploading}>
                <Icons.Upload />
                {uploaded ? 'Re-upload' : 'Process Document'}
              </button>
            )}

            {/* Uploading state */}
            {uploading && (
              <div className="upload-status">
                <p>Processing document...</p>
                <div className="progress-bar"><div className="progress-fill" /></div>
              </div>
            )}

            {/* Error */}
            {uploadError && (
              <div className="error-msg">
                <Icons.AlertCircle />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Document meta */}
            {uploaded && docMeta && (
              <div className="doc-info">
                <div className="doc-info-row"><span>Pages</span><strong>{docMeta.pages}</strong></div>
                <div className="doc-info-row"><span>Chunks</span><strong>{docMeta.chunks}</strong></div>
                <div className="doc-info-row"><span>Characters</span><strong>{docMeta.characters?.toLocaleString()}</strong></div>
              </div>
            )}

            {/* New upload */}
            {uploaded && (
              <button className="btn-new" onClick={handleNewUpload}>
                Upload a different document
              </button>
            )}

            {/* Footer */}
            <div className="left-footer">
              <p>Powered by RAG + Claude AI</p>
            </div>
          </div>
        </aside>

        {/* ════════════════ RIGHT PANEL ════════════════ */}
        <main className="right-panel">
          {/* Before upload — welcome state */}
          {!uploaded && (
            <div className="right-welcome">
              <div className="welcome-icon">
                <Icons.MessageCircle />
              </div>
              <h2>Welcome to DocBot</h2>
              <p>Upload a PDF document on the left to get started. You can ask questions or generate a summary of your document.</p>
              <div className="feature-cards">
                <div className="feature-card">
                  <div className="feature-card-icon qa-icon"><Icons.MessageCircle /></div>
                  <h3>Ask Questions</h3>
                  <p>Get precise answers from your document with source citations</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-icon sum-icon"><Icons.Sparkle /></div>
                  <h3>Summarize</h3>
                  <p>Generate a comprehensive AI-powered summary of your document</p>
                </div>
              </div>
            </div>
          )}

          {/* After upload — choose mode */}
          {uploaded && rightView === 'choose' && (
            <div className="right-choose">
              <h2>What would you like to do?</h2>
              <p className="choose-subtitle">Choose how you want to interact with your document</p>
              <div className="mode-cards">
                <button className="mode-card" onClick={() => setRightView('qa')}>
                  <div className="mode-card-icon qa-icon"><Icons.MessageCircle /></div>
                  <h3>Ask Questions</h3>
                  <p>Chat with your document — ask anything and get answers with source citations</p>
                  <span className="mode-card-cta">Start chatting →</span>
                </button>
                <button className="mode-card" onClick={() => { setRightView('summary'); if (!summaryResult) handleSummarize() }}>
                  <div className="mode-card-icon sum-icon"><Icons.Sparkle /></div>
                  <h3>Summarize Document</h3>
                  <p>Get a comprehensive AI-generated overview of your document's key points</p>
                  <span className="mode-card-cta">Generate summary →</span>
                </button>
              </div>
            </div>
          )}

          {/* QA Mode */}
          {uploaded && rightView === 'qa' && (
            <div className="qa-view">
              <div className="view-header">
                <button className="btn-back" onClick={() => setRightView('choose')} aria-label="Go back">
                  <Icons.ArrowLeft />
                </button>
                <div className="view-header-icon qa-icon"><Icons.MessageCircle /></div>
                <h2>Ask Questions</h2>
                {docMeta && <span className="header-badge">{docMeta.chunks} chunks indexed</span>}
              </div>

              <div className="chat-messages" role="log" aria-label="Chat messages" aria-live="polite">
                {qaMessages.length === 0 && !loading && (
                  <div className="chat-empty">
                    <Icons.MessageCircle />
                    <p>Ask your first question about the document</p>
                  </div>
                )}
                {qaMessages.map((m, i) => (
                  <div key={i} className="msg-wrap">
                    {m.role === 'user' && (
                      <div className="msg msg-user">
                        <div className="msg-bubble user-bubble">{m.text}</div>
                      </div>
                    )}
                    {m.role === 'assistant' && (
                      <div className="msg msg-assistant">
                        <div className="msg-avatar"><Icons.Bot /></div>
                        <div className="msg-bubble assistant-bubble">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                          {m.sources && m.sources.length > 0 && (
                            <>
                              <button
                                className={`sources-toggle ${openSources[i] ? 'open' : ''}`}
                                onClick={() => toggleSources(i)}
                                aria-expanded={openSources[i] || false}
                              >
                                <Icons.Chevron />
                                {m.sources.length} source{m.sources.length > 1 ? 's' : ''}
                              </button>
                              {openSources[i] && (
                                <div className="sources-list">
                                  {m.sources.map((s, j) => (
                                    <div key={j} className="source-chip">{s}</div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {m.role === 'error' && (
                      <div className="msg msg-error-row">
                        <Icons.AlertCircle />
                        <span>{m.text}</span>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="msg msg-assistant">
                    <div className="msg-avatar"><Icons.Bot /></div>
                    <div className="typing-dots"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input">
                <input
                  ref={inputRef}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your document..."
                  disabled={loading}
                  aria-label="Type your question"
                />
                <button className="btn-send" onClick={handleAsk} disabled={loading || !question.trim()} aria-label="Send">
                  <Icons.Send />
                </button>
              </div>
            </div>
          )}

          {/* Summary Mode */}
          {uploaded && rightView === 'summary' && (
            <div className="summary-view">
              <div className="view-header">
                <button className="btn-back" onClick={() => setRightView('choose')} aria-label="Go back">
                  <Icons.ArrowLeft />
                </button>
                <div className="view-header-icon sum-icon"><Icons.Sparkle /></div>
                <h2>Document Summary</h2>
              </div>

              <div className="summary-content">
                {summarizing && (
                  <div className="summary-loading">
                    <div className="typing-dots large"><span /><span /><span /></div>
                    <p>Analyzing your document...</p>
                  </div>
                )}

                {summaryError && (
                  <div className="msg msg-error-row">
                    <Icons.AlertCircle />
                    <span>{summaryError}</span>
                  </div>
                )}

                {summaryResult && !summarizing && (
                  <div className="summary-result">
                    <div className="summary-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryResult}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {!summarizing && (
                <div className="summary-actions">
                  <button className="btn-regenerate" onClick={handleSummarize} disabled={summarizing}>
                    <Icons.Sparkle />
                    {summaryResult ? 'Regenerate Summary' : 'Generate Summary'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}