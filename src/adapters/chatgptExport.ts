import type { ConversationAdapter, AdapterInput, ParsedConversation, Page } from './types'
import { AdapterError, hashId } from './types'

// ── Type guards ───────────────────────────────────────────────────────────────

interface GptContent {
  content_type: string
  parts: unknown[]
}

interface GptMessage {
  author: { role: string }
  content: GptContent
}

interface GptNode {
  message: GptMessage | null
  parent: string | null
}

interface GptConversation {
  id: string
  title: string
  create_time: number
  mapping: Record<string, GptNode>
  current_node: string
}

function isGptMessage(v: unknown): v is GptMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  const author = m.author
  const content = m.content
  return (
    !!author && typeof author === 'object' &&
    typeof (author as Record<string, unknown>).role === 'string' &&
    !!content && typeof content === 'object' &&
    typeof (content as Record<string, unknown>).content_type === 'string' &&
    Array.isArray((content as Record<string, unknown>).parts)
  )
}

function isGptNode(v: unknown): v is GptNode {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  return (
    (n.message === null || n.message === undefined || isGptMessage(n.message)) &&
    (n.parent === null || n.parent === undefined || typeof n.parent === 'string')
  )
}

function isGptConversation(v: unknown): v is GptConversation {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  if (typeof c.current_node !== 'string') return false
  if (typeof c.create_time !== 'number') return false
  if (!c.mapping || typeof c.mapping !== 'object') return false
  // Validate a sample of nodes rather than all (perf on large exports)
  for (const node of Object.values(c.mapping as Record<string, unknown>).slice(0, 5)) {
    if (!isGptNode(node)) return false
  }
  return true
}

// ── Tree walk ─────────────────────────────────────────────────────────────────

/** Walk parent pointers from current_node backwards, then reverse to get
 *  chronological order. This recovers the last-viewed branch when edits exist. */
export function linearize(conv: GptConversation): GptMessage[] {
  const out: GptMessage[] = []
  let nodeId: string | null = conv.current_node
  while (nodeId) {
    const node = conv.mapping[nodeId]
    if (!node) break
    if (node.message) out.push(node.message)
    nodeId = node.parent ?? null
  }
  return out.reverse()
}

// ── Turn pairing ──────────────────────────────────────────────────────────────

function getTextParts(msg: GptMessage): string {
  return msg.content.parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n')
    .trim()
}

interface RawTurn { role: 'user' | 'assistant'; text: string }

function toRawTurns(messages: GptMessage[]): RawTurn[] {
  const turns: RawTurn[] = []
  for (const m of messages) {
    const role = m.author.role
    if (role !== 'user' && role !== 'assistant') continue
    if (m.content.content_type !== 'text') continue
    const text = getTextParts(m)
    if (!text) continue
    turns.push({ role, text })
  }
  return turns
}

export function pairTurns(turns: RawTurn[]): Page[] {
  const pages: Page[] = []
  const active = turns.filter(t => t.text.length > 0)
  let i = 0
  // Skip leading assistant turns
  while (i < active.length && active[i].role === 'assistant') i++

  while (i < active.length) {
    const qParts: string[] = []
    while (i < active.length && active[i].role === 'user') {
      qParts.push(active[i].text)
      i++
    }
    if (qParts.length === 0) { i++; continue }

    // Trailing unanswered question — drop
    if (i >= active.length || active[i].role !== 'assistant') break

    const aParts: string[] = []
    while (i < active.length && active[i].role === 'assistant') {
      aParts.push(active[i].text)
      i++
    }
    pages.push({ question: qParts.join('\n\n'), answer: aParts.join('\n\n') })
  }
  return pages
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const chatgptExportAdapter: ConversationAdapter = {
  id: 'chatgpt-export',
  displayName: 'ChatGPT Export',

  detect(input: AdapterInput): boolean {
    if (input.kind !== 'file') return false
    if (!Array.isArray(input.json)) return false
    const first = input.json[0]
    if (!first || typeof first !== 'object') return false
    const obj = first as Record<string, unknown>
    return 'mapping' in obj && 'current_node' in obj
  },

  parse(input: AdapterInput): ParsedConversation[] {
    if (input.kind !== 'file' || !Array.isArray(input.json)) {
      throw new AdapterError(
        "This file doesn't match the ChatGPT export format we know. " +
        'The format may have changed — please open an issue with a redacted sample.'
      )
    }

    const results: ParsedConversation[] = []
    for (const item of input.json) {
      if (!isGptConversation(item)) continue
      const pages = pairTurns(toRawTurns(linearize(item)))
      if (pages.length === 0) continue
      const rawTitle = typeof item.title === 'string' ? item.title : ''
      const title = rawTitle || pages[0].question.slice(0, 60)
      results.push({
        id: 'cgpt-' + hashId(item.id + title),
        title,
        createdAt: item.create_time * 1000,
        source: 'chatgpt',
        pages,
      })
    }
    return results
  },
}
