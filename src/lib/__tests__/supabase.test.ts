import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock @supabase/ssr — use vi.hoisted so variables are available in the factory ──
const { createBrowserClientMock, createServerClientMock, cookiesSetMock, mockBrowserClient, mockServerClient } = vi.hoisted(() => {
  const mockBrowserClient = { type: 'browser-client' }
  const mockServerClient = { type: 'server-client' }
  return {
    mockBrowserClient,
    mockServerClient,
    createBrowserClientMock: vi.fn(() => mockBrowserClient),
    createServerClientMock: vi.fn(() => mockServerClient),
    cookiesSetMock: vi.fn(),
  }
})

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: createBrowserClientMock,
  createServerClient: createServerClientMock,
}))

vi.mock('next/server', () => ({
  NextResponse: {
    next: () => ({
      cookies: { set: cookiesSetMock },
    }),
  },
}))

// Set required env vars before importing
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

import { createClient, createRouteHandlerClient } from '../supabase'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('supabase.ts', () => {
  describe('createClient (browser)', () => {
    it('calls createBrowserClient with NEXT_PUBLIC env vars', () => {
      const client = createClient()
      expect(createBrowserClientMock).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      )
      expect(client).toBe(mockBrowserClient)
    })

    it('returns the result of createBrowserClient', () => {
      const client = createClient()
      expect(client).toBe(mockBrowserClient)
    })
  })

  describe('createRouteHandlerClient (server)', () => {
    function makeRequest(cookiesList: { name: string; value: string }[] = []) {
      return {
        cookies: {
          getAll: () => cookiesList,
        },
      } as unknown as import('next/server').NextRequest
    }

    it('calls createServerClient with NEXT_PUBLIC env vars', () => {
      const req = makeRequest()
      createRouteHandlerClient(req)
      expect(createServerClientMock).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({ cookies: expect.any(Object) })
      )
    })

    it('returns an object with supabase and response keys', () => {
      const req = makeRequest()
      const result = createRouteHandlerClient(req)
      expect(result).toHaveProperty('supabase')
      expect(result).toHaveProperty('response')
    })

    it('supabase is the result of createServerClient', () => {
      const req = makeRequest()
      const { supabase } = createRouteHandlerClient(req)
      expect(supabase).toBe(mockServerClient)
    })

    it('getAll cookie handler forwards all cookies from the request', () => {
      const cookies = [
        { name: 'sb-access-token', value: 'tok123' },
        { name: 'sb-refresh-token', value: 'ref456' },
      ]
      const req = makeRequest(cookies)
      createRouteHandlerClient(req)

      // Pull the cookies config passed to createServerClient
      const callArg = createServerClientMock.mock.calls[0][2] as { cookies: { getAll: () => unknown } }
      const returned = callArg.cookies.getAll()
      expect(returned).toEqual(cookies)
    })

    it('setAll cookie handler calls response.cookies.set for each cookie', () => {
      const req = makeRequest()
      createRouteHandlerClient(req)

      const callArg = createServerClientMock.mock.calls[0][2] as {
        cookies: {
          setAll: (c: { name: string; value: string; options: object }[]) => void
        }
      }
      callArg.cookies.setAll([
        { name: 'cookie-a', value: 'val-a', options: { httpOnly: true } },
        { name: 'cookie-b', value: 'val-b', options: {} },
      ])

      expect(cookiesSetMock).toHaveBeenCalledTimes(2)
      expect(cookiesSetMock).toHaveBeenNthCalledWith(1, 'cookie-a', 'val-a', { httpOnly: true })
      expect(cookiesSetMock).toHaveBeenNthCalledWith(2, 'cookie-b', 'val-b', {})
    })

    it('setAll with an empty array does not call response.cookies.set', () => {
      const req = makeRequest()
      createRouteHandlerClient(req)

      const callArg = createServerClientMock.mock.calls[0][2] as {
        cookies: { setAll: (c: unknown[]) => void }
      }
      callArg.cookies.setAll([])
      expect(cookiesSetMock).not.toHaveBeenCalled()
    })
  })
})