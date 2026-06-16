import type { Book } from '../types'

// ── Normalized export input ───────────────────────────────────────────────────

export interface ExportPage {
  question: string
  answer: string
}

export interface ExportSticker {
  pageIndex: number
  text: string
}

export interface ExportBook {
  title: string
  source: string
  pages: ExportPage[]
  stickers: ExportSticker[]
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
    for (const page of book.pages) {
      lines.push(`## ${page.question}`)
      lines.push('')
      lines.push(page.answer)
      lines.push('')
    }
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
    books: [{ title: book.title, source: book.source, pages: book.pages, stickers: [] }],
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
