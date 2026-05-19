'use client'

import React, { useEffect, useRef, useState } from 'react'

type LogLevel = 'log' | 'info' | 'warn' | 'error'

interface LogEntry {
  id: number
  level: LogLevel
  timestamp: string
  args: unknown[]
  stack?: string
}

const LEVEL_STYLES: Record<LogLevel, { className: string; style?: React.CSSProperties }> = {
  log:   { className: 'border-[var(--border)]',                    style: { color: 'var(--text-muted)' } },
  info:  { className: 'border-[var(--sev-minor)]',                 style: { color: 'var(--sev-minor)', borderColor: 'color-mix(in srgb, var(--sev-minor) 30%, transparent)' } },
  warn:  { className: 'border-[var(--sev-important)]',             style: { color: 'var(--sev-important)', borderColor: 'color-mix(in srgb, var(--sev-important) 30%, transparent)' } },
  error: { className: 'border-[var(--sev-critical)]',              style: { color: 'var(--sev-critical)', borderColor: 'color-mix(in srgb, var(--sev-critical) 30%, transparent)' } },
}

const LEVEL_BADGE_STYLE: Record<LogLevel, React.CSSProperties> = {
  log:   { background: 'var(--overlay-subtle)',   color: 'var(--text-faint)' },
  info:  { background: 'color-mix(in srgb, var(--sev-minor)     15%, transparent)', color: 'var(--sev-minor)' },
  warn:  { background: 'color-mix(in srgb, var(--sev-important) 15%, transparent)', color: 'var(--sev-important)' },
  error: { background: 'color-mix(in srgb, var(--sev-critical)  15%, transparent)', color: 'var(--sev-critical)' },
}

function serialize(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try { return JSON.stringify(val, null, 2) } catch { return String(val) }
}

let _counter = 0

export function initLogInterceptor(onLog: (entry: LogEntry) => void) {
  const methods: LogLevel[] = ['log', 'info', 'warn', 'error']
  const originals: Partial<Record<LogLevel, typeof console.log>> = {}

  methods.forEach((level) => {
    originals[level] = console[level].bind(console)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(console as any)[level] = (...args: unknown[]) => {
      originals[level]!(...args)
      const entry: LogEntry = {
        id: ++_counter,
        level,
        timestamp: new Date().toISOString(),
        args,
        stack: level === 'error' ? new Error().stack?.split('\n').slice(2).join('\n') : undefined,
      }
      onLog(entry)
    }
  })

  // Also catch unhandled errors
  const onUnhandled = (e: ErrorEvent) => {
    onLog({
      id: ++_counter,
      level: 'error',
      timestamp: new Date().toISOString(),
      args: [`[unhandled] ${e.message}`, e.filename ? `${e.filename}:${e.lineno}` : ''],
      stack: e.error?.stack,
    })
  }
  const onUnhandledRejection = (e: PromiseRejectionEvent) => {
    onLog({
      id: ++_counter,
      level: 'error',
      timestamp: new Date().toISOString(),
      args: [`[unhandled rejection] ${String(e.reason)}`],
      stack: e.reason?.stack,
    })
  }
  window.addEventListener('error', onUnhandled)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    methods.forEach((level) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(console as any)[level] = originals[level]
    })
    window.removeEventListener('error', onUnhandled)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

const MAX_LOGS = 500

