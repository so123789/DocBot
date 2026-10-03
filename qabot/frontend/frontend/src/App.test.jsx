import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as api from './lib/api'
import { makeFile } from './test/helpers'

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    uploadDocument: vi.fn(),
    askQuestion: vi.fn(),
    summarizeDocument: vi.fn(),
  }
})

const META = { filename: 'biology.pdf', pages: 12, chunks: 30, characters: 24000 }

async function uploadDoc(user) {
  api.uploadDocument.mockResolvedValueOnce(META)
  await user.upload(document.getElementById('file-input'), makeFile('biology.pdf'))
  await user.click(screen.getByRole('button', { name: /analyze document/i }))
  await screen.findByRole('heading', { name: 'Ask questions' })
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the landing page first', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Summarize & study/)
    expect(screen.getByRole('heading', { name: 'Upload your document' })).toBeInTheDocument()
  })

  it('moves to the workspace after a successful upload', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    expect(api.uploadDocument).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('biology.pdf').length).toBeGreaterThan(0)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('24,000')).toBeInTheDocument()
  })

  it('stays on the landing page and shows the server error when upload fails', async () => {
    const user = userEvent.setup()
    api.uploadDocument.mockRejectedValueOnce({
      response: { status: 422, data: { detail: 'No selectable text found.' } },
    })
    render(<App />)
    await user.upload(document.getElementById('file-input'), makeFile('scan.pdf'))
    await user.click(screen.getByRole('button', { name: /analyze document/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No selectable text found.')
    expect(screen.getByRole('heading', { name: 'Upload your document' })).toBeInTheDocument()
  })

  it('asks a question and shows the answer', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    api.askQuestion.mockResolvedValueOnce({
      answer: 'Mitochondria make **ATP** (p. 4).',
      sources: [{ page: 4, preview: 'The mitochondria' }],
    })
    await user.type(screen.getByLabelText('Your question'), 'What makes ATP?{Enter}')

    expect(api.askQuestion).toHaveBeenCalledWith('What makes ATP?')
    expect(screen.getByText('What makes ATP?')).toBeInTheDocument()
    expect(await screen.findByText('ATP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 source/ })).toBeInTheDocument()
  })

  it('shows an inline error and retries a failed question', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    api.askQuestion.mockRejectedValueOnce({ request: {} })
    await user.type(screen.getByLabelText('Your question'), 'Hello there?{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/)

    api.askQuestion.mockResolvedValueOnce({ answer: 'Recovered answer', sources: [] })
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Recovered answer')).toBeInTheDocument()
    expect(api.askQuestion).toHaveBeenCalledTimes(2)
  })

  it('generates a summary when the Summary tab is opened, only once', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    api.summarizeDocument.mockResolvedValueOnce({ summary: '## Overview\nCells are the unit of life.' })
    await user.click(screen.getByRole('button', { name: /summary/i }))

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Cells are the unit of life.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ask questions/i }))
    await user.click(screen.getByRole('button', { name: /summary/i }))
    expect(api.summarizeDocument).toHaveBeenCalledTimes(1)
  })

  it('shows a summary error with a working retry', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    api.summarizeDocument.mockRejectedValueOnce({
      response: { status: 429, data: { detail: 'Too many requests to Claude.' } },
    })
    await user.click(screen.getByRole('button', { name: /summary/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests to Claude.')

    api.summarizeDocument.mockResolvedValueOnce({ summary: 'Second try worked.' })
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Second try worked.')).toBeInTheDocument()
  })

  it('shows OCR details for a Word document with scanned images', async () => {
    const user = userEvent.setup()
    render(<App />)
    api.uploadDocument.mockResolvedValueOnce({
      filename: 'lab.docx', kind: 'docx', unit: 'section', pages: 3, chunks: 9,
      characters: 5400, ocr_pages: 2, ocr_skipped: 1,
    })
    const docx = makeFile('lab.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    await user.upload(document.getElementById('file-input'), docx)
    await user.click(screen.getByRole('button', { name: /analyze document/i }))
    await screen.findByRole('heading', { name: 'Ask questions' })

    expect(screen.getByText('Sections')).toBeInTheDocument()
    expect(screen.getByText(/Text from 2 image\(s\) was read with OCR/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/1 more page\(s\)\/image\(s\) weren’t OCR’d/)

    api.askQuestion.mockResolvedValueOnce({
      answer: 'The pH was 7.4 (section 2).',
      sources: [{ page: 2, location: 'section 2', ocr: true, preview: 'Sample B pH 7.4' }],
    })
    await user.type(screen.getByLabelText('Your question'), 'What was the pH?{Enter}')
    await user.click(await screen.findByRole('button', { name: /1 source/ }))
    expect(screen.getByText('section 2')).toBeInTheDocument()
    expect(screen.getByTitle('Read from an image with OCR')).toHaveTextContent('OCR')
  })

  it('labels a single image upload correctly', async () => {
    const user = userEvent.setup()
    render(<App />)
    api.uploadDocument.mockResolvedValueOnce({
      filename: 'board.jpg', kind: 'image', unit: 'image', pages: 1, chunks: 1,
      characters: 120, ocr_pages: 1, ocr_skipped: 0,
    })
    await user.upload(document.getElementById('file-input'), makeFile('board.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: /analyze document/i }))
    await screen.findByRole('heading', { name: 'Ask questions' })
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('returns to the landing page for a new document', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadDoc(user)

    await user.click(screen.getByRole('button', { name: /new document/i }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Upload your document' })).toBeInTheDocument(),
    )
  })
})
