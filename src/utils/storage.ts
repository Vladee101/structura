import { Book, Sticker } from '../types'

const KEY = 'structura_book'

export function saveBook(book: Book): void {
  localStorage.setItem(KEY, JSON.stringify(book))
}

export function loadBook(): Book | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as Book
  } catch {
    return null
  }
}

export function clearBook(): void {
  localStorage.removeItem(KEY)
}

export function addSticker(sticker: Sticker): void {
  const book = loadBook()
  if (!book) return
  book.stickers = [...book.stickers, sticker]
  saveBook(book)
}

export function removeSticker(stickerId: string): void {
  const book = loadBook()
  if (!book) return
  book.stickers = book.stickers.filter(s => s.id !== stickerId)
  saveBook(book)
}
