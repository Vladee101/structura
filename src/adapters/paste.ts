import type { ConversationAdapter, AdapterInput, ParsedConversation } from './types'
import { AdapterError, hashId } from './types'
import { parseConversation } from '../utils/parser'

export const pasteAdapter: ConversationAdapter = {
  id: 'paste',
  displayName: 'Paste Text',

  detect(input: AdapterInput): boolean {
    return input.kind === 'text'
  },

  parse(input: AdapterInput): ParsedConversation[] {
    if (input.kind !== 'text') {
      throw new AdapterError('Paste adapter requires text input.')
    }
    const text = input.text.trim()
    if (!text) return []

    const { pages } = parseConversation(text)
    if (pages.length === 0) return []

    const title = pages[0].title.slice(0, 80)
    return [{
      id: 'paste-' + hashId(text.slice(0, 300) + String(text.length)),
      title,
      createdAt: Date.now(),
      source: 'paste',
      pages: pages.map(p => ({ question: p.title, answer: p.body })),
    }]
  },
}