export default function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const cleanup = initLogInterceptor((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry]
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
      })
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, autoScroll])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = logs.filter((l) => {
    if (filter !== 'ALL' && l.level !== filter) return false
    if (search) {
      const text = l.args.map(serialize).join(' ').toLowerCase()
      if (!text.includes(search.toLowerCase())) return false
    }
    return true
  })

  const counts: Record<LogLevel, number> = { log: 0, info: 0, warn: 0, error: 0 }
  logs.forEach((l) => counts[l.level]++)

  return (
    <div className="min-h-screen font-mono text-xs" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg) 95%, transparent)' }}>
        <span className="text-sm font-sans font-semibold mr-2" style={{ color: 'var(--text)' }}>MixLens Logs</span>

        {/* Level filters */}
        {(['ALL', 'log', 'info', 'warn', 'error'] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className="px-2.5 py-1 rounded-md text-[11px] font-sans transition-colors"
            style={filter === lvl
              ? lvl === 'ALL'
                ? { background: 'var(--overlay-subtle)', color: 'var(--text)' }
                : LEVEL_BADGE_STYLE[lvl as LogLevel]
              : { color: 'var(--text-faint)' }
            }
          >
            {lvl.toUpperCase()}
            {lvl !== 'ALL' && (
              <span className="ml-1 opacity-60">{counts[lvl as LogLevel]}</span>
            )}
          </button>
        ))}

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs…"
          className="flex-1 min-w-[160px] rounded-md px-3 py-1 text-xs focus:outline-none font-sans"
          style={{ background: 'var(--overlay-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        />

        <button
          onClick={() => setAutoScroll((v) => !v)}
          className="px-2.5 py-1 rounded-md text-[11px] font-sans transition-colors"
          style={autoScroll
            ? { background: 'color-mix(in srgb, var(--sev-minor) 20%, transparent)', color: 'var(--sev-minor)' }
            : { color: 'var(--text-faint)' }
          }
        >
          Auto-scroll
        </button>

        <button
          onClick={() => setLogs([])}
          className="px-2.5 py-1 rounded-md text-[11px] font-sans transition-colors"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sev-critical)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
        >
          Clear
        </button>

        <span className="font-sans text-[11px] ml-auto" style={{ color: 'var(--text-faint)' }}>{filtered.length} / {logs.length}</span>
      </div>

      {/* Log list */}
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {filtered.length === 0 && (
          <div className="px-6 py-16 text-center font-sans text-sm" style={{ color: 'var(--text-faint)' }}>
            {logs.length === 0 ? 'Waiting for logs…' : 'No logs match filter'}
          </div>
        )}

        {filtered.map((entry) => {
          const isOpen = expanded.has(entry.id)
          const primaryText = entry.args.map(serialize).join(' ')
          const hasDetail = entry.args.length > 1 ||
            (entry.args.length === 1 && typeof entry.args[0] === 'object' && entry.args[0] !== null) ||
            !!entry.stack

          return (
            <div
              key={entry.id}
              className={`border-l-2 ${hasDetail ? 'cursor-pointer' : ''}`}
              style={LEVEL_STYLES[entry.level].style}
              onClick={() => hasDetail && toggleExpand(entry.id)}
            >
              <div className="flex items-start gap-3 px-4 py-2">
                {/* Level badge */}
                <span
                  className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-medium"
                  style={LEVEL_BADGE_STYLE[entry.level]}
                >
                  {entry.level}
                </span>

                {/* Timestamp */}
                <span className="shrink-0 mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {entry.timestamp.slice(11, 23)}
                </span>

                {/* Message */}
                <span className="flex-1 break-all leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                  {primaryText.length > 300 && !isOpen
                    ? primaryText.slice(0, 300) + '…'
                    : primaryText}
                </span>

                {/* Expand chevron */}
                {hasDetail && (
                  <span
                    className={`shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--text-faint)' }}
                  >
                    ▾
                  </span>
                )}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-3 space-y-2">
                  {entry.args.length > 1 && (
                    <div className="rounded-lg p-3 overflow-x-auto" style={{ background: 'var(--overlay-subtle)' }}>
                      <p className="text-[10px] font-sans uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>Arguments</p>
                      {entry.args.map((arg, i) => (
                        <pre key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          <span style={{ color: 'var(--text-faint)' }}>[{i}]</span> {serialize(arg)}
                        </pre>
                      ))}
                    </div>
                  )}
                  {entry.stack && (
                    <div className="rounded-lg p-3 overflow-x-auto" style={{ background: 'color-mix(in srgb, var(--sev-critical) 5%, transparent)' }}>
                      <p className="text-[10px] font-sans uppercase tracking-wider mb-1.5" style={{ color: 'color-mix(in srgb, var(--sev-critical) 60%, transparent)' }}>Stack</p>
                      <pre className="text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: 'color-mix(in srgb, var(--sev-critical) 70%, transparent)' }}>{entry.stack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div ref={bottomRef} />
    </div>
  )
}
