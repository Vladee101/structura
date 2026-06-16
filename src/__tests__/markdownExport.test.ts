import { describe, it, expect, vi } from 'vitest'
import { renderMarkdown, safeFilename } from '../utils/markdownExport'
import type { ExportInput } from '../utils/markdownExport'

// ── renderMarkdown – scope 1: whole-book ─────────────────────────────────────

describe('renderMarkdown – whole-book scope', () => {
  const input: ExportInput = {
    books: [{
      title: 'TypeScript Deep Dive',
      source: 'claude',
      pages: [
        { question: 'What is a type guard?', answer: 'A type guard narrows a union.' },
        { question: 'What is a mapped type?', answer: 'A mapped type transforms keys.' },
      ],
      stickers: [],
    }],
  }

  it('produces a top-level # title and _Source_ line', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('# TypeScript Deep Dive')
    expect(md).toContain('_Source: Claude_')
  })

  it('renders each page as ## heading followed by answer', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('## What is a type guard?\n\nA type guard narrows a union.')
    expect(md).toContain('## What is a mapped type?\n\nA mapped type transforms keys.')
  })

  it('preserves answer markdown verbatim (no double-escaping)', () => {
    const mdInput: ExportInput = {
      books: [{
        title: 'T',
        source: 'paste',
        pages: [{ question: 'Q', answer: '**bold** and `code`\n\n- item 1\n- item 2' }],
        stickers: [],
      }],
    }
    const md = renderMarkdown(mdInput)
    expect(md).toContain('**bold** and `code`')
    expect(md).toContain('- item 1')
    expect(md).toContain('- item 2')
  })

  it('labels ChatGPT and DeepSeek sources correctly', () => {
    const a = renderMarkdown({ books: [{ title: 'T', source: 'chatgpt', pages: [], stickers: [] }] })
    expect(a).toContain('_Source: ChatGPT_')
    const b = renderMarkdown({ books: [{ title: 'T', source: 'deepseek', pages: [], stickers: [] }] })
    expect(b).toContain('_Source: DeepSeek_')
  })

  it('returns empty string for empty books array', () => {
    expect(renderMarkdown({ books: [] })).toBe('')
  })

  it('full original title appears as the # heading even when long', () => {
    const longTitle = 'A'.repeat(200) + ' Summary'
    const md = renderMarkdown({
      books: [{ title: longTitle, source: 'claude', pages: [], stickers: [] }],
    })
    expect(md).toContain(`# ${longTitle}`)
    // But the filename is truncated
    const fn = safeFilename(longTitle)
    expect(fn.length).toBeLessThan(80)
    expect(fn).not.toContain(longTitle)
  })
})

// ── renderMarkdown – scope 2: single-book highlights ─────────────────────────

describe('renderMarkdown – single-book stickers scope', () => {
  const input: ExportInput = {
    books: [{
      title: 'AI Fundamentals',
      source: 'chatgpt',
      pages: [
        { question: 'What is ML?', answer: 'ML is machine learning.' },
        { question: 'What is DL?', answer: 'DL is deep learning.' },
      ],
      stickers: [
        { pageIndex: 0, text: 'Key insight about ML' },
        { pageIndex: 1, text: 'Core idea of DL' },
      ],
    }],
  }

  it('produces "# <title> — Highlights" heading', () => {
    expect(renderMarkdown(input)).toContain('# AI Fundamentals — Highlights')
  })

  it('includes provenance from the correct page question', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('From: What is ML?')
    expect(md).toContain('From: What is DL?')
  })

  it('renders sticker text as blockquote', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('> Key insight about ML')
    expect(md).toContain('> Core idea of DL')
  })

  it('does not include full answer text', () => {
    const md = renderMarkdown(input)
    expect(md).not.toContain('ML is machine learning.')
    expect(md).not.toContain('DL is deep learning.')
  })

  it('sticker provenance reflects the prompt of its page, not a different page', () => {
    const provenanceInput: ExportInput = {
      books: [{
        title: 'Book',
        source: 'claude',
        pages: [
          { question: 'Page 0 prompt', answer: 'Answer 0' },
          { question: 'Page 1 prompt', answer: 'Answer 1' },
          { question: 'Page 2 prompt', answer: 'Answer 2' },
        ],
        stickers: [{ pageIndex: 2, text: 'Snippet from page 2' }],
      }],
    }
    const md = renderMarkdown(provenanceInput)
    expect(md).toContain('From: Page 2 prompt')
    expect(md).not.toContain('From: Page 0 prompt')
    expect(md).not.toContain('From: Page 1 prompt')
  })
})

// ── renderMarkdown – scope 3: cross-book highlights ──────────────────────────

