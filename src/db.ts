import Dexie, { type Table } from 'dexie'
import type { Page, Sticker } from './types'

export interface BookRecord {
  id: string
  title: string
  createdAt: number
  importedAt: number
  source: 'chatgpt' | 'claude' | 'paste'
  pages: Page[]
}

class StructuraDB extends Dexie {
  books!: Table<BookRecord, string>
  stickers!: Table<Sticker, string>

  constructor() {
    super('structura')
    this.version(1).stores({
      books: 'id, importedAt, createdAt, source',
      stickers: 'id, bookId, createdAt',
    })
  }
}

export const db = new StructuraDB()
