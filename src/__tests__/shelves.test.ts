import { describe, it, expect } from 'vitest'
import {
  SHELF_COLORS,
  nextShelfColor,
  addMembership,
  removeMembership,
  removeShelfMemberships,
  removeBookMemberships,
  booksOnShelf,
  shelfBookCount,
  shelvesForBook,
} from '../utils/shelves'

// ── fixtures ──────────────────────────────────────────────────

const m = (shelfId: string, bookId: string) => ({ shelfId, bookId })

const MEMBERSHIPS = [
  m('s1', 'b1'),
  m('s1', 'b2'),
  m('s2', 'b2'),
  m('s2', 'b3'),
  m('s3', 'b1'),
]

const BOOKS = [
  { id: 'b1', title: 'Alpha' },
  { id: 'b2', title: 'Beta' },
  { id: 'b3', title: 'Gamma' },
]

// ── nextShelfColor ────────────────────────────────────────────

describe('nextShelfColor', () => {
  it('cycles through SHELF_COLORS', () => {
    expect(nextShelfColor(0)).toBe(SHELF_COLORS[0])
    expect(nextShelfColor(SHELF_COLORS.length)).toBe(SHELF_COLORS[0])
    expect(nextShelfColor(SHELF_COLORS.length + 2)).toBe(SHELF_COLORS[2])
  })
})

// ── addMembership ─────────────────────────────────────────────

describe('addMembership', () => {
  it('adds a new [shelfId+bookId] pair', () => {
    const result = addMembership(MEMBERSHIPS, m('s1', 'b3'))
    expect(result).toHaveLength(MEMBERSHIPS.length + 1)
    expect(result.some(x => x.shelfId === 's1' && x.bookId === 'b3')).toBe(true)
  })

  it('is idempotent — does not duplicate an existing pair', () => {
    const result = addMembership(MEMBERSHIPS, m('s1', 'b1'))
    expect(result).toBe(MEMBERSHIPS) // same reference
    expect(result).toHaveLength(MEMBERSHIPS.length)
  })
})

// ── removeMembership ──────────────────────────────────────────

describe('removeMembership', () => {
  it('removes exactly the matching [shelfId+bookId]', () => {
    const result = removeMembership(MEMBERSHIPS, 'b2', 's1')
    expect(result).toHaveLength(MEMBERSHIPS.length - 1)
    expect(result.some(x => x.shelfId === 's1' && x.bookId === 'b2')).toBe(false)
    // s2+b2 must still be there
    expect(result.some(x => x.shelfId === 's2' && x.bookId === 'b2')).toBe(true)
  })

  it('returns the same array if the pair does not exist', () => {
    const result = removeMembership(MEMBERSHIPS, 'b99', 's1')
    expect(result).toHaveLength(MEMBERSHIPS.length)
  })
})

// ── removeShelfMemberships ────────────────────────────────────

describe('removeShelfMemberships', () => {
  it('removes all memberships for a shelf', () => {
    const result = removeShelfMemberships(MEMBERSHIPS, 's1')
    expect(result.every(x => x.shelfId !== 's1')).toBe(true)
    expect(result).toHaveLength(3) // s2+b2, s2+b3, s3+b1 remain
  })

  it('returns all entries unchanged when shelf has no members', () => {
    const result = removeShelfMemberships(MEMBERSHIPS, 's99')
    expect(result).toHaveLength(MEMBERSHIPS.length)
  })
})

// ── removeBookMemberships ─────────────────────────────────────

describe('removeBookMemberships', () => {
  it('removes all memberships for a book', () => {
    const result = removeBookMemberships(MEMBERSHIPS, 'b2')
    expect(result.every(x => x.bookId !== 'b2')).toBe(true)
    expect(result).toHaveLength(3) // s1+b1, s2+b3, s3+b1 remain
  })

  it('returns all entries unchanged when book has no memberships', () => {
    const result = removeBookMemberships(MEMBERSHIPS, 'b99')
    expect(result).toHaveLength(MEMBERSHIPS.length)
  })
})

// ── booksOnShelf ──────────────────────────────────────────────

describe('booksOnShelf', () => {
  it('returns only books that belong to the shelf', () => {
    const result = booksOnShelf(BOOKS, MEMBERSHIPS, 's1')
    expect(result.map(b => b.id).sort()).toEqual(['b1', 'b2'])
  })

  it('preserves book order from the books array', () => {
    const result = booksOnShelf(BOOKS, MEMBERSHIPS, 's2')
    expect(result.map(b => b.id)).toEqual(['b2', 'b3'])
  })

  it('returns empty array for a shelf with no memberships', () => {
    expect(booksOnShelf(BOOKS, MEMBERSHIPS, 's99')).toHaveLength(0)
  })
})

// ── shelfBookCount ────────────────────────────────────────────

describe('shelfBookCount', () => {
  it('counts correctly', () => {
    expect(shelfBookCount(MEMBERSHIPS, 's1')).toBe(2)
    expect(shelfBookCount(MEMBERSHIPS, 's3')).toBe(1)
    expect(shelfBookCount(MEMBERSHIPS, 's99')).toBe(0)
  })
})

// ── shelvesForBook ────────────────────────────────────────────

describe('shelvesForBook', () => {
  it('returns all shelf IDs the book belongs to', () => {
    expect(shelvesForBook(MEMBERSHIPS, 'b2').sort()).toEqual(['s1', 's2'])
    expect(shelvesForBook(MEMBERSHIPS, 'b1').sort()).toEqual(['s1', 's3'])
  })

  it('returns empty array when book has no memberships', () => {
    expect(shelvesForBook(MEMBERSHIPS, 'b99')).toHaveLength(0)
  })
})
