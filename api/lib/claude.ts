export interface Page {
  id: string
  title: string
  body: string
  index: number
}

// Claude share pages (claude.ai/share/...) are server-side rendered.
// The conversation turns appear as structured HTML elements.
// We look for common patterns in the rendered markup.

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Turn {
  role: 'user' | 'ai'
  text: string
}

export function parseClaude(html: string): Page[] {
  // Strategy 1: look for JSON data embedded in script tags
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scriptMatches) {
    const content = m[1]
    if (!content.includes('"human"') && !content.includes('"assistant"')) continue
    try {
      // Try to parse as JSON directly
      const data = JSON.parse(content)
      const pages = extractFromJson(data)
      if (pages.length > 0) return pages
    } catch {
      // Try to find a JSON object within the script
      const jsonMatch = content.match(/\{[\s\S]+\}/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0])
          const pages = extractFromJson(data)
          if (pages.length > 0) return pages
        } catch { /* continue */ }
      }
    }
  }

  // Strategy 2: parse HTML structure
  // Claude renders human turns and AI turns in alternating divs.
  // Common class patterns: data-testid="human-turn", data-testid="ai-turn"
  const turns: Turn[] = []

  const humanPattern = /data-testid="human-turn"[^>]*>([\s\S]*?)(?=data-testid="|<\/main>)/g
  const aiPattern    = /data-testid="ai-turn"[^>]*>([\s\S]*?)(?=data-testid="|<\/main>)/g

  let hMatch: RegExpExecArray | null
  let aMatch: RegExpExecArray | null
  const humans: { index: number; text: string }[] = []
  const ais: { index: number; text: string }[] = []

  while ((hMatch = humanPattern.exec(html)) !== null) {
    humans.push({ index: hMatch.index, text: decodeHtmlEntities(stripTags(hMatch[1])) })
  }
  while ((aMatch = aiPattern.exec(html)) !== null) {
    ais.push({ index: aMatch.index, text: decodeHtmlEntities(stripTags(aMatch[1])) })
  }

  // Interleave by position
  const allTurns = [
    ...humans.map(h => ({ ...h, role: 'user' as const })),
    ...ais.map(a => ({ ...a, role: 'ai' as const })),
  ].sort((a, b) => a.index - b.index)

  turns.push(...allTurns.map(t => ({ role: t.role, text: t.text })))

  if (turns.length === 0) {
    throw new Error(
      'Could not parse Claude share page. Claude may have updated their page structure.'
    )
  }

  return pagesFromTurns(turns)
}

function extractFromJson(data: unknown): Page[] {
  if (!data || typeof data !== 'object') return []

  const str = JSON.stringify(data)
  if (!str.includes('"human"') && !str.includes('"user"')) return []

  const turns: Turn[] = []

  // Look for arrays of {role, content} or {sender, text} patterns
  JSON.stringify(data, (_, value) => {
    if (Array.isArray(value)) {
      const valid = value.every(
        (item): item is { role?: string; sender?: string; content?: unknown; text?: unknown } =>
          item && typeof item === 'object' && ('role' in item || 'sender' in item)
      )
      if (valid && value.length >= 2) {
        for (const item of value) {
          const role = (item.role ?? item.sender ?? '').toString().toLowerCase()
          const rawText = item.content ?? item.text ?? ''
          const text = typeof rawText === 'string'
            ? rawText
            : Array.isArray(rawText)
              ? rawText.filter((p): p is string => typeof p === 'string').join('')
              : ''
          if (!text.trim()) continue
          if (role === 'human' || role === 'user') turns.push({ role: 'user', text: text.trim() })
          else if (role === 'assistant' || role === 'ai') turns.push({ role: 'ai', text: text.trim() })
        }
      }
    }
    return value
  })

  return pagesFromTurns(turns)
}

function pagesFromTurns(turns: Turn[]): Page[] {
  const pages: Page[] = []
  let i = 0
  while (i < turns.length && turns[i].role === 'ai') i++

  while (i < turns.length) {
    const user = turns[i]
    if (user.role !== 'user') { i++; continue }
    const ai = turns[i + 1]
    if (!ai || ai.role !== 'ai') { i++; continue }

    pages.push({
      id: `page-${pages.length}`,
      title: user.text,
      body: ai.text,
      index: pages.length,
    })
    i += 2
  }
  return pages
}
