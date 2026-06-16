import type { ConversationAdapter, AdapterInput, ParsedConversation, Page } from './types'
import { AdapterError, hashId } from './types'
import { pairTurns } from './chatgptExport'

// ── Type guards ───────────────────────────────────────────────────────────────

interface DsFragment {
  type: string
  content: string
}

interface DsMessage {
  files: unknown[]
  model: string
  inserted_at: string
  fragments: DsFragment[]
}

interface DsNode {
  id: string
  parent: string | null
  children: string[]
  message: DsMessage | null
}

interface DsConversation {
  id: string
  title: string
  inserted_at: string
  updated_at: string
  mapping: Record<string, DsNode>
}

function isDsFragment(v: unknown): v is DsFragment {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  return typeof f.type === 'string' && typeof f.content === 'string'
}

function isDsMessage(v: unknown): v is DsMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  if (!Array.isArray(m.files)) return false
  if (typeof m.model !== 'string') return false
  if (typeof m.inserted_at !== 'string') return false
  if (!Array.isArray(m.fragments)) return false
  const first = (m.fragments as unknown[])[0]
  if (first !== undefined && !isDsFragment(first)) return false
  return true
}

function isDsNode(v: unknown): v is DsNode {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    (n.parent === null || n.parent === undefined || typeof n.parent === 'string') &&
    Array.isArray(n.children) &&
    (n.message === null || n.message === undefined || isDsMessage(n.message))
  )
}

function isDsConversation(v: unknown): v is DsConversation {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  if (typeof c.id !== 'string') return false
  if (typeof c.inserted_at !== 'string') return false
  if (!c.mapping || typeof c.mapping !== 'object') return false
  for (const node of Object.values(c.mapping as Record<string, unknown>).slice(0, 5)) {
    if (!isDsNode(node)) return false
  }
  return true
}

// ── Linearization (forward walk from root) ────────────────────────────────────

function linearize(conv: DsConversation): DsMessage[] {
  const visited = new Set<string>()
  const messages: DsMessage[] = []
  let nodeId: string | null = 'root'

  while (nodeId) {
    if (visited.has(nodeId)) break  // cycle guard
    visited.add(nodeId)

    const node: DsNode | undefined = conv.mapping[nodeId]
    if (!node) break

    if (node.message != null) messages.push(node.message)

    // On branches, pick the LAST child — newest branch, because DeepSeek exports
    // carry no active-branch pointer (unlike ChatGPT's current_node).
    nodeId = node.children.length > 0
      ? node.children[node.children.length - 1]
      : null
  }

  return messages
}

// ── Content extraction ────────────────────────────────────────────────────────

function extractTurn(msg: DsMessage): { role: 'user' | 'assistant'; text: string } | null {
  const isUser = msg.fragments.some(f => f.type === 'REQUEST')
  const isAssistant = msg.fragments.some(f => f.type === 'RESPONSE')

  if (!isUser && !isAssistant) return null

  const role: 'user' | 'assistant' = isUser ? 'user' : 'assistant'
  const keepType = isUser ? 'REQUEST' : 'RESPONSE'

  const text = msg.fragments
    .filter(f => f.type === keepType)
    .map(f => f.content)
    .join('\n\n')
    .trim()

  if (!text) return null
  return { role, text }
}

function toPagesFromDeepSeek(messages: DsMessage[]): Page[] {
  const turns: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (const msg of messages) {
    const turn = extractTurn(msg)
    if (turn) turns.push(turn)
  }
  return pairTurns(turns)
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const deepseekExportAdapter: ConversationAdapter = {
  id: 'deepseek-export',
  displayName: 'DeepSeek Export',

  detect(input: AdapterInput): boolean {
    if (input.kind !== 'file') return false
    if (!Array.isArray(input.json)) return false
    const first = input.json[0]
    if (!first || typeof first !== 'object') return false
    const obj = first as Record<string, unknown>
    if (!obj.mapping || typeof obj.mapping !== 'object') return false
    // DeepSeek has mapping but NO current_node (unlike ChatGPT)
    if ('current_node' in obj) return false
    // At least one non-null message must carry a fragments array
    return Object.values(obj.mapping as Record<string, unknown>).some(n => {
      if (!n || typeof n !== 'object') return false
      const node = n as Record<string, unknown>
      if (!node.message || typeof node.message !== 'object') return false
      return Array.isArray((node.message as Record<string, unknown>).fragments)
    })
  },

  parse(input: AdapterInput): ParsedConversation[] {
    if (input.kind !== 'file' || !Array.isArray(input.json)) {
      throw new AdapterError(
        "This file doesn't match the DeepSeek export format we know. " +
        'The format may have changed — please open an issue with a redacted sample.'
      )
    }

    const results: ParsedConversation[] = []
    for (const item of input.json) {
      if (!isDsConversation(item)) continue
      const pages = toPagesFromDeepSeek(linearize(item))
      if (pages.length === 0) continue
      const rawTitle = typeof item.title === 'string' ? item.title : ''
      const title = (rawTitle || pages[0].question).slice(0, 80)
      results.push({
        id: 'ds-' + hashId(item.id + title),
        title,
        createdAt: new Date(item.inserted_at).getTime(),
        source: 'deepseek',
        pages,
      })
    }
    return results
  },
}
