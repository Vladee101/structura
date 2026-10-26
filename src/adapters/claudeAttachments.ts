import type { Attachment, AttachmentData, ChartAttachment, FileAttachment, Page } from '../types'

// Claude's export keeps tool calls as `tool_use` blocks. A few of them produce something worth
// showing in a book: files Claude wrote, widgets it drew, and charts. Everything else (searches,
// shell commands, memory lookups…) is dropped.

export interface ClaudeBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

/** Marks where an attachment sits in answers imported by this version. Hidden when rendered. */
export const ATTACHMENT_MARKER_RE = /^\[\[structura:attachment:(\d+)\]\]$/
export const attachmentMarker = (id: number) => `[[structura:attachment:${id}]]`

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

// ── Files ─────────────────────────────────────────────────────────────────────

interface FileOp {
  path: string
  /** Full content for a create/overwrite, or null for an edit. */
  content: string | null
  edit?: { oldStr: string; newStr: string; all: boolean }
}

function fileOp(block: ClaudeBlock): FileOp | null {
  const input = block.input ?? {}
  switch (block.name) {
    case 'create_file': {
      const path = str(input.path)
      const content = str(input.file_text) ?? str(input.content)
      return path && content !== null ? { path, content } : null
    }
    case 'Write': {
      const path = str(input.file_path)
      const content = str(input.content)
      return path && content !== null ? { path, content } : null
    }
    case 'str_replace': {
      const path = str(input.path)
      const oldStr = str(input.old_str)
      const newStr = str(input.new_str) ?? ''
      return path && oldStr ? { path, content: null, edit: { oldStr, newStr, all: false } } : null
    }
    case 'Edit': {
      const path = str(input.file_path)
      const oldStr = str(input.old_string)
      const newStr = str(input.new_string) ?? ''
      return path && oldStr ? { path, content: null, edit: { oldStr, newStr, all: input.replace_all === true } } : null
    }
    default:
      return null
  }
}

function applyEdit(content: string, edit: NonNullable<FileOp['edit']>): string {
  if (edit.all) return content.split(edit.oldStr).join(edit.newStr)
  const i = content.indexOf(edit.oldStr)
  return i === -1 ? content : content.slice(0, i) + edit.newStr + content.slice(i + edit.oldStr.length)
}

// ── Widgets and charts ────────────────────────────────────────────────────────

function widget(block: ClaudeBlock): AttachmentData | null {
  if (block.name !== 'visualize:show_widget') return null
  const code = str(block.input?.widget_code)
  if (!code?.trim()) return null
  return { kind: 'widget', title: str(block.input?.title) ?? 'Widget', code }
}

function chart(block: ClaudeBlock): ChartAttachment | null {
  if (block.name !== 'chart_display_v0') return null
  const input = block.input ?? {}
  const xAxis = input.x_axis as Record<string, unknown> | undefined
  const yAxis = input.y_axis as Record<string, unknown> | undefined
  if (!Array.isArray(input.series) || !Array.isArray(xAxis?.data)) return null
  const series = input.series
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => ({
      name: str(s.name) ?? '',
      values: Array.isArray(s.values) ? s.values.map(v => (typeof v === 'number' ? v : Number(v) || 0)) : [],
    }))
    .filter(s => s.values.length > 0)
  if (series.length === 0) return null
  return {
    kind: 'chart',
    title: str(input.title) ?? 'Chart',
    style: str(input.style) ?? 'bar',
    categories: (xAxis.data as unknown[]).map(String),
    series,
    yTitle: str(yAxis?.title) ?? undefined,
    yMax: typeof yAxis?.max === 'number' ? yAxis.max : undefined,
  }
}

// ── Per-message slots ─────────────────────────────────────────────────────────

/**
 * For each `tool_use` block of one message, in order: what to show at its position, or null.
 * A file appears once per message, where it was first written, in its state at the end of the
 * message. `files` carries file contents across the conversation, so call this for every message
 * in order.
 */
export function toolSlots(blocks: ClaudeBlock[], files: Map<string, string>): (AttachmentData | null)[] {
  const slots: (AttachmentData | null)[] = []
  const shown = new Map<string, FileAttachment>()

  for (const block of blocks) {
    if (block.type !== 'tool_use') continue
    const op = fileOp(block)
    if (op) {
      const existed = files.has(op.path)
      if (op.content !== null) files.set(op.path, op.content)
      else if (existed && op.edit) files.set(op.path, applyEdit(files.get(op.path)!, op.edit))
      else { slots.push(null); continue } // edit to a file we never saw (e.g. the user's own)

      if (shown.has(op.path)) { slots.push(null); continue }
      const file: FileAttachment = { kind: 'file', path: op.path, content: '', updated: existed }
      shown.set(op.path, file)
      slots.push(file)
      continue
    }
    slots.push(widget(block) ?? chart(block))
  }

  for (const [path, file] of shown) file.content = files.get(path) ?? ''
  return slots
}

// ── Resolving markers in assembled pages ──────────────────────────────────────

/** Replaces marker ids found on answer lines with the attachments they stand for. */
export function resolveAttachments(page: Page, byId: Map<number, AttachmentData>, markerRe: RegExp): Page {
  const attachments: Attachment[] = []
  page.answer.split('\n').forEach((line, i) => {
    const m = markerRe.exec(line.trim())
    const data = m ? byId.get(Number(m[1])) : undefined
    if (data) attachments.push({ ...data, line: i })
  })
  return attachments.length > 0 ? { ...page, attachments } : page
}

/**
 * Copies attachments from freshly parsed legacy pages onto a stored book's pages, matching pages
 * by identical answer text so renamed or deleted chapters don't throw it off. Returns null when
 * nothing could be attached.
 */
export function attachToStoredPages(stored: Page[], legacy: Page[]): Page[] | null {
  const pool = legacy.filter(p => p.attachments?.length)
  let attached = 0
  const pages = stored.map(page => {
    const i = pool.findIndex(p => p.answer === page.answer)
    if (i === -1) return page
    const [match] = pool.splice(i, 1)
    attached++
    return { ...page, attachments: match.attachments }
  })
  return attached > 0 ? pages : null
}
