import type { ConversationAdapter, AdapterInput, ParsedConversation, Page } from './types'
import { AdapterError } from './types'
import { pairTurns } from './chatgptExport'

// ── Type guards ───────────────────────────────────────────────────────────────

interface ClaudeMessage {
  sender: string
  text?: string
  content?: Array<{ type: string; text?: string }>
}

interface ClaudeConversation {
  uuid: string
  name: string
  created_at: string
  chat_messages: ClaudeMessage[]
}

function isClaudeMessage(v: unknown): v is ClaudeMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return typeof m.sender === 'string'
}

function isClaudeConversation(v: unknown): v is ClaudeConversation {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.uuid === 'string' &&
    typeof c.created_at === 'string' &&
    Array.isArray(c.chat_messages)
  )
}

// ── Text extraction ───────────────────────────────────────────────────────────

function extractText(msg: ClaudeMessage): string {
  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim()
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string)
      .join('\n')
      .trim()
  }
  return ''
}

// ── Conversion ────────────────────────────────────────────────────────────────

function toPagesFromClaude(msgs: ClaudeMessage[]): Page[] {
  const turns = msgs
    .filter(isClaudeMessage)
    .filter(m => m.sender === 'human' || m.sender === 'assistant')
    .map(m => ({
      role: (m.sender === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      text: extractText(m),
    }))
    .filter(t => t.text.length > 0)
  return pairTurns(turns)
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const claudeExportAdapter: ConversationAdapter = {
  id: 'claude-export',
  displayName: 'Claude Export',

  detect(input: AdapterInput): boolean {
    if (input.kind !== 'file') return false
    if (!Array.isArray(input.json)) return false
    const first = input.json[0]
    if (!first || typeof first !== 'object') return false
    const obj = first as Record<string, unknown>
    return 'chat_messages' in obj && 'uuid' in obj
  },

  parse(input: AdapterInput): ParsedConversation[] {
    if (input.kind !== 'file' || !Array.isArray(input.json)) {
      throw new AdapterError(
        "This file doesn't match the Claude export format we know. " +
        'The format may have changed — please open an issue with a redacted sample.'
      )
    }

    const results: ParsedConversation[] = []
    for (const item of input.json) {
      if (!isClaudeConversation(item)) continue
      const pages = toPagesFromClaude(item.chat_messages)
      if (pages.length === 0) continue
      const title = (item.name || pages[0].question).slice(0, 80)
      results.push({
        id: item.uuid,
        title,
        createdAt: new Date(item.created_at).getTime(),
        source: 'claude',
        pages,
      })
    }
    return results
  },
}
