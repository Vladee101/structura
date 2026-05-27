import { useState } from 'react'
import { parseConversation } from '../utils/parser'
import { Book } from '../types'

interface Props {
  onBook: (book: Book) => void
}

type Mode = 'url' | 'paste'

export default function ImportScreen({ onBook }: Props) {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const makeBook = (pages: ReturnType<typeof parseConversation>['pages']) => {
    const book: Book = {
      id: `book-${Date.now()}`,
      title: pages[0].title.slice(0, 60),
      pages,
      stickers: [],
      createdAt: Date.now(),
    }
    onBook(book)
  }

  const handleUrl = async () => {
    setError('')
    const trimmed = url.trim()
    if (!trimmed) { setError('Paste a share link first.'); return }

    setLoading(true)
    try {
      const res = await fetch(`/api/parse?url=${encodeURIComponent(trimmed)}`)
      const data = await res.json() as { pages?: unknown[]; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong.')
        return
      }
      makeBook(data.pages as ReturnType<typeof parseConversation>['pages'])
    } catch {
      setError('Network error — make sure the dev server is running with `vercel dev`.')
    } finally {
      setLoading(false)
    }
  }

  const handlePaste = () => {
    setError('')
    const trimmed = text.trim()
    if (trimmed.length < 20) { setError('Paste a conversation first.'); return }

    const { pages } = parseConversation(trimmed)
    if (pages.length === 0) {
      setError('No Q&A pairs found. Check that your conversation has alternating turns.')
      return
    }
    makeBook(pages)
  }

  return (
    <div className="import-screen">
      <div className="import-inner">

        <div className="import-logo">
          <span className="logo-word">Structura</span>
          <span className="logo-tagline">AI gives answers. Structura gives structure.</span>
        </div>

        <div className="import-card">
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'url' ? 'mode-tab--active' : ''}`}
              onClick={() => { setMode('url'); setError('') }}
            >
              Share Link
            </button>
            <button
              className={`mode-tab ${mode === 'paste' ? 'mode-tab--active' : ''}`}
              onClick={() => { setMode('paste'); setError('') }}
            >
              Paste Text
            </button>
          </div>

          {mode === 'url' ? (
            <>
              <p className="import-instruction">
                In ChatGPT or Claude, click <strong>Share</strong> → <strong>Copy link</strong>, then paste it below.
              </p>
              <input
                className="import-url"
                type="url"
                placeholder="https://chatgpt.com/share/…  or  https://claude.ai/share/…"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrl()}
                autoFocus
              />
              {error && <p className="import-error">{error}</p>}
              <button
                className="import-btn"
                onClick={handleUrl}
                disabled={loading || !url.trim()}
              >
                {loading ? 'Fetching…' : 'Open as Book'}
              </button>
              <p className="import-hint">Supported: ChatGPT · Claude</p>
            </>
          ) : (
            <>
              <p className="import-instruction">
                Copy your full conversation and paste it here. Include speaker labels like <strong>You</strong> / <strong>ChatGPT</strong>.
              </p>
              <textarea
                className="import-textarea"
                placeholder={"You\nWhat is X?\n\nChatGPT\nX is…"}
                value={text}
                onChange={e => setText(e.target.value)}
                spellCheck={false}
              />
              {error && <p className="import-error">{error}</p>}
              <button
                className="import-btn"
                onClick={handlePaste}
                disabled={text.trim().length < 20}
              >
                Open as Book
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
