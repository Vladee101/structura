export interface ParsedConversation {
  id: string
  title: string
  createdAt: number
  source: 'chatgpt' | 'claude' | 'paste' | 'deepseek'
  pages: Page[]
}

export interface Page {
  question: string
  answer: string
}

export type AdapterInput =
  | { kind: 'file'; name: string; json: unknown }
  | { kind: 'text'; text: string }

export interface ConversationAdapter {
  id: string
  displayName: string
  detect(input: AdapterInput): boolean
  parse(input: AdapterInput): ParsedConversation[]
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterError'
  }
}

/** FNV-1a 32-bit hash for stable content-addressable IDs. */
export function hashId(s: string): string {
  let h = 2166136261 >>> 0
  const len = Math.min(s.length, 1000)
  for (let i = 0; i < len; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
