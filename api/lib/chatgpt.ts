export interface Page {
  id: string
  title: string
  body: string
  index: number
}

interface ConversationItem {
  message?: {
    author?: { role?: string }
    content?: {
      content_type?: string
      parts?: unknown[]
    }
  }
}

// Extract text from a content parts array (handles text + multimodal)
function extractText(parts: unknown[]): string {
  return parts
    .map(p => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object' && 'text' in (p as object))
        return (p as { text: string }).text
      return ''
    })
    .join('')
    .trim()
}

// Walk a nested object to find an array by key name
function findKey(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findKey(item, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  const record = obj as Record<string, unknown>
  if (key in record) return record[key]
  for (const v of Object.values(record)) {
    const found = findKey(v, key)
    if (found !== undefined) return found
  }
  return undefined
}

export function parseChatGPT(html: string): Page[] {
  // Extract __NEXT_DATA__ JSON blob
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('Could not find __NEXT_DATA__ in ChatGPT page')

  let data: unknown
  try {
    data = JSON.parse(match[1])
  } catch {
    throw new Error('Failed to parse __NEXT_DATA__ JSON')
  }

  // Find linear_conversation anywhere in the tree
  const linear = findKey(data, 'linear_conversation') as ConversationItem[] | undefined
  if (!Array.isArray(linear) || linear.length === 0) {
    throw new Error('No conversation found in ChatGPT page')
  }

  // Filter to user + assistant turns with real content
  const turns = linear
    .filter(item => {
      const role = item.message?.author?.role
      return role === 'user' || role === 'assistant'
    })
    .map(item => ({
      role: item.message!.author!.role as 'user' | 'assistant',
      text: extractText(item.message?.content?.parts ?? []),
    }))
    .filter(t => t.text.length > 0)

  // Pair user + assistant into pages
  const pages: Page[] = []
  let i = 0
  while (i < turns.length && turns[i].role === 'assistant') i++ // skip leading AI

  while (i < turns.length) {
    const user = turns[i]
    if (user.role !== 'user') { i++; continue }
    const ai = turns[i + 1]
    if (!ai || ai.role !== 'assistant') { i++; continue }

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
