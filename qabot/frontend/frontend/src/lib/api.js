import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const http = axios.create({ baseURL: API_URL, timeout: 180_000 })

/** Turn any axios/API error into one sentence a user can act on. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (error?.response) {
    const detail = error.response.data?.detail
    if (typeof detail === 'string' && detail) return detail
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
    if (error.response.status === 413) return 'File is too large.'
    return fallback
  }
  if (error?.request) return 'Cannot reach the server. Is the backend running?'
  return fallback
}

export async function uploadDocument(file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  const res = await http.post('/upload', form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  return res.data
}

export async function askQuestion(question) {
  const res = await http.post('/ask', { question })
  return res.data
}

export async function summarizeDocument() {
  const res = await http.post('/summarize')
  return res.data
}
