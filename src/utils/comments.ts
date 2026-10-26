import type { Comment } from '../types'
import { UNSUPPORTED_BLOCK_PLACEHOLDER } from '../adapters/claudeExport'
import { ATTACHMENT_MARKER_RE } from '../adapters/claudeAttachments'

// ── Line → block mapping ──────────────────────────────────────────────────────

export type BlockTag = 'h2' | 'h3' | 'li' | 'p'

export interface Block {
  tag: BlockTag
  /** Text shown in the block, before inline formatting is applied. */
  content: string
  /** Whether **bold** and `code` markers are interpreted. */
  inline: boolean
}

/** Lines never shown as text: code fences, the placeholder older Claude imports stored for tool
 *  blocks, and attachment markers (attachments render in their place). */
export function isHiddenLine(line: string): boolean {
  const t = line.trim()
  return line.startsWith('```') || t === UNSUPPORTED_BLOCK_PLACEHOLDER || ATTACHMENT_MARKER_RE.test(t)
}

/** How one source line of an answer is displayed; null for lines that render as nothing or a gap. */
export function blockForLine(line: string): Block | null {
  if (isHiddenLine(line)) return null
  if (line.startsWith('### ')) return { tag: 'h3', content: line.slice(4), inline: false }
  if (line.startsWith('## ')) return { tag: 'h2', content: line.slice(3), inline: false }
  if (line.startsWith('# ')) return { tag: 'h2', content: line.slice(2), inline: false }
  if (line.startsWith('- ') || line.startsWith('* ')) return { tag: 'li', content: line.slice(2), inline: true }
  if (/^\d+\. /.test(line)) return { tag: 'li', content: line.replace(/^\d+\. /, ''), inline: true }
  if (line.trim() === '') return null
  return { tag: 'p', content: line, inline: true }
}

// ── Inline tokens ─────────────────────────────────────────────────────────────

export type InlineKind = 'text' | 'strong' | 'code'

export interface InlineToken {
  kind: InlineKind
  text: string
}

export function tokenizeBlock(block: Block): InlineToken[] {
  if (!block.inline) return [{ kind: 'text', text: block.content }]
  return block.content
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(part => part !== '')
    .map((part): InlineToken => {
      if (part.startsWith('**') && part.endsWith('**')) return { kind: 'strong', text: part.slice(2, -2) }
      if (part.startsWith('`') && part.endsWith('`')) return { kind: 'code', text: part.slice(1, -1) }
      return { kind: 'text', text: part }
    })
}

/** Length of the text a block displays — the coordinate space comment offsets use. */
export function blockTextLength(block: Block): number {
  return tokenizeBlock(block).reduce((n, t) => n + t.text.length, 0)
}

// ── Highlights ────────────────────────────────────────────────────────────────

export interface Highlight {
  id: string
  start: number
  end: number
}

export interface Segment extends InlineToken {
  highlightId: string | null
}

/** The part of a comment's passage that falls on one line, or null if none does. */
export function highlightForLine(
  c: Pick<Comment, 'id' | 'startLine' | 'startOffset' | 'endLine' | 'endOffset'>,
  lineIndex: number,
  lineLength: number,
): Highlight | null {
  if (lineIndex < c.startLine || lineIndex > c.endLine) return null
  const start = lineIndex === c.startLine ? c.startOffset : 0
  const end = lineIndex === c.endLine ? Math.min(c.endOffset, lineLength) : lineLength
  return end > start ? { id: c.id, start, end } : null
}

/** Splits tokens at highlight boundaries. Where highlights overlap, the earlier one in the list wins. */
export function segmentTokens(tokens: InlineToken[], highlights: Highlight[]): Segment[] {
  const segments: Segment[] = []
  let pos = 0
  for (const token of tokens) {
    const tokenStart = pos
    const tokenEnd = pos + token.text.length
    const cuts = new Set([tokenStart, tokenEnd])
    for (const h of highlights) {
      if (h.start > tokenStart && h.start < tokenEnd) cuts.add(h.start)
      if (h.end > tokenStart && h.end < tokenEnd) cuts.add(h.end)
    }
    const sorted = [...cuts].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      const hit = highlights.find(h => h.start <= a && h.end >= b)
      segments.push({
        kind: token.kind,
        text: token.text.slice(a - tokenStart, b - tokenStart),
        highlightId: hit?.id ?? null,
      })
    }
    pos = tokenEnd
  }
  return segments
}

// ── Page deletion ─────────────────────────────────────────────────────────────

/** Drops comments on a deleted page and shifts later pages down by one. */
export function renumberAfterPageDelete<T extends { pageIndex: number }>(items: T[], deletedIndex: number): T[] {
  return items
    .filter(c => c.pageIndex !== deletedIndex)
    .map(c => c.pageIndex > deletedIndex ? { ...c, pageIndex: c.pageIndex - 1 } : c)
}
