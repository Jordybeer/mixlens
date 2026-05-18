'use client'

import { useEffect, useRef, useState } from 'react'

type LogLevel = 'log' | 'info' | 'warn' | 'error'

interface LogEntry {
  id: number
  level: LogLevel
  timestamp: string
  args: unknown[]
  stack?: string
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  log:   'text-white/60 border-white/10',
  info:  'text-[#4f98a3] border-[#4f98a3]/20',
  warn:  'text-[#e8af34] border-[#e8af34]/20',
  error: 'text-[#dd6974] border-[#dd6974]/20',
}

const LEVEL_BADGE: Record<LogLevel, string> = {
  log:   'bg-white/10 text-white/50',
  info:  'bg-[#4f98a3]/15 text-[#4f98a3]',
  warn:  'bg-[#e8af34]/15 text-[#e8af34]',
  error: 'bg-[#dd6974]/15 text-[#dd6974]',
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
    // @ts-expect-error overriding console methods
    console[level] = (...args: unknown[]) => {
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
      // @ts-expect-error restoring
      console[level] = originals[level]
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
    <div className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1] font-mono text-xs">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0e0e0f]/95 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-sans font-semibold text-white/80 mr-2">MixLens Logs</span>

        {/* Level filters */}
        {(['ALL', 'log', 'info', 'warn', 'error'] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-sans transition-colors ${
              filter === lvl
                ? lvl === 'ALL'
                  ? 'bg-white/15 text-white'
                  : LEVEL_BADGE[lvl as LogLevel]
                : 'text-white/30 hover:text-white/60'
            }`}
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
          className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-md px-3 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20 font-sans"
        />

        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-sans transition-colors ${
            autoScroll ? 'bg-[#4f98a3]/20 text-[#4f98a3]' : 'text-white/30 hover:text-white/60'
          }`}
        >
          Auto-scroll
        </button>

        <button
          onClick={() => setLogs([])}
          className="px-2.5 py-1 rounded-md text-[11px] font-sans text-white/30 hover:text-[#dd6974] transition-colors"
        >
          Clear
        </button>

        <span className="text-white/20 font-sans text-[11px] ml-auto">{filtered.length} / {logs.length}</span>
      </div>

      {/* Log list */}
      <div className="divide-y divide-white/[0.04]">
        {filtered.length === 0 && (
          <div className="px-6 py-16 text-center text-white/20 font-sans text-sm">
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
              className={`border-l-2 ${LEVEL_STYLES[entry.level]} ${
                hasDetail ? 'cursor-pointer' : ''
              }`}
              onClick={() => hasDetail && toggleExpand(entry.id)}
            >
              <div className="flex items-start gap-3 px-4 py-2">
                {/* Level badge */}
                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-medium ${LEVEL_BADGE[entry.level]}`}>
                  {entry.level}
                </span>

                {/* Timestamp */}
                <span className="shrink-0 text-white/20 mt-0.5">
                  {entry.timestamp.slice(11, 23)}
                </span>

                {/* Message */}
                <span className="flex-1 break-all leading-relaxed text-white/70 whitespace-pre-wrap">
                  {primaryText.length > 300 && !isOpen
                    ? primaryText.slice(0, 300) + '…'
                    : primaryText}
                </span>

                {/* Expand chevron */}
                {hasDetail && (
                  <span className={`shrink-0 text-white/20 mt-0.5 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}>
                    ▾
                  </span>
                )}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-3 space-y-2">
                  {entry.args.length > 1 && (
                    <div className="bg-white/[0.03] rounded-lg p-3 overflow-x-auto">
                      <p className="text-white/30 text-[10px] font-sans uppercase tracking-wider mb-1.5">Arguments</p>
                      {entry.args.map((arg, i) => (
                        <pre key={i} className="text-white/60 text-[11px] leading-relaxed">
                          <span className="text-white/20">[{i}]</span> {serialize(arg)}
                        </pre>
                      ))}
                    </div>
                  )}
                  {entry.stack && (
                    <div className="bg-[#dd6974]/5 rounded-lg p-3 overflow-x-auto">
                      <p className="text-[#dd6974]/60 text-[10px] font-sans uppercase tracking-wider mb-1.5">Stack</p>
                      <pre className="text-[#dd6974]/70 text-[10px] leading-relaxed whitespace-pre-wrap">{entry.stack}</pre>
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
