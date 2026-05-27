import { parseChatGPT } from './lib/chatgpt'
import { parseClaude } from './lib/claude'

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function detectPlatform(url: string): 'chatgpt' | 'claude' | null {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname === 'chatgpt.com' && pathname.startsWith('/share/')) return 'chatgpt'
    if (hostname === 'chat.openai.com' && pathname.startsWith('/share/')) return 'chatgpt'
    if (hostname === 'claude.ai' && pathname.startsWith('/share/')) return 'claude'
    return null
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const shareUrl = new URL(req.url).searchParams.get('url')

  if (!shareUrl) {
    return json({ error: 'Missing ?url= parameter' }, 400)
  }

  const platform = detectPlatform(shareUrl)
  if (!platform) {
    return json({
      error: 'Unsupported URL. Paste a share link from ChatGPT (chatgpt.com/share/…) or Claude (claude.ai/share/…).',
    }, 400)
  }

  let html: string
  try {
    const res = await fetch(shareUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      return json({ error: `Could not fetch share page (HTTP ${res.status}). Is the link public?` }, 502)
    }
    html = await res.text()
  } catch (e) {
    return json({ error: `Network error fetching share page: ${String(e)}` }, 502)
  }

  try {
    const pages =
      platform === 'chatgpt' ? parseChatGPT(html) : parseClaude(html)

    if (pages.length === 0) {
      return json({ error: 'Parsed the page but found no Q&A pairs.' }, 422)
    }

    return json({ pages, platform })
  } catch (e) {
    return json({ error: String(e) }, 422)
  }
}
