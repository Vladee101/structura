export interface Page {
  question: string
  answer: string
}

export interface Sticker {
  id: string
  bookId: string
  pageIndex: number
  text: string
  color: string
  createdAt: number
}

export interface Book {
  id: string
  title: string
  createdAt: number
  importedAt: number
  source: 'chatgpt' | 'claude' | 'paste'
  pages: Page[]
  stickers: Sticker[]
}

export const STICKER_COLORS = [
  '#fef08a',
  '#fda4af',
  '#86efac',
  '#93c5fd',
  '#d8b4fe',
  '#fdba74',
]

export const TAB_COLORS = [
  '#c9913a',
  '#5f8f6a',
  '#4a7aad',
  '#b05c3e',
  '#7a5fa0',
]
