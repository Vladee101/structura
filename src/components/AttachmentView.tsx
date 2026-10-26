import { useState } from 'react'
import type { Attachment, ChartAttachment, FileAttachment, WidgetAttachment } from '../types'
import SandboxFrame from './SandboxFrame'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const LANGUAGES: Record<string, string> = {
  md: 'Markdown', json: 'JSON', py: 'Python', html: 'HTML', htm: 'HTML', tsx: 'TSX', ts: 'TypeScript',
  jsx: 'JSX', js: 'JavaScript', rs: 'Rust', yaml: 'YAML', yml: 'YAML', sql: 'SQL', svg: 'SVG',
  txt: 'Text', css: 'CSS', sh: 'Shell', mermaid: 'Mermaid', csv: 'CSV', toml: 'TOML', go: 'Go',
}

export function fileExtension(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function prettyTitle(title: string): string {
  const spaced = title.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatSize(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(chars < 10240 ? 1 : 0)} KB`
}

function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ── File ──────────────────────────────────────────────────────────────────────

function FileCard({ file }: { file: FileAttachment }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const name = fileName(file.path)
  const ext = fileExtension(file.path)
  const previewable = ext === 'html' || ext === 'htm' || ext === 'svg'
  const lineCount = file.content.split('\n').length

  const copy = () => {
    void navigator.clipboard.writeText(file.content).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={`attachment attachment-file${open ? ' attachment--open' : ''}`}>
      <div className="attachment-header">
        <button
          type="button"
          className="attachment-toggle"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          title={file.path}
        >
          <span className="attachment-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="attachment-icon" aria-hidden="true">{ext ? ext.slice(0, 4).toUpperCase() : 'FILE'}</span>
          <span className="attachment-name">{name}</span>
          {file.updated && <span className="attachment-badge">Updated</span>}
          <span className="attachment-meta">
            {LANGUAGES[ext] ?? 'File'} · {lineCount} line{lineCount !== 1 ? 's' : ''} · {formatSize(file.content.length)}
          </span>
        </button>
        <div className="attachment-actions">
          {previewable && open && (
            <button type="button" onClick={() => setPreview(p => !p)}>{preview ? 'Code' : 'Preview'}</button>
          )}
          <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" onClick={() => download(file.content, name)}>Download</button>
        </div>
      </div>
      {open && (
        preview
          ? <div className="attachment-body"><SandboxFrame code={file.content} title={name} minHeight={200} /></div>
          : <pre className="attachment-code"><code>{file.content}</code></pre>
      )}
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────

function WidgetCard({ widget }: { widget: WidgetAttachment }) {
  const title = prettyTitle(widget.title)
  return (
    <figure className="attachment attachment-visual">
      <SandboxFrame code={widget.code} title={title} />
      <figcaption className="attachment-caption">{title}</figcaption>
    </figure>
  )
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#c9913a', '#4a7aad', '#5f8f6a', '#b05c3e', '#7a5fa0', '#3f8f80']

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map(m => m * pow).find(m => m >= v) ?? v
}

function ChartCard({ chart }: { chart: ChartAttachment }) {
  const W = 640, H = 300, left = 48, right = 16, top = 16, bottom = 40
  const plotW = W - left - right
  const plotH = H - top - bottom
  const dataMax = Math.max(...chart.series.flatMap(s => s.values), 0)
  const max = niceMax(Math.max(chart.yMax ?? 0, dataMax))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const y = (v: number) => top + plotH - (Math.max(v, 0) / max) * plotH
  const n = chart.categories.length
  const band = plotW / Math.max(n, 1)
  const isLine = chart.style === 'line'
  const barW = (band * 0.7) / chart.series.length
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

  return (
    <figure className="attachment attachment-visual">
      <div className="attachment-chart-title">{chart.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="attachment-chart" role="img" aria-label={chart.title}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={left - 8} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
          </g>
        ))}
        {chart.categories.map((c, i) => (
          <text key={c + i} x={left + band * (i + 0.5)} y={H - bottom + 18} className="chart-tick" textAnchor="middle">{c}</text>
        ))}
        {chart.series.map((s, si) => {
          const color = CHART_COLORS[si % CHART_COLORS.length]
          if (isLine) {
            const pts = s.values.map((v, i) => `${left + band * (i + 0.5)},${y(v)}`).join(' ')
            return <polyline key={si} points={pts} fill="none" stroke={color} strokeWidth={2.5} />
          }
          return s.values.slice(0, n).map((v, i) => (
            <rect
              key={`${si}-${i}`}
              x={left + band * i + band * 0.15 + barW * si}
              y={y(v)}
              width={Math.max(barW - 2, 1)}
              height={top + plotH - y(v)}
              fill={color}
              rx={2}
            >
              <title>{`${s.name}: ${fmt(v)}`}</title>
            </rect>
          ))
        })}
        {chart.yTitle && (
          <text x={12} y={top + plotH / 2} className="chart-tick" textAnchor="middle" transform={`rotate(-90 12 ${top + plotH / 2})`}>
            {chart.yTitle}
          </text>
        )}
      </svg>
      <div className="attachment-legend">
        {chart.series.map((s, si) => (
          <span key={si}><i style={{ background: CHART_COLORS[si % CHART_COLORS.length] }} />{s.name}</span>
        ))}
      </div>
    </figure>
  )
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export default function AttachmentView({ attachment }: { attachment: Attachment }) {
  switch (attachment.kind) {
    case 'file': return <FileCard file={attachment} />
    case 'widget': return <WidgetCard widget={attachment} />
    case 'chart': return <ChartCard chart={attachment} />
  }
}
