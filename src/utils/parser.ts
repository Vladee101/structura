import { Page } from '../types'

// ─── Known labels ──────────────────────────────────────────────────────────

const USER_LABELS = new Set(['you', 'human', 'user', 'me'])
const AI_LABELS = new Set([
  'chatgpt', 'gpt', 'gpt-4', 'gpt-4o', 'gpt-3', 'gpt4', 'gpt4o',
  'claude', 'gemini', 'bard', 'copilot', 'perplexity',
  'assistant', 'ai', 'bot', 'llm',
  'mistral', 'llama', 'deepseek', 'qwen', 'grok',
])

function normalizeLabel(raw: string): string {
  return raw
    .replace(/^\*+/, '').replace(/\*+$/, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase()
}

function isKnownUser(s: string) { return USER_LABELS.has(normalizeLabel(s)) }
function isKnownAI(s: string)   { return AI_LABELS.has(normalizeLabel(s))   }

// ─── Smart label detection ─────────────────────────────────────────────────

// A candidate speaker label is a short standalone line that:
//   - is 1–30 chars, mostly alphabetic
//   - appears at least twice in the document
//   - is NOT a bullet, number, or markdown heading
function isCandidateLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 30 || t.length < 1) return false
  if (/^[#\-*>]/.test(t)) return false          // markdown
  if (/^\d+[.)]\s/.test(t)) return false         // numbered list
  if (/[`[\]{}|\\]/.test(t)) return false        // code-like
  if ((t.match(/[a-zA-Z]/g) || []).length < 1) return false
  return true
}

// Returns {userLabel, aiLabel} if we can detect two alternating speakers,
// or null if we can't.
function detectSpeakerLabels(lines: string[]): { user: string; ai: string } | null {
  // Count occurrences of each candidate line
  const counts: Record<string, number> = {}
  for (const line of lines) {
    const t = line.trim()
    if (isCandidateLine(t)) counts[t] = (counts[t] || 0) + 1
  }

  // Must appear at least twice (= at least 2 turns each)
  const candidates = Object.keys(counts).filter(k => counts[k] >= 2)
  if (candidates.length < 2) return null

  // Try every pair of candidates; find one that strictly alternates
  // Sort by frequency desc to try most-likely first
  candidates.sort((a, b) => counts[b] - counts[a])

  for (let i = 0; i < Math.min(candidates.length, 6); i++) {
    for (let j = i + 1; j < Math.min(candidates.length, 6); j++) {
      const a = candidates[i]
      const b = candidates[j]
      const seq = lines
        .map(l => l.trim())
        .filter(l => l === a || l === b)

      if (seq.length < 4) continue

      let alternates = true
      for (let k = 1; k < seq.length; k++) {
        if (seq[k] === seq[k - 1]) { alternates = false; break }
      }
      if (!alternates) continue

      // Decide which is user and which is AI
      const firstLabel = seq[0]
      const secondLabel = seq[1]

      // Prefer known labels to assign roles
      if (isKnownUser(firstLabel) || isKnownAI(secondLabel)) {
        return { user: firstLabel, ai: secondLabel }
      }
      if (isKnownAI(firstLabel) || isKnownUser(secondLabel)) {
        return { user: secondLabel, ai: firstLabel }
      }
      // No known labels — assume first speaker is user (most common)
      return { user: firstLabel, ai: secondLabel }
    }
  }

  return null
}

// ─── Turn building ─────────────────────────────────────────────────────────

interface Turn {
  role: 'user' | 'ai'
  content: string
}

function buildTurns(text: string): Turn[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // 1. Try known standalone labels first
  const hasKnown = lines.some(l => isKnownUser(l.trim()) || isKnownAI(l.trim()))

  // 2. If not found, try inline "Label: content" format
  const INLINE_RE = /^([A-Za-z][A-Za-z0-9 \-]{0,20}):\s+(.+)/

  // 3. If still nothing, try smart detection
  const detected = hasKnown ? null : detectSpeakerLabels(lines)

  const turns: Turn[] = []
  let currentRole: 'user' | 'ai' | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentRole !== null && currentLines.length > 0) {
      const content = currentLines.join('\n').trim()
      if (content) turns.push({ role: currentRole, content })
    }
    currentLines = []
  }

  const classify = (line: string): 'user' | 'ai' | null => {
    const t = line.trim()

    // Known standalone
    if (t.length <= 35) {
      if (isKnownUser(t)) return 'user'
      if (isKnownAI(t))   return 'ai'
    }

    // Smart-detected labels
    if (detected) {
      if (t === detected.user) return 'user'
      if (t === detected.ai)   return 'ai'
    }

    // Inline "Label: content" — only if label is known or detected
    const m = line.match(INLINE_RE)
    if (m) {
      const label = m[1].trim()
      if (isKnownUser(label)) return 'user'
      if (isKnownAI(label))   return 'ai'
      if (detected) {
        if (label === detected.user) return 'user'
        if (label === detected.ai)   return 'ai'
      }
    }

    return null
  }

  for (const line of lines) {
    const role = classify(line)
    if (role !== null) {
      flush()
      currentRole = role

      // Handle inline format: content starts on same line
      const m = line.match(INLINE_RE)
      if (m && !isStandaloneLabel(line)) {
        currentLines = [m[2]]
      }
    } else {
      currentLines.push(line)
    }
  }
  flush()

  return turns
}

function isStandaloneLabel(line: string): boolean {
  const t = line.trim()
  return t.length <= 35 && (isKnownUser(t) || isKnownAI(t))
}

// ─── Pages from turns ──────────────────────────────────────────────────────

function pagesFromTurns(turns: Turn[]): Page[] {
  const pages: Page[] = []
  let i = 0

  while (i < turns.length && turns[i].role === 'ai') i++

  while (i < turns.length) {
    const userTurn = turns[i]
    if (userTurn.role !== 'user') { i++; continue }

    const aiTurn = turns[i + 1]
    if (!aiTurn || aiTurn.role !== 'ai') { i++; continue }

    pages.push({
      id: `page-${pages.length}`,
      title: userTurn.content,
      body: aiTurn.content,
      index: pages.length,
    })

    i += 2
  }
  return pages
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ParseResult {
  pages: Page[]
  usedFallback: boolean
}

export function parseConversation(text: string): ParseResult {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  const turns = buildTurns(normalized)
  const pages = pagesFromTurns(turns)
  return { pages, usedFallback: false }
}

export function detectFormat(text: string): boolean {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.some(l => isKnownUser(l.trim()) || isKnownAI(l.trim()))) return true
  if (detectSpeakerLabels(lines) !== null) return true
  const INLINE_RE = /^([A-Za-z][A-Za-z0-9 \-]{0,20}):\s+(.+)/
  if (lines.some(l => {
    const m = l.match(INLINE_RE)
    if (!m) return false
    const label = m[1].trim()
    return isKnownUser(label) || isKnownAI(label)
  })) return true
  return false
}
