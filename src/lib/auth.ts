import { createClient } from './supabase'

export async function signUp(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function getSession() {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUser() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}
