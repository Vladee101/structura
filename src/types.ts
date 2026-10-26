export interface FileAttachment {
  kind: 'file'
  path: string
  content: string
  /** The file existed earlier in the conversation; this is a later version. */
  updated: boolean
}

export interface WidgetAttachment {
  kind: 'widget'
  title: string
  /** SVG or HTML written by Claude; only ever rendered inside a sandboxed iframe. */
  code: string
}

export interface ChartAttachment {
  kind: 'chart'
  title: string
  style: string
  categories: string[]
  series: { name: string; values: number[] }[]
  yTitle?: string
  yMax?: number
}

export type AttachmentData = FileAttachment | WidgetAttachment | ChartAttachment

/** A file, widget or chart shown in place of answer line `line` (a hidden marker or placeholder line). */
export type Attachment = AttachmentData & { line: number }

export interface Page {
  question: string
  answer: string
  attachments?: Attachment[]
}

export interface Sticker {
  id: string
  bookId: string
  pageIndex: number
  text: string
  color: string
  createdAt: number
}

/** A note attached to a passage of an answer. Offsets index into the rendered
 *  (plain) text of the answer's source lines, so marks survive re-rendering. */
export interface Comment {
  id: string
  bookId: string
  pageIndex: number
  startLine: number
  startOffset: number
  endLine: number
  endOffset: number
  quote: string
  text: string
  createdAt: number
  updatedAt: number
}

export interface Book {
  id: string
  title: string
  createdAt: number
  importedAt: number
  source: 'chatgpt' | 'claude' | 'paste' | 'deepseek'
  pages: Page[]
  stickers: Sticker[]
  comments: Comment[]
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
