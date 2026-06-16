import { useState, useRef, useCallback } from 'react'
import { db } from '../db'
import type { BookRecord } from '../db'
import { parseZipBuffer } from '../adapters/chatgptExport'
import { parseInput } from '../adapters/registry'
import { AdapterError } from '../adapters/types'
import type { AdapterInput, ParsedConversation } from '../adapters/types'

type Mode = 'file' | 'paste'
type Status = 'idle' | 'processing' | 'done' | 'error'

interface Summary { imported: number; skipped: number }

interface Props {
  onImported: () => void
  onClose: () => void
}

async function extractJson(file: File): Promise<{ json: unknown; manifestVersion: number | null }> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const buf = await file.arrayBuffer()
    const { conversations, manifestVersion } = parseZipBuffer(new Uint8Array(buf))
    return { json: conversations, manifestVersion }
  }
  return { json: JSON.parse(await file.text()), manifestVersion: null }
}

async function bulkInsert(convs: ParsedConversation[], manifestVersion: number | null): Promise<Summary> {
  const now = Date.now()
  let imported = 0
  let skipped = 0
  for (const conv of convs) {
    if (conv.pages.length === 0) { skipped++; continue }
    const existing = await db.books.get(conv.id)
    if (existing) { skipped++; continue }
    const record: BookRecord = {
      id: conv.id, title: conv.title,
      createdAt: conv.createdAt, importedAt: now,
      source: conv.source, pages: conv.pages,
      manifestVersion,
    }
    await db.books.add(record)
    imported++
  }
  return { imported, skipped }
}

export default function ImportPanel({ onImported, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('file')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => { setStatus('idle'); setSummary(null); setError(''); setText('') }

  const runFile = useCallback(async (file: File) => {
    setStatus('processing'); setError('')
    try {
      const { json, manifestVersion } = await extractJson(file)
      const input: AdapterInput = { kind: 'file', name: file.name, json }
      const result = await bulkInsert(parseInput(input), manifestVersion)
      setSummary(result); setStatus('done'); onImported()
    } catch (e) {
      setError(e instanceof AdapterError ? e.message : `Could not parse file: ${(e as Error).message}`)
      setStatus('error')
    }
  }, [onImported])

  const runPaste = useCallback(async () => {
    const trimmed = text.trim()
    if (trimmed.length < 20) { setError('Paste a conversation first.'); return }
    setStatus('processing'); setError('')
    try {
      const result = await bulkInsert(parseInput({ kind: 'text', text: trimmed }), null)
      setSummary(result); setStatus('done'); onImported()
    } catch (e) {
      setError(e instanceof AdapterError ? e.message : 'Could not parse text.')
      setStatus('error')
    }
  }, [text, onImported])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void runFile(file)
  }, [runFile])

  return (
    <div className="import-overlay" onClick={onClose}>
      <div className="import-panel" onClick={e => e.stopPropagation()}>

        <div className="import-panel-header">
          <h2 className="import-panel-title">Import Conversations</h2>
          <button type="button" className="collection-close" onClick={onClose}>×</button>
        </div>

        {status === 'done' && summary ? (
          <div className="import-summary">
            <p className="import-summary-text">
              Imported <strong>{summary.imported}</strong> conversation{summary.imported !== 1 ? 's' : ''}
              {summary.skipped > 0 && `, skipped ${summary.skipped} empty or duplicate`}.
            </p>
            <div className="import-summary-actions">
              <button type="button" className="import-btn" onClick={reset}>Import More</button>
              <button type="button" className="import-btn-secondary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mode-tabs">
              <button type="button" className={`mode-tab ${mode === 'file' ? 'mode-tab--active' : ''}`}
                onClick={() => { setMode('file'); reset() }}>
                File / ZIP
              </button>
              <button type="button" className={`mode-tab ${mode === 'paste' ? 'mode-tab--active' : ''}`}
                onClick={() => { setMode('paste'); reset() }}>
                Paste Text
              </button>
            </div>

            {mode === 'file' ? (
              <>
                <p className="import-instruction">
                  Drop a <strong>conversations.json</strong> or ChatGPT export <strong>.zip</strong>,
                  or click to choose a file.
                </p>
                <div
                  className={`drop-zone${dragging ? ' drop-zone--over' : ''}${status === 'processing' ? ' drop-zone--busy' : ''}`}
                  onClick={() => status !== 'processing' && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  {status === 'processing' ? 'Parsing…' : 'Drop file here or click to browse'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.zip"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) { void runFile(file); e.target.value = '' }
                    }}
                  />
                </div>
                {error && <p className="import-error">{error}</p>}
              </>
            ) : (
              <>
                <p className="import-instruction">
                  Copy your full conversation and paste it here. Include speaker labels
                  like <strong>You</strong> / <strong>ChatGPT</strong>.
                </p>
                <textarea
                  className="import-textarea"
                  placeholder={"You\nWhat is X?\n\nChatGPT\nX is…"}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {error && <p className="import-error">{error}</p>}
                <button
                  type="button"
                  className="import-btn"
                  onClick={() => void runPaste()}
                  disabled={text.trim().length < 20 || status === 'processing'}
                >
                  {status === 'processing' ? 'Parsing…' : 'Open as Book'}
                </button>
              </>
            )}
          </>
        )}

      </div>
    </div>
  )
}
