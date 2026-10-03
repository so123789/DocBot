import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './api'

describe('getErrorMessage', () => {
  it('uses a string detail from the API', () => {
    const err = { response: { status: 400, data: { detail: 'Only PDF files are allowed.' } } }
    expect(getErrorMessage(err)).toBe('Only PDF files are allowed.')
  })

  it('uses the first message of a FastAPI validation array', () => {
    const err = { response: { status: 422, data: { detail: [{ msg: 'Field required' }] } } }
    expect(getErrorMessage(err)).toBe('Field required')
  })

  it('handles 413 without a body (e.g. proxy limit)', () => {
    expect(getErrorMessage({ response: { status: 413, data: '' } })).toBe('File is too large.')
  })

  it('falls back for unknown server errors', () => {
    expect(getErrorMessage({ response: { status: 500, data: {} } }, 'Nope')).toBe('Nope')
  })

  it('explains network failures', () => {
    expect(getErrorMessage({ request: {} })).toMatch(/Cannot reach the server/)
  })

  it('explains timeouts', () => {
    expect(getErrorMessage({ code: 'ECONNABORTED', request: {} })).toMatch(/timed out/)
  })

  it('handles non-axios errors', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.')
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.')
  })
})
