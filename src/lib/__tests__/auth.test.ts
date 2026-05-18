import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock the supabase module ───────────────────────────────────────────────
// auth.ts calls createClient() which in turn calls createBrowserClient from
// @supabase/ssr. We mock the whole supabase module so tests stay offline.

const mockSignUp = vi.fn()
const mockSignIn = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignIn,
      signOut: mockSignOut,
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  }),
}))

// Import after mocking
import { signUp, signIn, signOut, getSession, getUser } from '../auth'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auth.ts', () => {
  describe('signUp', () => {
    it('calls supabase.auth.signUp with email and password', async () => {
      const mockUser = { id: 'user-1', email: 'a@b.com' }
      mockSignUp.mockResolvedValue({ data: { user: mockUser, session: null }, error: null })

      const result = await signUp('a@b.com', 'password123')
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' })
      expect(result).toEqual({ user: mockUser, session: null })
    })

    it('throws when Supabase returns an error', async () => {
      mockSignUp.mockResolvedValue({ data: null, error: { message: 'Email already registered' } })

      await expect(signUp('a@b.com', 'pass')).rejects.toThrow('Email already registered')
    })

    it('throws with the exact Supabase error message', async () => {
      mockSignUp.mockResolvedValue({ data: null, error: { message: 'Password is too short' } })

      await expect(signUp('x@y.com', '123')).rejects.toThrow('Password is too short')
    })
  })

  describe('signIn', () => {
    it('calls supabase.auth.signInWithPassword with email and password', async () => {
      const mockSession = { access_token: 'tok', user: { id: 'u1' } }
      mockSignIn.mockResolvedValue({ data: { user: { id: 'u1' }, session: mockSession }, error: null })

      const result = await signIn('user@example.com', 'secret')
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret' })
      expect(result).toEqual({ user: { id: 'u1' }, session: mockSession })
    })

    it('throws when credentials are invalid', async () => {
      mockSignIn.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } })

      await expect(signIn('bad@user.com', 'wrong')).rejects.toThrow('Invalid login credentials')
    })

    it('throws for network-level errors', async () => {
      mockSignIn.mockResolvedValue({ data: null, error: { message: 'Network request failed' } })

      await expect(signIn('a@b.com', 'p')).rejects.toThrow('Network request failed')
    })
  })

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      mockSignOut.mockResolvedValue({})
      await signOut()
      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it('does not throw on successful sign-out', async () => {
      mockSignOut.mockResolvedValue({})
      await expect(signOut()).resolves.toBeUndefined()
    })
  })

  describe('getSession', () => {
    it('returns the session from supabase', async () => {
      const session = { access_token: 'abc', user: { id: 'u2' } }
      mockGetSession.mockResolvedValue({ data: { session } })

      const result = await getSession()
      expect(result).toEqual(session)
    })

    it('returns null when there is no active session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } })

      const result = await getSession()
      expect(result).toBeNull()
    })
  })

  describe('getUser', () => {
    it('returns the user from supabase', async () => {
      const user = { id: 'u3', email: 'user@test.com' }
      mockGetUser.mockResolvedValue({ data: { user } })

      const result = await getUser()
      expect(result).toEqual(user)
    })

    it('returns null when there is no authenticated user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const result = await getUser()
      expect(result).toBeNull()
    })
  })
})