import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import LogsViewer from '@/components/LogsViewer'

const ALLOWED_USER_ID = '60875677-1edd-4528-8595-95c66546f946'

export default async function LogsPage() {
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

  if (!user || user.id !== ALLOWED_USER_ID) {
    redirect('/')
  }

  return <LogsViewer />
}
