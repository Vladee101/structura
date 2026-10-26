import { describe, it, expect } from 'vitest'
import {
  blockForLine, tokenizeBlock, blockTextLength, highlightForLine, segmentTokens, renumberAfterPageDelete,
} from '../utils/comments'
import { renderMarkdown } from '../utils/markdownExport'

describe('blockForLine', () => {
  it('maps headings, list items and paragraphs', () => {
    expect(blockForLine('## Title')).toEqual({ tag: 'h2', content: 'Title', inline: false })
    expect(blockForLine('- item')?.tag).toBe('li')
    expect(blockForLine('3. step')?.content).toBe('step')
    expect(blockForLine('plain')?.tag).toBe('p')
  })

  it('returns null for blank lines and code fences', () => {
    expect(blockForLine('')).toBeNull()
    expect(blockForLine('```ts')).toBeNull()
  })
})

describe('tokenizeBlock', () => {
  it('measures displayed text without markdown markers', () => {
    const block = blockForLine('a **bold** and `code` end')!
    expect(tokenizeBlock(block).map(t => t.kind)).toEqual(['text', 'strong', 'text', 'code', 'text'])
    expect(blockTextLength(block)).toBe('a bold and code end'.length)
  })
})

describe('highlightForLine', () => {
  const c = { id: 'c1', startLine: 2, startOffset: 4, endLine: 4, endOffset: 3 }
  it('covers start, middle and end lines', () => {
    expect(highlightForLine(c, 2, 10)).toEqual({ id: 'c1', start: 4, end: 10 })
    expect(highlightForLine(c, 3, 8)).toEqual({ id: 'c1', start: 0, end: 8 })
    expect(highlightForLine(c, 4, 10)).toEqual({ id: 'c1', start: 0, end: 3 })
  })
  it('skips lines outside the passage', () => {
    expect(highlightForLine(c, 1, 10)).toBeNull()
    expect(highlightForLine(c, 5, 10)).toBeNull()
  })
})

describe('segmentTokens', () => {
  it('splits across formatting and keeps text intact', () => {
    const tokens = tokenizeBlock(blockForLine('one **two** three')!)
    const segs = segmentTokens(tokens, [{ id: 'h', start: 2, end: 6 }])
    expect(segs.map(s => s.text).join('')).toBe('one two three')
    expect(segs.filter(s => s.highlightId === 'h').map(s => s.text)).toEqual(['e ', 'tw'])
    expect(segs.find(s => s.text === 'tw')?.kind).toBe('strong')
  })

  it('returns tokens unchanged without highlights', () => {
    const tokens = tokenizeBlock(blockForLine('plain text')!)
    expect(segmentTokens(tokens, [])).toEqual([{ kind: 'text', text: 'plain text', highlightId: null }])
  })
})

describe('renumberAfterPageDelete', () => {
  it('drops the deleted page and shifts later pages', () => {
    const items = [{ id: 'a', pageIndex: 0 }, { id: 'b', pageIndex: 1 }, { id: 'c', pageIndex: 2 }]
    expect(renumberAfterPageDelete(items, 1)).toEqual([{ id: 'a', pageIndex: 0 }, { id: 'c', pageIndex: 1 }])
  })
})

describe('book export with comments', () => {
  it('lists comments under their chapter in passage order', () => {
    const md = renderMarkdown({
      books: [{
        title: 'T', source: 'claude', stickers: [],
        pages: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }],
        comments: [
          { pageIndex: 1, startLine: 3, startOffset: 0, quote: 'later', text: 'second' },
          { pageIndex: 1, startLine: 0, startOffset: 2, quote: 'earlier', text: 'first' },
        ],
      }],
    })
    expect(md).not.toMatch(/## Q1\n\nA1\n\n### Comments/)
    expect(md).toContain('## Q2\n\nA2\n\n### Comments\n\n> earlier\n\n**Comment:** first\n\n> later\n\n**Comment:** second\n')
  })
})
