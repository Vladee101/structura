import type { ConversationAdapter, AdapterInput, ParsedConversation, Page } from './types'
import type { AttachmentData } from '../types'
import { AdapterError } from './types'
import { pairTurns } from './chatgptExport'
import { ATTACHMENT_MARKER_RE, attachmentMarker, resolveAttachments, toolSlots } from './claudeAttachments'
import type { ClaudeBlock } from './claudeAttachments'

// ── Type guards ───────────────────────────────────────────────────────────────

interface ClaudeMessage {
  sender: string
  text?: string
  content?: ClaudeBlock[]
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

/** What Claude's export writes into `text` in place of tool calls, widgets, files and thinking. */
export const UNSUPPORTED_BLOCK_PLACEHOLDER = 'This block is not supported on your current device yet.'

const PLACEHOLDER_RE = new RegExp(
  '(?:```[^\\n]*\\n\\s*)?' + UNSUPPORTED_BLOCK_PLACEHOLDER.replace(/[.]/g, '\\.') + '(?:\\s*\\n```)?',
  'g',
)

/** Removes unsupported-block placeholders (and their code fences) and the gaps they leave. */
export function stripUnsupportedBlocks(text: string): string {
  return text.replace(PLACEHOLDER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** `ids[k]` is the attachment id for the message's k-th tool_use, or null if it shows nothing. */
function extractText(msg: ClaudeMessage, ids: (number | null)[]): string {
  // Prefer the structured blocks: `text` flattens every tool call into a placeholder.
  if (Array.isArray(msg.content)) {
    const parts: string[] = []
    let k = 0
    for (const block of msg.content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text.trim())
      if (block.type === 'tool_use') {
        const id = ids[k++]
        if (id !== null && id !== undefined) parts.push(attachmentMarker(id))
      }
    }
    if (parts.length > 0) return stripUnsupportedBlocks(parts.join('\n\n'))
  }
  if (typeof msg.text === 'string') return stripUnsupportedBlocks(msg.text)
  return ''
}

// Older versions stored `text` verbatim, placeholders included. Each placeholder stands for one
// tool_use, in order, so tagging them lets attachments land on those exact lines.
const legacyTag = (id: number) => `\u0000structura-legacy:${id}\u0000`
const LEGACY_TAG_RE = /\u0000structura-legacy:(\d+)\u0000/
const LEGACY_TAG_RE_G = /\u0000structura-legacy:\d+\u0000/g

function legacyText(msg: ClaudeMessage, ids: (number | null)[]): string {
  let text = ''
  if (typeof msg.text === 'string' && msg.text.trim()) text = msg.text.trim()
  else if (Array.isArray(msg.content)) {
    text = msg.content
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string)
      .join('\n')
      .trim()
  }
  const parts = text.split(UNSUPPORTED_BLOCK_PLACEHOLDER)
  if (parts.length - 1 !== ids.length || !ids.some(id => id !== null)) return text
  return parts.reduce((acc, part, i) => {
    if (i === 0) return part
    const id = ids[i - 1]
    return acc + (id === null ? UNSUPPORTED_BLOCK_PLACEHOLDER : legacyTag(id)) + part
  }, '')
}

const untag = (s: string) => s.replace(LEGACY_TAG_RE_G, UNSUPPORTED_BLOCK_PLACEHOLDER)

// ── Conversion ────────────────────────────────────────────────────────────────

function toPagesFromClaude(msgs: ClaudeMessage[]): { pages: Page[]; legacyPages?: Page[] } {
  const files = new Map<string, string>()
  const byId = new Map<number, AttachmentData>()
  const turns: { role: 'user' | 'assistant'; text: string }[] = []
  const legacyTurns: { role: 'user' | 'assistant'; text: string }[] = []

  for (const m of msgs.filter(isClaudeMessage)) {
    if (m.sender !== 'human' && m.sender !== 'assistant') continue
    const role = m.sender === 'human' ? 'user' : 'assistant'
    const blocks = Array.isArray(m.content) ? m.content : []
    const slots = role === 'assistant' ? toolSlots(blocks, files) : []
    const ids = slots.map(slot => {
      if (!slot) return null
      const id = byId.size
      byId.set(id, slot)
      return id
    })
    turns.push({ role, text: extractText(m, ids) })
    legacyTurns.push({ role, text: legacyText(m, ids) })
  }

  const pages = pairTurns(turns.filter(t => t.text.length > 0))
    .map(p => resolveAttachments(p, byId, ATTACHMENT_MARKER_RE))
  if (byId.size === 0) return { pages }

  const legacyPages = pairTurns(legacyTurns.filter(t => t.text.length > 0))
    .map(p => resolveAttachments(p, byId, LEGACY_TAG_RE))
    .map(p => ({ ...p, question: untag(p.question), answer: untag(p.answer) }))
  return { pages, legacyPages }
}

// ── Download manifest ─────────────────────────────────────────────────────────

export interface ClaudeDownloadLink {
  filename: string
  url: string
}

/** Claude's newer exports arrive as a manifest of download links rather than the data itself.
 *  Returns the conversation download links (claude.ai only), or null if this isn't such a manifest. */
export function readClaudeDownloadManifest(json: unknown): ClaudeDownloadLink[] | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const files = (json as Record<string, unknown>).data_files
  if (!Array.isArray(files) || !files.some(f => !!f && typeof f === 'object' && 'export_url' in f)) return null

  const links: ClaudeDownloadLink[] = []
  for (const f of files) {
    if (!f || typeof f !== 'object') continue
    const { category, export_url, filename } = f as Record<string, unknown>
    if (category !== 'conversations' || typeof export_url !== 'string') continue
    try {
      const u = new URL(export_url)
      if (u.protocol !== 'https:' || u.hostname !== 'claude.ai') continue
    } catch { continue }
    links.push({ filename: typeof filename === 'string' ? filename : 'conversations.zip', url: export_url })
  }
  return links
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
      const { pages, legacyPages } = toPagesFromClaude(item.chat_messages)
      if (pages.length === 0) continue
      const title = (item.name || pages[0].question).slice(0, 80)
      results.push({
        id: item.uuid,
        title,
        createdAt: new Date(item.created_at).getTime(),
        source: 'claude',
        pages,
        ...(legacyPages && { legacyPages }),
      })
    }
    return results
  },
}
