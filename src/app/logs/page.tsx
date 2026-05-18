import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import LogsViewer from '@/components/LogsViewer'

export default async function LogsPage() {
  const adminId = process.env.ADMIN_USER_ID
  if (!adminId) redirect('/')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== adminId) redirect('/')

  return <LogsViewer />
}
