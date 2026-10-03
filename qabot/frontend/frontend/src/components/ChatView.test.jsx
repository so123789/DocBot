import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatView from './ChatView'
import { MAX_QUESTION_CHARS } from '../lib/validation'

function setup(props = {}) {
  const onSend = vi.fn()
  const user = userEvent.setup()
  render(<ChatView messages={[]} loading={false} onSend={onSend} filename="bio.pdf" {...props} />)
  return { user, onSend, input: screen.getByLabelText('Your question') }
}

describe('ChatView', () => {
  it('shows the empty state with suggestions', () => {
    setup()
    expect(screen.getByText(/Ask anything about your document/)).toBeInTheDocument()
    expect(screen.getByText('bio.pdf')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\?$|definitions\./ }).length).toBeGreaterThan(0)
  })

  it('sends a trimmed question on Enter and clears the input', async () => {
    const { user, onSend, input } = setup()
    await user.type(input, '  What is ATP?  {Enter}')
    expect(onSend).toHaveBeenCalledWith('What is ATP?')
    expect(input).toHaveValue('')
  })

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const { user, onSend, input } = setup()
    await user.type(input, 'Line one{Shift>}{Enter}{/Shift}Line two')
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('Line one\nLine two')
  })

  it('sends a suggestion when clicked', async () => {
    const { user, onSend } = setup()
    await user.click(screen.getByRole('button', { name: 'What conclusions does it reach?' }))
    expect(onSend).toHaveBeenCalledWith('What conclusions does it reach?')
  })

  it('keeps send disabled for blank input', async () => {
    const { user, input } = setup()
    await user.type(input, '   ')
    expect(screen.getByRole('button', { name: /send question/i })).toBeDisabled()
  })

  it('shows a validation error for a too-short question', async () => {
    const { user, onSend, input } = setup()
    await user.type(input, 'a{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a question.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the validation error when the user keeps typing', async () => {
    const { user, input } = setup()
    await user.type(input, 'a{Enter}')
    await user.type(input, 'b')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('blocks questions over the character limit and flags the counter', () => {
    const { onSend, input } = setup()
    fireEvent.change(input, { target: { value: 'x'.repeat(MAX_QUESTION_CHARS + 5) } })
    expect(screen.getByText(`${MAX_QUESTION_CHARS + 5}/${MAX_QUESTION_CHARS}`)).toHaveClass('is-over')
    expect(screen.getByRole('button', { name: /send question/i })).toBeDisabled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/too long/)
  })

  it('does not send while a reply is loading', async () => {
    const messages = [{ id: '1', role: 'user', text: 'Hi there' }]
    const { user, onSend, input } = setup({ messages, loading: true })
    await user.type(input, 'Another question{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('DocBot is thinking')).toBeInTheDocument()
  })

  it('renders markdown answers and toggles sources', async () => {
    const messages = [
      { id: '1', role: 'user', text: 'What is it?' },
      {
        id: '2',
        role: 'assistant',
        text: '**Photosynthesis** turns light into energy.',
        sources: [{ page: 3, preview: 'Plants use chlorophyll' }],
      },
    ]
    const { user } = setup({ messages })
    expect(screen.getByText('Photosynthesis').tagName).toBe('STRONG')

    const toggle = screen.getByRole('button', { name: /1 source/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('p. 3')).toBeInTheDocument()
    expect(screen.getByText(/Plants use chlorophyll/)).toBeInTheDocument()
  })

  it('shows errors with a retry that resends the question', async () => {
    const messages = [{ id: '1', role: 'error', text: 'Could not reach Claude.', retry: 'What is ATP?' }]
    const { user, onSend } = setup({ messages })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Claude.')
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onSend).toHaveBeenCalledWith('What is ATP?')
  })
})