describe('renderMarkdown – cross-book stickers scope', () => {
  const input: ExportInput = {
    books: [
      {
        title: 'Book A',
        source: 'chatgpt',
        pages: [{ question: 'Q in A', answer: 'Ans A' }],
        stickers: [{ pageIndex: 0, text: 'Sticker from A' }],
      },
      {
        title: 'Book B',
        source: 'claude',
        pages: [{ question: 'Q in B', answer: 'Ans B' }],
        stickers: [], // no stickers — must be omitted
      },
      {
        title: 'Book C',
        source: 'deepseek',
        pages: [{ question: 'Q in C', answer: 'Ans C' }],
        stickers: [{ pageIndex: 0, text: 'Sticker from C' }],
      },
    ],
  }

  it('produces top-level # Highlights heading', () => {
    expect(renderMarkdown(input)).toContain('# Highlights')
  })

  it('groups stickers by book under ## headings', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('## Book A')
    expect(md).toContain('## Book C')
  })

  it('omits books that have no stickers', () => {
    expect(renderMarkdown(input)).not.toContain('## Book B')
  })

  it('includes sticker text and provenance under each book', () => {
    const md = renderMarkdown(input)
    expect(md).toContain('From: Q in A')
    expect(md).toContain('> Sticker from A')
    expect(md).toContain('From: Q in C')
    expect(md).toContain('> Sticker from C')
  })

  it('book sections appear in input order', () => {
    const md = renderMarkdown(input)
    const posA = md.indexOf('## Book A')
    const posC = md.indexOf('## Book C')
    expect(posA).toBeGreaterThan(-1)
    expect(posC).toBeGreaterThan(posA)
  })
})

// ── safeFilename ──────────────────────────────────────────────────────────────

describe('safeFilename', () => {
  it('strips all characters illegal on Windows and POSIX', () => {
    const name = safeFilename('hello?world:test*foo"bar<baz>qux|end')
    expect(name).not.toMatch(/[?:*"<>|\\\/]/)
    expect(name).toMatch(/\.md$/)
  })

  it('handles each illegal character individually', () => {
    for (const ch of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
      const name = safeFilename(`before${ch}after`)
      expect(name).not.toContain(ch)
      expect(name).toMatch(/\.md$/)
      // Words must not run together: "beforeafter" should not appear
      expect(name).not.toContain('beforeafter')
    }
  })

  it('truncates a 200-char title so the base is ≤60 chars and file ends .md', () => {
    const longTitle = 'A'.repeat(200)
    const name = safeFilename(longTitle)
    expect(name).toMatch(/\.md$/)
    const base = name.slice(0, name.length - 3) // remove .md
    expect(base.length).toBeLessThanOrEqual(60)
  })

  it('truncates on a word boundary when possible', () => {
    // Title is 66 chars; at char 60 we are mid-word "Lambda"
    // Expected cut: at the space before "Lambda" → base ends with "Kappa"
    const title = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu'
    const name = safeFilename(title)
    const base = name.replace(/\.md$/, '')
    expect(base.length).toBeLessThanOrEqual(60)
    expect(base.endsWith('Kappa')).toBe(true)
  })

  it('falls back to "structura-export" when title is all illegal symbols', () => {
    expect(safeFilename('???///***:::|||\\"')).toBe('structura-export.md')
  })

  it('falls back when title is an empty string', () => {
    expect(safeFilename('')).toBe('structura-export.md')
  })

  it('prefixes CON to avoid Windows reserved name', () => {
    const name = safeFilename('CON')
    expect(name).not.toMatch(/^CON\.md$/i)
    expect(name).toBe('_CON.md')
  })

  it('prefixes NUL, PRN, AUX reserved names', () => {
    expect(safeFilename('NUL')).toBe('_NUL.md')
    expect(safeFilename('PRN')).toBe('_PRN.md')
    expect(safeFilename('AUX')).toBe('_AUX.md')
  })

  it('prefixes COM1 and LPT9 reserved names', () => {
    expect(safeFilename('COM1')).toBe('_COM1.md')
    expect(safeFilename('LPT9')).toBe('_LPT9.md')
  })

  it('appends suffix AFTER truncation — suffix never gets cut', () => {
    const longTitle = 'Word '.repeat(40).trim() // ~199 chars
    const name = safeFilename(longTitle, ' - highlights')
    expect(name).toContain(' - highlights.md')
    // Base (before suffix) must be ≤60 chars
    const suffixAndExt = ' - highlights.md'
    const base = name.slice(0, name.length - suffixAndExt.length)
    expect(base.length).toBeLessThanOrEqual(60)
  })

  it('appends .md when no suffix provided', () => {
    expect(safeFilename('Normal Title')).toBe('Normal Title.md')
  })

  it('appends suffix + .md when suffix provided', () => {
    expect(safeFilename('My Book', ' - highlights')).toBe('My Book - highlights.md')
  })

  it('trims leading dots and hyphens', () => {
    expect(safeFilename('...My Title')).toBe('My Title.md')
    expect(safeFilename('---My Title')).toBe('My Title.md')
  })

  it('trims trailing dots, hyphens, and spaces (Windows restriction)', () => {
    expect(safeFilename('My Title...')).toBe('My Title.md')
    expect(safeFilename('My Title---')).toBe('My Title.md')
  })

  it('collapses repeated hyphens from original input', () => {
    const name = safeFilename('Hello--World')
    expect(name).not.toContain('--')
    expect(name).toBe('Hello-World.md')
  })
})

// ── No network requests ───────────────────────────────────────────────────────

describe('export does not issue network requests', () => {
  it('renderMarkdown is synchronous and never calls fetch', () => {
    const fetchSpy = vi.fn()
    const g = globalThis as Record<string, unknown>
    const prev = g['fetch']
    g['fetch'] = fetchSpy

    renderMarkdown({
      books: [{
        title: 'Test Book',
        source: 'claude',
        pages: [{ question: 'Q', answer: 'A' }],
        stickers: [{ pageIndex: 0, text: 'highlight' }],
      }],
    })

    g['fetch'] = prev
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
