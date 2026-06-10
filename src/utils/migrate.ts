import { db } from '../db'
import type { Sticker } from '../types'

const LEGACY_KEY = 'structura_book'

interface LegacyPage {
  title: string
  body: string
}

interface LegacySticker {
  id: string
  text: string
  pageId: string
  color: string
  createdAt: number
}

interface LegacyBook {
  id: string
  title: string
  pages: LegacyPage[]
  stickers: LegacySticker[]
  createdAt: number
}

export async function migrateFromLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return

  let legacy: LegacyBook
  try {
    legacy = JSON.parse(raw) as LegacyBook
  } catch {
    localStorage.removeItem(LEGACY_KEY)
    return
  }

  const existing = await db.books.get(legacy.id)
  if (existing) {
    localStorage.removeItem(LEGACY_KEY)
    return
  }

  const stickers: Sticker[] = legacy.stickers.map(s => ({
    id: s.id,
    bookId: legacy.id,
    pageIndex: parseInt(s.pageId.replace('page-', ''), 10) || 0,
    text: s.text,
    color: s.color,
    createdAt: s.createdAt,
  }))

  await db.transaction('rw', db.books, db.stickers, async () => {
    await db.books.add({
      id: legacy.id,
      title: legacy.title,
      createdAt: legacy.createdAt,
      importedAt: legacy.createdAt,
      source: 'paste',
      pages: legacy.pages.map(p => ({ question: p.title, answer: p.body })),
    })
    if (stickers.length > 0) await db.stickers.bulkAdd(stickers)
  })

  localStorage.removeItem(LEGACY_KEY)
}
