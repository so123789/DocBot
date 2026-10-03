import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertIcon, ChatIcon, ChevronIcon, CopyIcon, CheckIcon, Logo, RefreshIcon, SendIcon } from './Icons'
import { MAX_QUESTION_CHARS, validateQuestion } from '../lib/validation'

const SUGGESTIONS = [
  'What is the main idea of this document?',
  'List the key terms and their definitions.',
  'What are the most important numbers or dates?',
  'What conclusions does it reach?',
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
  return (
    <button type="button" className="ghost-btn" onClick={copy} aria-label="Copy answer">
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  return (
    <div className="sources">
      <button
        type="button"
        className={`ghost-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronIcon size={14} className="chev" />
        {sources.length} source{sources.length > 1 ? 's' : ''}
      </button>
      {open && (
        <ul className="source-list">
          {sources.map((s, i) => (
            <li key={i} className="source">
              <span className="source-page">{s.location ?? (s.page != null ? `p. ${s.page}` : '?')}</span>
              {s.ocr && <span className="source-ocr" title="Read from an image with OCR">OCR</span>}
              <span className="source-text">{s.preview}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Message({ message, onRetry }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="bubble bubble-user">{message.text}</div>
      </div>
    )
  }
  if (message.role === 'error') {
    return (
      <div className="msg msg-bot">
        <div className="avatar avatar-error"><AlertIcon size={16} /></div>
        <div className="bubble bubble-error" role="alert">
          <p>{message.text}</p>
          {message.retry && (
            <button type="button" className="ghost-btn" onClick={() => onRetry(message.retry)}>
              <RefreshIcon size={14} /> Try again
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="msg msg-bot">
      <div className="avatar"><Logo size={30} /></div>
      <div className="bubble bubble-bot">
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        </div>
        <div className="bubble-actions">
          <Sources sources={message.sources} />
          <CopyButton text={message.text} />
        </div>
      </div>
    </div>
  )
}

export default function ChatView({ messages, loading, onSend, filename }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const resize = (el) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }

  const send = (text) => {
    if (loading) return
    const message = validateQuestion(text)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    onSend(text.trim())
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(value)
    }
  }

  const length = value.trim().length
  const over = length > MAX_QUESTION_CHARS
  const nearLimit = length > MAX_QUESTION_CHARS * 0.9

  return (
    <section className="chat" aria-label="Chat with your document">
      <div className="chat-scroll" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && !loading ? (
          <div className="chat-empty">
            <div className="chat-empty-icon"><ChatIcon size={28} /></div>
            <h2>Ask anything about your document</h2>
            <p>Answers come only from <strong>{filename}</strong>, with page citations.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-thread">
            {messages.map((m) => (
              <Message key={m.id} message={m} onRetry={send} />
            ))}
            {loading && (
              <div className="msg msg-bot" aria-label="DocBot is thinking">
                <div className="avatar"><Logo size={30} /></div>
                <div className="bubble bubble-bot typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        className="composer-wrap"
        onSubmit={(e) => { e.preventDefault(); send(value) }}
        noValidate
      >
        <div className={`composer${error || over ? ' has-error' : ''}`}>
          <label htmlFor="question" className="visually-hidden">Your question</label>
          <textarea
            id="question"
            ref={inputRef}
            rows={1}
            value={value}
            placeholder="Ask a question about your document…"
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
              resize(e.target)
            }}
            onKeyDown={onKeyDown}
            aria-invalid={Boolean(error) || over}
            aria-describedby="composer-hint"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={loading || length === 0 || over}
            aria-label="Send question"
          >
            <SendIcon size={18} />
          </button>
        </div>
        <div className="composer-meta" id="composer-hint">
          {error ? (
            <span className="field-error" role="alert"><AlertIcon size={14} /> {error}</span>
          ) : (
            <span className="composer-hint-text">Enter to send · Shift + Enter for a new line</span>
          )}
          <span className={`counter${over ? ' is-over' : nearLimit ? ' is-near' : ''}`}>
            {length}/{MAX_QUESTION_CHARS}
          </span>
        </div>
      </form>
    </section>
  )
}
