import type { Attachment, Book } from '../types'
import { stripUnsupportedBlocks } from '../adapters/claudeExport'
import { ATTACHMENT_MARKER_RE } from '../adapters/claudeAttachments'

// ── Attachments ───────────────────────────────────────────────────────────────

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function attachmentMarkdown(a: Attachment): string {
  switch (a.kind) {
    case 'file': {
      const name = fileName(a.path)
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
      const longestRun = Math.max(2, ...(a.content.match(/`+/g) ?? []).map(r => r.length))
      const fence = '`'.repeat(longestRun + 1)
      return `**${a.updated ? 'Updated file' : 'File'}: \`${name}\`**\n\n${fence}${ext}\n${a.content.replace(/\n$/, '')}\n${fence}`
    }
    case 'widget':
      return `*[Interactive widget: ${a.title.replace(/[_-]+/g, ' ')} — open this book in Structura to view it]*`
    case 'chart': {
      const cell = (s: string) => s.replace(/\|/g, '\\|')
      const rows = a.categories.map((c, i) => `| ${cell(c)} | ${a.series.map(s => s.values[i] ?? '').join(' | ')} |`)
      return [
        `**Chart: ${a.title}**`,
        '',
        `| | ${a.series.map(s => cell(s.name)).join(' | ')} |`,
        `|---|${a.series.map(() => '---').join('|')}|`,
        ...rows,
      ].join('\n')
    }
  }
}

const token = (i: number) => `\u0000structura-att:${i}\u0000`
// Older imports wrap each placeholder in its own fence lines directly around it; drop those too.
const TOKEN_RE = /(?:```\n)?\u0000structura-att:(\d+)\u0000(?:\n```)?/g

/** An answer as Markdown: placeholders and markers removed, attachments written in their place. */
export function answerMarkdown(page: ExportPage): string {
  const attachments = page.attachments ?? []
  const byLine = new Map<number, number[]>()
  attachments.forEach((a, i) => byLine.set(a.line, [...(byLine.get(a.line) ?? []), i]))
  const lines = page.answer.split('\n').map((line, i) => {
    const ids = byLine.get(i)
    if (ids) return ids.map(token).join('\n\n')
    return ATTACHMENT_MARKER_RE.test(line.trim()) ? '' : line
  })
  // Strip first so collapsing blank lines never touches file contents inserted afterwards.
  return stripUnsupportedBlocks(lines.join('\n'))
    .replace(TOKEN_RE, (_, i: string) => attachmentMarkdown(attachments[Number(i)]))
}

// ── Normalized export input ───────────────────────────────────────────────────

export interface ExportPage {
  question: string
  answer: string
  attachments?: Attachment[]
}

export interface ExportSticker {
  pageIndex: number
  text: string
}

export interface ExportComment {
  pageIndex: number
  startLine: number
  startOffset: number
  quote: string
  text: string
}

export interface ExportBook {
  title: string
  source: string
  pages: ExportPage[]
  stickers: ExportSticker[]
  comments?: ExportComment[]
}

export interface ExportInput {
  books: ExportBook[]
}

// ── safeFilename ──────────────────────────────────────────────────────────────

const UNSAFE_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
const MAX_BASE_LEN = 60

/**
 * Returns a filesystem-safe filename: sanitizes rawName, appends optional
 * suffix, then ".md". Base is capped at 60 chars (word-boundary truncation).
 */
export function safeFilename(rawName: string, suffix?: string): string {
  let base = rawName
    .replace(UNSAFE_CHARS, ' ')   // replace each illegal char with space
    .replace(/[ \t]+/g, ' ')      // collapse whitespace runs
    .replace(/-{2,}/g, '-')       // collapse repeated hyphens
    .trim()
    .replace(/^[.\- ]+|[.\- ]+$/g, '') // strip leading/trailing dots, hyphens, spaces
    .trim()

  if (WINDOWS_RESERVED.test(base)) base = '_' + base

  if (base.length > MAX_BASE_LEN) {
    const cut = base.slice(0, MAX_BASE_LEN)
    const lastSpace = cut.lastIndexOf(' ')
    const lastHyphen = cut.lastIndexOf('-')
    const boundary = Math.max(lastSpace, lastHyphen)
    // Use word boundary only if it falls past 1/3 of the cut (avoids very short results)
    base = boundary > Math.floor(MAX_BASE_LEN / 3)
      ? cut.slice(0, boundary)
      : cut
    base = base.replace(/[.\- ]+$/, '')
  }

  if (!base) base = 'structura-export'

  return base + (suffix ?? '') + '.md'
}

// ── Source display labels ─────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  paste: 'Paste',
  deepseek: 'DeepSeek',
}

// ── Shared renderer ───────────────────────────────────────────────────────────

/**
 * Single renderer for all three export scopes. Scope is inferred from input:
 *   - No stickers in any book          → scope 1 (whole-book pages)
 *   - Stickers, exactly one book total → scope 2 (single-book highlights)
 *   - Stickers, more than one book     → scope 3 (cross-book highlights)
 */
export function renderMarkdown(input: ExportInput): string {
  const { books } = input
  if (books.length === 0) return ''

  const booksWithStickers = books.filter(b => b.stickers.length > 0)

  if (booksWithStickers.length === 0) {
    // ── Scope 1: whole-book ───────────────────────────────────────────────────
    const book = books[0]
    const lines: string[] = []
    lines.push(`# ${book.title}`)
    lines.push(`_Source: ${SOURCE_LABELS[book.source] ?? book.source}_`)
    lines.push('')
    book.pages.forEach((page, pageIndex) => {
      lines.push(`## ${page.question}`)
      lines.push('')
      lines.push(answerMarkdown(page))
      lines.push('')
      const pageComments = (book.comments ?? [])
        .filter(c => c.pageIndex === pageIndex)
        .sort((a, b) => a.startLine - b.startLine || a.startOffset - b.startOffset)
      if (pageComments.length > 0) {
        lines.push('### Comments')
        lines.push('')
        for (const c of pageComments) {
          lines.push(`> ${c.quote}`)
          lines.push('')
          lines.push(`**Comment:** ${c.text}`)
          lines.push('')
        }
      }
    })
    return lines.join('\n').trimEnd() + '\n'
  }

  if (books.length === 1) {
    // ── Scope 2: single-book highlights ──────────────────────────────────────
    const book = booksWithStickers[0]
    const lines: string[] = []
    lines.push(`# ${book.title} — Highlights`)
    lines.push('')
    for (const sticker of book.stickers) {
      const page = book.pages[sticker.pageIndex]
      if (!page) continue
      lines.push(`From: ${page.question}`)
      lines.push('')
      lines.push(`> ${sticker.text}`)
      lines.push('')
    }
    return lines.join('\n').trimEnd() + '\n'
  }

  // ── Scope 3: cross-book highlights ───────────────────────────────────────
  const lines: string[] = []
  lines.push('# Highlights')
  lines.push('')
  for (const book of booksWithStickers) {
    lines.push(`## ${book.title}`)
    lines.push('')
    for (const sticker of book.stickers) {
      const page = book.pages[sticker.pageIndex]
      if (!page) continue
      lines.push(`From: ${page.question}`)
      lines.push('')
      lines.push(`> ${sticker.text}`)
      lines.push('')
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

// ── Download trigger ──────────────────────────────────────────────────────────

/** Serializes content to a Blob and triggers a browser download. No network. */
export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── High-level export helpers ─────────────────────────────────────────────────

/** Scope 1: export a book's full Q&A content. */
export function exportBook(book: Book): void {
  const input: ExportInput = {
    books: [{ title: book.title, source: book.source, pages: book.pages, stickers: [], comments: book.comments }],
  }
  triggerDownload(renderMarkdown(input), safeFilename(book.title))
}

/** Scope 2: export only stickered passages from one book. */
export function exportBookStickers(book: Book): void {
  const input: ExportInput = {
    books: [{
      title: book.title,
      source: book.source,
      pages: book.pages,
      stickers: book.stickers.map(s => ({ pageIndex: s.pageIndex, text: s.text })),
    }],
  }
  triggerDownload(renderMarkdown(input), safeFilename(book.title, ' - highlights'))
}

/** Scope 3: export stickered passages across multiple books. */
export function exportAllStickers(books: Book[], shelfName?: string): void {
  const input: ExportInput = {
    books: books.map(b => ({
      title: b.title,
      source: b.source,
      pages: b.pages,
      stickers: b.stickers.map(s => ({ pageIndex: s.pageIndex, text: s.text })),
    })),
  }
  triggerDownload(renderMarkdown(input), safeFilename(shelfName ?? 'Structura', ' - highlights'))
}
