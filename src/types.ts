export interface Page {
  id: string
  title: string
  body: string
  index: number
}

export interface Sticker {
  id: string
  text: string
  pageId: string
  pageTitle: string
  color: string
  createdAt: number
}

export interface Book {
  id: string
  title: string
  pages: Page[]
  stickers: Sticker[]
  createdAt: number
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
