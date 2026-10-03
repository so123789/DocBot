import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_BYTES,
  MAX_QUESTION_CHARS,
  fileKind,
  formatBytes,
  validateFile,
  validateQuestion,
} from './validation'
import { makeFile } from '../test/helpers'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [-1, '0 B'],
    [NaN, '0 B'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected)
  })
})

describe('validateFile', () => {
  it('accepts a normal PDF', () => {
    expect(validateFile(makeFile('lecture.pdf'))).toBe('')
  })

  it('accepts an uppercase extension', () => {
    expect(validateFile(makeFile('LECTURE.PDF'))).toBe('')
  })

  it('accepts a PDF with an empty MIME type (some OSes)', () => {
    expect(validateFile(makeFile('a.pdf', { type: '' }))).toBe('')
  })

  it('accepts exactly the max size', () => {
    expect(validateFile(makeFile('a.pdf', { size: MAX_FILE_BYTES }))).toBe('')
  })

  it('requires a file', () => {
    expect(validateFile(null)).toBe('Please choose a file.')
    expect(validateFile(undefined)).toBe('Please choose a file.')
  })

  it.each([
    ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['notes.docx', 'application/zip'],
    ['scan.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.JPEG', 'image/jpeg'],
    ['pic.webp', 'image/webp'],
    ['camera.jpg', ''],
    ['upload.docx', 'application/octet-stream'],
  ])('accepts %s (%s)', (name, type) => {
    expect(validateFile(makeFile(name, { type }))).toBe('')
  })

  it.each([
    ['notes.txt', 'text/plain'],
    ['deck.pptx', 'application/vnd.ms-powerpoint'],
    ['anim.gif', 'image/gif'],
    ['doc.pdf.exe', 'application/pdf'],
  ])('rejects unsupported %s (%s)', (name, type) => {
    expect(validateFile(makeFile(name, { type }))).toMatch(/^Only PDF, Word \(\.docx\) or image/)
  })

  it.each([
    ['sneaky.pdf', 'image/png'],
    ['fake.png', 'application/pdf'],
    ['trick.docx', 'image/jpeg'],
  ])('rejects %s when its MIME type (%s) contradicts the extension', (name, type) => {
    expect(validateFile(makeFile(name, { type }))).toBe('The file type doesn’t match its extension.')
  })

  it('rejects legacy .doc files with guidance', () => {
    expect(validateFile(makeFile('old.doc', { type: 'application/msword' }))).toMatch(/save it as \.docx or PDF/)
  })

  it('rejects an empty file', () => {
    expect(validateFile(makeFile('a.pdf', { size: 0 }))).toBe('This file is empty.')
  })

  it('rejects files over the size limit with the actual size', () => {
    const msg = validateFile(makeFile('big.pdf', { size: MAX_FILE_BYTES + 1 }))
    expect(msg).toMatch(/Maximum size is 20 MB/)
    expect(msg).toMatch(/20\.0 MB/)
  })
})

describe('fileKind', () => {
  it.each([
    ['a.pdf', 'pdf'],
    ['A.DOCX', 'docx'],
    ['b.jpeg', 'image'],
    ['c.webp', 'image'],
    ['d.txt', null],
    ['', null],
  ])('%s -> %s', (name, kind) => {
    expect(fileKind(name)).toBe(kind)
  })
})

describe('validateQuestion', () => {
  it('accepts a normal question', () => {
    expect(validateQuestion('What is the main idea?')).toBe('')
  })

  it.each(['', '   ', '\n\t', 'a', null, undefined])('rejects blank/too short input %j', (q) => {
    expect(validateQuestion(q)).toBe('Please enter a question.')
  })

  it('ignores surrounding whitespace when measuring', () => {
    expect(validateQuestion(`  ${'x'.repeat(MAX_QUESTION_CHARS)}  `)).toBe('')
  })

  it('rejects questions over the limit', () => {
    expect(validateQuestion('x'.repeat(MAX_QUESTION_CHARS + 1))).toMatch(/too long \(2001\/2000/)
  })
})
