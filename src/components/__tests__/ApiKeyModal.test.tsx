import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock Supabase ──────────────────────────────────────────────────────────
const upsertMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}))

import ApiKeyModal from '../ApiKeyModal'

const defaultProps = {
  userId: 'user-abc',
  onSaved: vi.fn(),
  canDismiss: true,
  onDismiss: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertMock.mockResolvedValue({ error: null })
})

describe('ApiKeyModal', () => {
  describe('rendering', () => {
    it('renders the modal heading', () => {
      render(<ApiKeyModal {...defaultProps} />)
      expect(screen.getByText('Anthropic API Key')).toBeInTheDocument()
    })

    it('renders the password input', () => {
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'password')
    })

    it('renders the save button initially not busy', () => {
      render(<ApiKeyModal {...defaultProps} />)
      expect(screen.getByRole('button', { name: /save key/i })).toBeInTheDocument()
    })

    it('renders the dismiss button when canDismiss is true', () => {
      render(<ApiKeyModal {...defaultProps} canDismiss={true} />)
      expect(screen.getByText('×')).toBeInTheDocument()
    })

    it('does not render the dismiss button when canDismiss is false', () => {
      render(<ApiKeyModal {...defaultProps} canDismiss={false} />)
      expect(screen.queryByText('×')).not.toBeInTheDocument()
    })

    it('renders the link to console.anthropic.com', () => {
      render(<ApiKeyModal {...defaultProps} />)
      const link = screen.getByRole('link', { name: /console\.anthropic\.com/i })
      expect(link).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys')
      expect(link).toHaveAttribute('target', '_blank')
    })
  })

  describe('dismiss button', () => {
    it('calls onDismiss when the × button is clicked', async () => {
      const onDismiss = vi.fn()
      render(<ApiKeyModal {...defaultProps} onDismiss={onDismiss} />)
      await userEvent.click(screen.getByText('×'))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })

  describe('form validation', () => {
    it('shows an error when key does not start with sk-ant-', async () => {
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'invalid-key')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))
      expect(await screen.findByText('Key must start with sk-ant-')).toBeInTheDocument()
    })

    it('does not call supabase when the key is invalid', async () => {
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'bad-key')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))
      expect(upsertMock).not.toHaveBeenCalled()
    })

    it('clears any previous error when a new valid key is submitted', async () => {
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')

      // Trigger an error first
      await userEvent.type(input, 'bad')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))
      expect(screen.getByText('Key must start with sk-ant-')).toBeInTheDocument()

      // Now type a valid key and submit successfully
      await userEvent.clear(input)
      await userEvent.type(input, 'sk-ant-api03-validkey123')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      await waitFor(() => {
        expect(screen.queryByText('Key must start with sk-ant-')).not.toBeInTheDocument()
      })
    })
  })

  describe('successful save', () => {
    it('calls supabase upsert with the trimmed API key and userId', async () => {
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-api03-abc123  ')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      await waitFor(() => expect(upsertMock).toHaveBeenCalled())
      const [upsertArg] = upsertMock.mock.calls[0]
      expect(upsertArg.user_id).toBe('user-abc')
      expect(upsertArg.anthropic_api_key).toBe('sk-ant-api03-abc123')
    })

    it('calls onSaved after a successful upsert', async () => {
      const onSaved = vi.fn()
      render(<ApiKeyModal {...defaultProps} onSaved={onSaved} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-validkey')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    })
  })

  describe('failed save', () => {
    it('shows an error message when upsert fails', async () => {
      upsertMock.mockResolvedValue({ error: { message: 'Unique constraint violation' } })
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-some-key')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      expect(await screen.findByText('Unique constraint violation')).toBeInTheDocument()
    })

    it('does not call onSaved when upsert fails', async () => {
      upsertMock.mockResolvedValue({ error: { message: 'DB error' } })
      const onSaved = vi.fn()
      render(<ApiKeyModal {...defaultProps} onSaved={onSaved} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-some-key')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument())
      expect(onSaved).not.toHaveBeenCalled()
    })

    it('shows a fallback error message when the thrown error is not an Error instance', async () => {
      upsertMock.mockRejectedValue('unexpected string error')
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-some-key')
      await userEvent.click(screen.getByRole('button', { name: /save key/i }))

      expect(await screen.findByText('Failed to save key.')).toBeInTheDocument()
    })
  })

  describe('busy state', () => {
    it('shows Saving… text while the request is in flight', async () => {
      // Never resolve so we can observe the busy state
      upsertMock.mockReturnValue(new Promise(() => {}))
      render(<ApiKeyModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('sk-ant-api03-…')
      await userEvent.type(input, 'sk-ant-validkey')
      fireEvent.click(screen.getByRole('button', { name: /save key/i }))

      expect(await screen.findByText('Saving…')).toBeInTheDocument()
    })
  })
})