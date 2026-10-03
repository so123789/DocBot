import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadCard from './UploadCard'
import { MAX_FILE_BYTES } from '../lib/validation'
import { makeFile } from '../test/helpers'

function setup(props = {}) {
  const onSubmit = vi.fn()
  // applyAccept: false so we can prove our own validation rejects non-PDFs.
  const user = userEvent.setup({ applyAccept: false })
  render(<UploadCard onSubmit={onSubmit} uploading={false} progress={0} serverError="" {...props} />)
  const input = document.getElementById('file-input')
  return { user, onSubmit, input }
}

describe('UploadCard', () => {
  it('explains OCR for scans and images before upload', () => {
    setup()
    const note = screen.getByRole('note', { name: /about scanned files/i })
    expect(note).toHaveTextContent(/Scans & images welcome/)
    expect(note).toHaveTextContent(/OCR/)
    expect(note).toHaveTextContent(/handwriting/)
  })

  it('advertises all supported types in the file picker', () => {
    const { input } = setup()
    const accept = input.getAttribute('accept')
    for (const t of ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', 'application/pdf', 'image/png']) {
      expect(accept).toContain(t)
    }
  })

  it.each([
    ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'],
    ['whiteboard.jpg', 'image/jpeg', 'Image'],
    ['scan.png', 'image/png', 'Image'],
  ])('accepts %s and labels its type', async (name, type, label) => {
    const { user, onSubmit, input } = setup()
    const file = makeFile(name, { type })
    await user.upload(input, file)
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${label} ·`))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /analyze document/i }))
    expect(onSubmit).toHaveBeenCalledWith(file)
  })

  it('rejects legacy .doc files with guidance', async () => {
    const { user, input } = setup()
    await user.upload(input, makeFile('old.doc', { type: 'application/msword' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/save it as .docx or PDF/)
  })

  it('disables Analyze until a file is chosen', () => {
    setup()
    expect(screen.getByRole('button', { name: /analyze document/i })).toBeDisabled()
  })

  it('accepts a valid PDF and submits it', async () => {
    const { user, onSubmit, input } = setup()
    const file = makeFile('chapter-1.pdf')
    await user.upload(input, file)

    expect(screen.getByText('chapter-1.pdf')).toBeInTheDocument()
    const analyze = screen.getByRole('button', { name: /analyze document/i })
    expect(analyze).toBeEnabled()
    await user.click(analyze)
    expect(onSubmit).toHaveBeenCalledWith(file)
  })

  it('rejects non-PDF files with an alert', async () => {
    const { user, onSubmit, input } = setup()
    await user.upload(input, makeFile('notes.txt', { type: 'text/plain' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF, Word (.docx) or image (PNG, JPG, WEBP) files are supported.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: /analyze document/i })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects oversized files', async () => {
    const { user, input } = setup()
    await user.upload(input, makeFile('huge.pdf', { size: MAX_FILE_BYTES + 1 }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Maximum size is 20 MB/)
  })

  it('rejects empty files', async () => {
    const { user, input } = setup()
    await user.upload(input, makeFile('empty.pdf', { size: 0 }))
    expect(screen.getByRole('alert')).toHaveTextContent('This file is empty.')
  })

  it('clears a previous error when a valid file is picked', async () => {
    const { user, input } = setup()
    await user.upload(input, makeFile('bad.txt', { type: 'text/plain' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.upload(input, makeFile('good.pdf'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('removes the selected file', async () => {
    const { user, input } = setup()
    await user.upload(input, makeFile('a.pdf'))
    await user.click(screen.getByRole('button', { name: /remove selected file/i }))
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze document/i })).toBeDisabled()
  })

  it('accepts a dropped PDF', () => {
    setup()
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [makeFile('dropped.pdf')] } })
    expect(screen.getByText('dropped.pdf')).toBeInTheDocument()
  })

  it('rejects dropping multiple files', () => {
    setup()
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [makeFile('a.pdf'), makeFile('b.pdf')] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/one file at a time/)
  })

  it('shows server errors', () => {
    setup({ serverError: 'Could not read this PDF.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read this PDF.')
  })

  it('shows progress while uploading and hides the submit button', () => {
    setup({ uploading: true, progress: 40 })
    expect(screen.getByRole('status')).toHaveTextContent('Uploading… 40%')
    expect(screen.queryByRole('button', { name: /analyze document/i })).not.toBeInTheDocument()
  })

  it('switches to indexing text once the upload completes', () => {
    setup({ uploading: true, progress: 100 })
    expect(screen.getByRole('status')).toHaveTextContent(/running OCR/)
  })
})
