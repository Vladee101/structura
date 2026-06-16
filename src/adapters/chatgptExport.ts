import { unzipSync } from 'fflate'
import type { ConversationAdapter, AdapterInput, ParsedConversation, Page } from './types'
import { AdapterError, hashId } from './types'

// ── ZIP / manifest parsing ────────────────────────────────────────────────────

const _decoder = new TextDecoder()
const CONV_FILENAME_RE = /^conversations(-\d+)?\.json$/

interface ManifestLogicalFile {
  files: string[]
  shard_count?: number
  sharded?: boolean
}

interface ExportManifest {
  version: number
  logical_files: Record<string, ManifestLogicalFile>
}

function isManifest(v: unknown): v is ExportManifest {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return typeof m.version === 'number' && !!m.logical_files && typeof m.logical_files === 'object'
}

export interface ZipParseResult {
  conversations: unknown[]
  manifestVersion: number | null
}

/** Extract conversations from a ChatGPT export ZIP.
 *  PRIMARY: reads export_manifest.json and inflates only the listed shards in manifest order.
 *  FALLBACK: if manifest is absent/malformed, matches files by name pattern, sorted ascending. */
export function parseZipBuffer(zipBytes: Uint8Array): ZipParseResult {
  // ── PRIMARY: manifest-driven ──────────────────────────────────────────────
  let manifestWasPresent = false
  let manifest: ExportManifest | null = null
  try {
    const extracted = unzipSync(zipBytes, { filter: f => f.name === 'export_manifest.json' })
    const bytes = extracted['export_manifest.json']
    if (bytes) {
      manifestWasPresent = true
      const parsed: unknown = JSON.parse(_decoder.decode(bytes))
      if (isManifest(parsed)) manifest = parsed
    }
  } catch {
    // manifest absent or malformed JSON — fall through to fallback
  }

  if (manifest !== null) {
    const version = manifest.version
    const isKnownVersion = version === 1
    if (!isKnownVersion) {
      console.warn(`ChatGPT export: manifest version ${version} is not officially supported.`)
    }

    const entry = manifest.logical_files['conversations.json'] as ManifestLogicalFile | undefined
    if (!entry || !Array.isArray(entry.files) || entry.files.length === 0) {
      throw new AdapterError(
        `This ChatGPT export uses manifest version ${version}, which Structura hasn't been updated for yet — please open an issue.`
      )
    }

    const shardSet = new Set(entry.files)
    try {
      const shardZip = unzipSync(zipBytes, { filter: f => shardSet.has(f.name) })
      const conversations: unknown[] = []
      for (const name of entry.files) {
        const bytes = shardZip[name]
        if (!bytes) throw new Error(`Manifest shard "${name}" not found in ZIP`)
        const parsed: unknown = JSON.parse(_decoder.decode(bytes))
        if (!Array.isArray(parsed)) throw new Error(`Shard "${name}" is not a JSON array`)
        conversations.push(...(parsed as unknown[]))
      }
      return { conversations, manifestVersion: version }
    } catch (e) {
      if (!isKnownVersion) {
        throw new AdapterError(
          `This ChatGPT export uses manifest version ${version}, which Structura hasn't been updated for yet — please open an issue.`
        )
      }
      if (e instanceof AdapterError) throw e
      throw new AdapterError((e as Error).message)
    }
  }

  // ── FALLBACK: filename pattern matching ───────────────────────────────────
  const fallbackZip = unzipSync(zipBytes, {
    filter: f => CONV_FILENAME_RE.test(f.name.split('/').pop() ?? f.name),
  })
  const sortedEntries = Object.entries(fallbackZip).sort(([a], [b]) => a.localeCompare(b))

  if (sortedEntries.length === 0) {
    const note = manifestWasPresent
      ? 'export_manifest.json was found but could not be parsed'
      : 'no export_manifest.json was found'
    throw new AdapterError(
      `No conversation files found in this ZIP (${note}). ` +
      'The format may have changed — please open an issue with a redacted sample.'
    )
  }

  const conversations: unknown[] = []
  for (const [, bytes] of sortedEntries) {
    const parsed: unknown = JSON.parse(_decoder.decode(bytes))
    if (Array.isArray(parsed)) conversations.push(...(parsed as unknown[]))
  }
  return { conversations, manifestVersion: null }
}

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
    const node: GptNode | undefined = conv.mapping[nodeId]
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
