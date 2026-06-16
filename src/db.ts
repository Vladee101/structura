import Dexie, { type Table } from 'dexie'
import type { Page, Sticker } from './types'

export interface BookRecord {
  id: string
  title: string
  createdAt: number
  importedAt: number
  source: 'chatgpt' | 'claude' | 'paste' | 'deepseek'
  pages: Page[]
  manifestVersion?: number | null
}

export interface Shelf {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface ShelfMembership {
  id: string
  shelfId: string
  bookId: string
  addedAt: number
}

class StructuraDB extends Dexie {
  books!: Table<BookRecord, string>
  stickers!: Table<Sticker, string>
  shelves!: Table<Shelf, string>
  shelfMemberships!: Table<ShelfMembership, string>

  constructor() {
    super('structura')
    this.version(1).stores({
      books: 'id, importedAt, createdAt, source',
      stickers: 'id, bookId, createdAt',
    })
    // Version 2: add shelves + join table. Books/stickers stores unchanged.
    this.version(2).stores({
      shelves: 'id, createdAt',
      shelfMemberships: 'id, [shelfId+bookId], shelfId, bookId',
    })
  }
}

export const db = new StructuraDB()

/** Idempotent: inserts a membership only if [shelfId+bookId] doesn't already exist. */
export async function addBookToShelf(bookId: string, shelfId: string): Promise<void> {
  const existing = await db.shelfMemberships
    .where('[shelfId+bookId]')
    .equals([shelfId, bookId])
    .first()
  if (existing) return
  await db.shelfMemberships.add({
    id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    shelfId,
    bookId,
    addedAt: Date.now(),
  })
}

/** Removes exactly the [bookId+shelfId] membership. Other memberships untouched. */
export async function removeBookFromShelf(bookId: string, shelfId: string): Promise<void> {
  await db.shelfMemberships
    .where('[shelfId+bookId]')
    .equals([shelfId, bookId])
    .delete()
}
