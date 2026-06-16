import { useRef, useState, useCallback, useEffect } from 'react'
import { Page } from '../types'
import StickerPopup from './StickerPopup'

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M9 1L11 3L3.5 10.5H1.5V8.5L9 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M7.5 2.5L9.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

interface Popup {
  x: number
  y: number
  text: string
}

interface StickerPartial {
  text: string
  pageIndex: number
  color: string
}

interface Props {
  page: Page
  pageIndex: number
  pageCount: number
  stickerCount: number
  onAddSticker: (sticker: StickerPartial) => void
  onShowStickers: () => void
  onExportBook: () => void
  onExportStickers: () => void
  onNext: () => void
  onPrev: () => void
  onBack: () => void
  onRenameChapter: (newTitle: string) => void
  nextColor: string
}

export default function ContentPanel({
  page,
  pageIndex,
  pageCount,
  stickerCount,
  onAddSticker,
  onShowStickers,
  onExportBook,
  onExportStickers,
  onNext,
  onPrev,
  onBack,
  onRenameChapter,
  nextColor,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setPopup(null)
    setEditingTitle(false)
  }, [pageIndex])

  const startRename = () => {
    setEditValue(page.question)
    setEditingTitle(true)
  }

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== page.question) onRenameChapter(trimmed)
    setEditingTitle(false)
  }, [editValue, page.question, onRenameChapter])

  const cancelRename = () => setEditingTitle(false)

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
    onAddSticker({ text: popup.text, pageIndex, color: nextColor })
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
        <button type="button" className="topbar-back" onClick={onBack}>
          ← Library
        </button>
        <div className="topbar-nav">
          <button type="button" className="nav-btn" onClick={onPrev} disabled={pageIndex === 0}>
            ‹ Prev
          </button>
          <span className="nav-counter">
            {pageIndex + 1} / {pageCount}
          </span>
          <button type="button" className="nav-btn" onClick={onNext} disabled={pageIndex === pageCount - 1}>
            Next ›
          </button>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-export-btn"
            onClick={onExportBook}
            title="Download book as Markdown"
          >
            ↓ Book
          </button>
          <button
            type="button"
            className="topbar-export-btn"
            onClick={onExportStickers}
            disabled={stickerCount === 0}
            title={stickerCount === 0 ? 'No stickers to export' : 'Download stickers as Markdown'}
          >
            ↓ Highlights
          </button>
          <button type="button" className="topbar-stickers" onClick={onShowStickers}>
            Stickers {stickerCount > 0 && <span className="sticker-badge">{stickerCount}</span>}
          </button>
        </div>
      </div>

      <div className="content-body" ref={scrollRef} onMouseUp={handleMouseUp}>
        <div className="content-question-wrap">
          {editingTitle ? (
            <textarea
              className="content-question-input"
              aria-label="Chapter title"
              value={editValue}
              autoFocus
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitRename() }
              }}
            />
          ) : (
            <div className="content-question">{page.question}</div>
          )}
          {!editingTitle && (
            <button
              type="button"
              className="content-question-rename"
              onClick={startRename}
              title="Rename chapter"
              aria-label="Rename chapter"
            >
              <PencilIcon />
            </button>
          )}
        </div>
        <div className="content-answer" ref={bodyRef}>
          {renderBody(page.answer)}
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
