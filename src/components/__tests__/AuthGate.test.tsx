import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Auth mocks — use vi.hoisted so variables are available in the vi.mock factory ──
const {
  mockSignIn,
  mockSignUp,
  mockSignOut,
  getUserMock,
  fromMock,
  onAuthStateChangeMock,
  authStateSubscription,
} = vi.hoisted(() => {
  const authStateSubscription = { unsubscribe: vi.fn() }
  const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: authStateSubscription } }))
  return {
    mockSignIn: vi.fn(),
    mockSignUp: vi.fn(),
    mockSignOut: vi.fn(),
    getUserMock: vi.fn(),
    fromMock: vi.fn(),
    onAuthStateChangeMock,
    authStateSubscription,
  }
})

vi.mock('@/lib/auth', () => ({
  signIn: mockSignIn,
  signUp: mockSignUp,
  signOut: mockSignOut,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
    from: fromMock,
  }),
}))

// ─── Child component mocks ───────────────────────────────────────────────────
vi.mock('../ApiKeyModal', () => ({
  default: ({ onSaved, onDismiss, canDismiss }: { onSaved: () => void; onDismiss: () => void; canDismiss: boolean }) => (
    <div data-testid="api-key-modal">
      <button onClick={onSaved}>Save Key</button>
      {canDismiss && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
}))

vi.mock('../ProjectSelector', () => ({
  default: ({ userId }: { userId: string }) => <div data-testid="project-selector" data-user-id={userId} />,
}))

import AuthGate from '../AuthGate'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: unsubscribe is a no-op
  authStateSubscription.unsubscribe.mockImplementation(() => {})
  onAuthStateChangeMock.mockReturnValue({ data: { subscription: authStateSubscription } })
})

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setupNoUser() {
  getUserMock.mockResolvedValue({ data: { user: null } })
}

function setupUser(user = { id: 'user-1', email: 'test@example.com' }) {
  getUserMock.mockResolvedValue({ data: { user } })
  return user
}

function setupUserWithKey(user = { id: 'user-1', email: 'test@example.com' }) {
  setupUser(user)
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: { anthropic_api_key: 'sk-ant-existing' } })
  const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
  fromMock.mockReturnValue({ select: selectMock })
  return user
}

function setupUserWithoutKey(user = { id: 'user-2', email: 'nokey@example.com' }) {
  setupUser(user)
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: null })
  const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
  fromMock.mockReturnValue({ select: selectMock })
  return user
}

describe('AuthGate', () => {
  describe('loading state', () => {
    it('renders a spinner while auth state is being determined', () => {
      // getUser never resolves → stays in loading state
      getUserMock.mockReturnValue(new Promise(() => {}))
      const { container } = render(<AuthGate><div>App</div></AuthGate>)
      // Spinner is a div with animate-spin class
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('does not render children while loading', () => {
      getUserMock.mockReturnValue(new Promise(() => {}))
      render(<AuthGate><div data-testid="child">App</div></AuthGate>)
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    })
  })

  describe('not authenticated', () => {
    it('renders the MixLens branding when not logged in', async () => {
      setupNoUser()
      render(<AuthGate><div>App</div></AuthGate>)
      expect(await screen.findByText('MixLens')).toBeInTheDocument()
    })

    it('renders the login form by default', async () => {
      setupNoUser()
      render(<AuthGate><div>App</div></AuthGate>)
      // Both the tab and submit button say "Log in" — look for the submit button specifically
      await screen.findByText('MixLens')
      const buttons = screen.getAllByRole('button', { name: /log in/i })
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })

    it('renders both Log in and Sign up tabs', async () => {
      setupNoUser()
      render(<AuthGate><div>App</div></AuthGate>)
      await screen.findByText('MixLens')
      // There are two "Log in" occurrences (tab + submit button); just check Sign up tab is there
      expect(screen.getAllByText('Log in').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Sign up')).toBeInTheDocument()
    })

    it('does not render the app children', async () => {
      setupNoUser()
      render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
      await screen.findByText('MixLens')
      expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    })

    it('switches to signup mode when Sign up tab is clicked', async () => {
      setupNoUser()
      render(<AuthGate><div>App</div></AuthGate>)
      await userEvent.click(await screen.findByText('Sign up'))
      expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument()
    })
  })

  describe('login form submission', () => {
    it('calls signIn with email and password on login submit', async () => {
      setupNoUser()
      mockSignIn.mockResolvedValue({})
      render(<AuthGate><div>App</div></AuthGate>)

      await screen.findByText('MixLens')
      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@test.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123')
      // Submit the form directly instead of clicking by name (two buttons share "Log in")
      fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('user@test.com', 'password123')
      })
    })

    it('shows an error message on login failure', async () => {
      setupNoUser()
      mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
      render(<AuthGate><div>App</div></AuthGate>)

      await screen.findByText('MixLens')
      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'bad@test.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
      fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!)

      expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    })
  })

  describe('signup form submission', () => {
    it('calls signUp with email and password on signup', async () => {
      setupNoUser()
      mockSignUp.mockResolvedValue({})
      render(<AuthGate><div>App</div></AuthGate>)

      await userEvent.click(await screen.findByText('Sign up'))
      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@user.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'newpass123')
      await userEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('new@user.com', 'newpass123')
      })
    })

    it('shows a confirm-email message after successful signup', async () => {
      setupNoUser()
      mockSignUp.mockResolvedValue({})
      render(<AuthGate><div>App</div></AuthGate>)

      await userEvent.click(await screen.findByText('Sign up'))
      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'new@user.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass1234')
      await userEvent.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    })

    it('shows an error on signup failure', async () => {
      setupNoUser()
      mockSignUp.mockRejectedValue(new Error('Email already in use'))
      render(<AuthGate><div>App</div></AuthGate>)

      await userEvent.click(await screen.findByText('Sign up'))
      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'dup@user.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass1234')
      await userEvent.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByText('Email already in use')).toBeInTheDocument()
    })
  })

  describe('authenticated with API key', () => {
    it('renders children when user is logged in and has an API key', async () => {
      setupUserWithKey()
      render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
      expect(await screen.findByTestId('app-content')).toBeInTheDocument()
    })

    it('does not show the API key modal when key exists', async () => {
      setupUserWithKey()
      render(<AuthGate><div>App</div></AuthGate>)
      await screen.findByText('App')
      expect(screen.queryByTestId('api-key-modal')).not.toBeInTheDocument()
    })
  })

  describe('authenticated without API key', () => {
    it('shows the API key modal when user has no API key', async () => {
      setupUserWithoutKey()
      render(<AuthGate><div>App</div></AuthGate>)
      expect(await screen.findByTestId('api-key-modal')).toBeInTheDocument()
    })

    it('hides the modal after onSaved is called', async () => {
      setupUserWithoutKey()
      render(<AuthGate><div>App</div></AuthGate>)
      await screen.findByTestId('api-key-modal')
      await userEvent.click(screen.getByText('Save Key'))
      await waitFor(() => {
        expect(screen.queryByTestId('api-key-modal')).not.toBeInTheDocument()
      })
    })
  })

  describe('auth state subscription', () => {
    it('unsubscribes on unmount', async () => {
      setupUserWithKey()
      const { unmount } = render(<AuthGate><div>App</div></AuthGate>)
      await screen.findByText('App')
      unmount()
      expect(authStateSubscription.unsubscribe).toHaveBeenCalled()
    })
  })
})