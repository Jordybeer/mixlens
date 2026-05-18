'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggle: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  // Init from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mixlens-theme') as Theme | null
      const resolved = stored ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      setTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    } catch { /* sandboxed */ }
  }, [])

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      try { localStorage.setItem('mixlens-theme', next) } catch { /* sandboxed */ }
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
