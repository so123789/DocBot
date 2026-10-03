import { useState } from 'react'
import Landing from './components/Landing'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SummaryView from './components/SummaryView'
import { FileIcon, MenuIcon } from './components/Icons'
import { askQuestion, getErrorMessage, summarizeDocument, uploadDocument } from './lib/api'
import './App.css'

let nextId = 0
const makeId = () => `m${++nextId}`

export default function App() {
  // Document / upload
  const [meta, setMeta] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')

  // Workspace
  const [view, setView] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Chat
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)

  // Summary
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const handleUpload = async (file) => {
    setUploading(true)
    setUploadError('')
    setProgress(0)
    try {
      const data = await uploadDocument(file, setProgress)
      setMeta({
        filename: data.filename ?? file.name,
        kind: data.kind ?? 'pdf',
        unit: data.unit ?? 'page',
        pages: data.pages,
        chunks: data.chunks,
        characters: data.characters,
        ocrPages: data.ocr_pages ?? 0,
        ocrSkipped: data.ocr_skipped ?? 0,
      })
      setMessages([])
      setSummary('')
      setSummaryError('')
      setView('chat')
    } catch (e) {
      setUploadError(getErrorMessage(e, 'Upload failed. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  const handleAsk = async (question) => {
    setMessages((prev) => [...prev, { id: makeId(), role: 'user', text: question }])
    setAsking(true)
    try {
      const data = await askQuestion(question)
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'assistant', text: data.answer, sources: data.sources },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'error', text: getErrorMessage(e), retry: question },
      ])
    } finally {
      setAsking(false)
    }
  }

  const handleSummarize = async () => {
    setSummarizing(true)
    setSummaryError('')
    try {
      const data = await summarizeDocument()
      setSummary(data.summary)
    } catch (e) {
      setSummaryError(getErrorMessage(e, 'Could not generate a summary.'))
    } finally {
      setSummarizing(false)
    }
  }

  const changeView = (next) => {
    setView(next)
    setSidebarOpen(false)
    if (next === 'summary' && !summary && !summarizing) handleSummarize()
  }

  const newDocument = () => {
    setMeta(null)
    setMessages([])
    setSummary('')
    setSummaryError('')
    setUploadError('')
    setProgress(0)
    setSidebarOpen(false)
  }

  if (!meta) {
    return (
      <Landing
        onUpload={handleUpload}
        uploading={uploading}
        progress={progress}
        serverError={uploadError}
      />
    )
  }

  return (
    <div className="workspace">
      <Sidebar
        meta={meta}
        view={view}
        onViewChange={changeView}
        onNewDocument={newDocument}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon size={20} />
          </button>
          <h1>{view === 'chat' ? 'Ask questions' : 'Summary'}</h1>
          <span className="doc-pill" title={meta.filename}>
            <FileIcon size={14} /> <span>{meta.filename}</span>
          </span>
        </header>

        {view === 'chat' ? (
          <ChatView messages={messages} loading={asking} onSend={handleAsk} filename={meta.filename} />
        ) : (
          <SummaryView
            summary={summary}
            loading={summarizing}
            error={summaryError}
            onGenerate={handleSummarize}
            meta={meta}
          />
        )}
      </div>
    </div>
  )
}
