import { useRef, useState, useCallback, useEffect } from 'react'
import { Page, Sticker, STICKER_COLORS } from '../types'
import StickerPopup from './StickerPopup'

interface Popup {
  x: number
  y: number
  text: string
}

interface Props {
  page: Page
  pageCount: number
  stickerCount: number
  onAddSticker: (sticker: Omit<Sticker, 'id' | 'createdAt'>) => void
  onShowStickers: () => void
  onNext: () => void
  onPrev: () => void
  onBack: () => void
  nextColor: string
}

export default function ContentPanel({
  page,
  pageCount,
  stickerCount,
  onAddSticker,
  onShowStickers,
  onNext,
  onPrev,
  onBack,
  nextColor,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<Popup | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setPopup(null)
  }, [page.id])

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setPopup(null)
      return
    }
    const text = selection.toString().trim()
    if (!text || text.length < 3) {
      setPopup(null)
      return
    }
    if (!bodyRef.current?.contains(selection.anchorNode)) {
      setPopup(null)
      return
    }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setPopup({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 44,
      text,
    })
  }, [])

  const makeSticker = () => {
    if (!popup) return
    onAddSticker({
      text: popup.text,
      pageId: page.id,
      pageTitle: page.title,
      color: nextColor,
    })
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const renderBody = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('```')) return null
      if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>
      if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
      if (line.startsWith('# ')) return <h2 key={i}>{line.slice(2)}</h2>
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={i}>{renderInline(line.slice(2))}</li>
      }
      if (/^\d+\. /.test(line)) {
        return <li key={i}>{renderInline(line.replace(/^\d+\. /, ''))}</li>
      }
      if (line.trim() === '') return <br key={i} />
      return <p key={i}>{renderInline(line)}</p>
    })
  }

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>
      }
      return part
    })
  }

  return (
    <div className="content-panel">
      <div className="content-topbar">
        <button className="topbar-back" onClick={onBack}>
          ← New Book
        </button>
        <div className="topbar-nav">
          <button className="nav-btn" onClick={onPrev} disabled={page.index === 0}>
            ‹ Prev
          </button>
          <span className="nav-counter">
            {page.index + 1} / {pageCount}
          </span>
          <button className="nav-btn" onClick={onNext} disabled={page.index === pageCount - 1}>
            Next ›
          </button>
        </div>
        <button className="topbar-stickers" onClick={onShowStickers}>
          Stickers {stickerCount > 0 && <span className="sticker-badge">{stickerCount}</span>}
        </button>
      </div>

      <div className="content-body" ref={scrollRef} onMouseUp={handleMouseUp}>
        <div className="content-question">{page.title}</div>
        <div className="content-answer" ref={bodyRef}>
          {renderBody(page.body)}
        </div>
      </div>

      {popup && (
        <StickerPopup
          x={popup.x}
          y={popup.y}
          onMake={makeSticker}
          onDismiss={() => setPopup(null)}
        />
      )}
    </div>
  )
}
