import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertIcon, CheckIcon, CopyIcon, RefreshIcon, SparkleIcon } from './Icons'

export default function SummaryView({ summary, loading, error, onGenerate, meta }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <section className="summary" aria-label="Document summary" aria-busy={loading}>
      <div className="summary-card">
        <header className="summary-head">
          <span className="feature-icon tone-violet"><SparkleIcon size={20} /></span>
          <div>
            <h2>Document summary</h2>
            <p>
              {meta.unit === 'image' ? 'Image' : `${meta.pages} ${meta.unit === 'section' ? 'sections' : 'pages'}`}
              {' · '}{meta.characters.toLocaleString()} characters
              {meta.ocrPages > 0 && ' · includes OCR text'}
            </p>
          </div>
          {summary && !loading && (
            <div className="summary-actions">
              <button type="button" className="ghost-btn" onClick={copy}>
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="ghost-btn" onClick={onGenerate}>
                <RefreshIcon size={14} /> Regenerate
              </button>
            </div>
          )}
        </header>

        {loading && (
          <div className="skeleton" role="status" aria-label="Generating summary">
            <p className="skeleton-label">Reading your document…</p>
            <span className="sk sk-h" />
            <span className="sk" />
            <span className="sk" />
            <span className="sk sk-short" />
            <span className="sk sk-h" />
            <span className="sk" />
            <span className="sk sk-short" />
          </div>
        )}

        {error && !loading && (
          <div className="summary-error" role="alert">
            <AlertIcon size={18} />
            <p>{error}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onGenerate}>Try again</button>
          </div>
        )}

        {!loading && !error && !summary && (
          <div className="summary-empty">
            <p>Generate a structured overview with key topics and important details.</p>
            <button type="button" className="btn btn-primary" onClick={onGenerate}>
              <SparkleIcon size={16} /> Generate summary
            </button>
          </div>
        )}

        {summary && !loading && (
          <article className="markdown summary-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </article>
        )}
      </div>
    </section>
  )
}
