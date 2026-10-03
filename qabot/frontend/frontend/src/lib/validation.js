// Client-side validation — mirrors qabot/backend/validation.py so users get
// instant feedback. The backend re-validates everything.

export const MAX_FILE_MB = 20
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
export const MIN_QUESTION_CHARS = 2
export const MAX_QUESTION_CHARS = 2000

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const FILE_KINDS = {
  pdf: { extensions: ['.pdf'], mimes: ['application/pdf', 'application/x-pdf'] },
  docx: { extensions: ['.docx'], mimes: [DOCX_MIME, 'application/zip'] },
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.webp'],
    mimes: ['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/webp'],
  },
}

// Value for <input accept>: extensions + MIME types.
export const ACCEPT = Object.values(FILE_KINDS)
  .flatMap((k) => [...k.extensions, ...k.mimes.filter((m) => m !== 'application/zip')])
  .join(',')

const GENERIC_MIMES = ['', 'application/octet-stream']

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Returns 'pdf' | 'docx' | 'image' based on the file extension, or null. */
export function fileKind(name = '') {
  const lower = name.toLowerCase()
  for (const [kind, { extensions }] of Object.entries(FILE_KINDS)) {
    if (extensions.some((ext) => lower.endsWith(ext))) return kind
  }
  return null
}

/** Returns an error message, or '' when the file is acceptable. */
export function validateFile(file) {
  if (!file) return 'Please choose a file.'
  const name = file.name || ''
  if (name.toLowerCase().endsWith('.doc')) {
    return 'Legacy .doc files aren’t supported. Please save it as .docx or PDF.'
  }
  const kind = fileKind(name)
  if (!kind) return 'Only PDF, Word (.docx) or image (PNG, JPG, WEBP) files are supported.'
  // Some OSes report an empty/generic type; fall back to the extension in that case.
  const type = file.type || ''
  if (!GENERIC_MIMES.includes(type) && !FILE_KINDS[kind].mimes.includes(type)) {
    return 'The file type doesn’t match its extension.'
  }
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FILE_BYTES) {
    return `File is ${formatBytes(file.size)}. Maximum size is ${MAX_FILE_MB} MB.`
  }
  return ''
}

/** Returns an error message, or '' when the question is acceptable. */
export function validateQuestion(question) {
  const trimmed = (question ?? '').trim()
  if (trimmed.length < MIN_QUESTION_CHARS) return 'Please enter a question.'
  if (trimmed.length > MAX_QUESTION_CHARS) {
    return `Question is too long (${trimmed.length}/${MAX_QUESTION_CHARS} characters).`
  }
  return ''
}
