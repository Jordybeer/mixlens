import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

// ─── Browser client (components) ────────────────────────────────────────────
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Server / Route-handler client ──────────────────────────────────────────
// Usage inside an API route:
//   const { supabase, response } = createRouteHandlerClient(request)
//   // … do your queries with supabase …
//   return response  // or return NextResponse.json({…}) — response carries any
//                    // Set-Cookie headers written by supabase during the request
export function createRouteHandlerClient(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return { supabase, response }
}
