import { useRef, useState } from 'react'
import { AlertIcon, CloseIcon, FileIcon, ImageIcon, InfoIcon, UploadIcon } from './Icons'
import { ACCEPT, MAX_FILE_MB, fileKind, formatBytes, validateFile } from '../lib/validation'

const KIND_LABEL = { pdf: 'PDF', docx: 'Word', image: 'Image' }

/**
 * Drag-and-drop document picker (PDF, DOCX, images) with client-side validation.
 * Calls onSubmit(file) once the user confirms; parent owns the upload request.
 */
export default function UploadCard({ onSubmit, uploading, progress, serverError }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const pick = (candidate) => {
    const message = validateFile(candidate)
    setError(message)
    setFile(message ? null : candidate)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const dropped = e.dataTransfer.files
    if (dropped.length > 1) {
      setError('Please drop one file at a time.')
      return
    }
    pick(dropped[0])
  }

  const clear = () => {
    setFile(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const shownError = error || serverError

  return (
    <div className="upload-card">
      <div className="upload-card-head">
        <span className="pill pill-soft">Step 1</span>
        <h2>Upload your document</h2>
        <p>PDF, Word (.docx), PNG, JPG or WEBP · up to {MAX_FILE_MB} MB</p>
      </div>

      <div className="notice" role="note" aria-label="About scanned files">
        <span className="notice-icon"><InfoIcon size={18} /></span>
        <p>
          <strong>Scans & images welcome.</strong> Text in scanned pages, photos and pictures inside your
          document is read with OCR. This takes a little longer, and handwriting or blurry photos may not
          be recognised accurately.
        </p>
      </div>

      <div
        className={`dropzone${dragOver ? ' is-over' : ''}${shownError ? ' has-error' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="dropzone"
      >
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={uploading}
          aria-describedby={shownError ? 'upload-error' : undefined}
          aria-invalid={Boolean(shownError)}
        />
        <div className="dropzone-icon"><UploadIcon size={26} /></div>
        <p className="dropzone-title">Drag & drop your file here</p>
        <p className="dropzone-sub">or</p>
        <label htmlFor="file-input" className="btn btn-outline btn-sm">Browse files</label>
      </div>

      {file && (
        <div className="file-chip">
          <span className={`file-chip-icon kind-${fileKind(file.name)}`}>
            {fileKind(file.name) === 'image' ? <ImageIcon size={18} /> : <FileIcon size={18} />}
          </span>
          <span className="file-chip-text">
            <span className="file-chip-name" title={file.name}>{file.name}</span>
            <span className="file-chip-size">{KIND_LABEL[fileKind(file.name)]} · {formatBytes(file.size)}</span>
          </span>
          {!uploading && (
            <button type="button" className="icon-btn" onClick={clear} aria-label="Remove selected file">
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      )}

      {shownError && (
        <p className="field-error" id="upload-error" role="alert">
          <AlertIcon size={16} /> {shownError}
        </p>
      )}

      {uploading ? (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-label">
            <span>{progress < 100 ? `Uploading… ${progress}%` : 'Reading text (running OCR on scans & images)…'}</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill${progress >= 100 ? ' is-indeterminate' : ''}`}
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!file}
          onClick={() => file && onSubmit(file)}
        >
          Analyze document
        </button>
      )}
    </div>
  )
}
