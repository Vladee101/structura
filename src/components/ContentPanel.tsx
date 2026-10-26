import { useRef, useState, useCallback, useEffect } from 'react'
import { Page, Comment, Attachment } from '../types'
import StickerPopup from './StickerPopup'
import CommentCard from './CommentCard'
import AttachmentView from './AttachmentView'
import { blockForLine, isHiddenLine, tokenizeBlock, highlightForLine, segmentTokens } from '../utils/comments'
import type { Highlight, Segment } from '../utils/comments'

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M9 1L11 3L3.5 10.5H1.5V8.5L9 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M7.5 2.5L9.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

export interface CommentAnchor {
  startLine: number
  startOffset: number
  endLine: number
  endOffset: number
  quote: string
}

interface Popup {
  x: number
  y: number
  belowY: number
  text: string
  anchor: CommentAnchor | null
  composing: boolean
}

interface StickerPartial {
  text: string
  pageIndex: number
  color: string
}

/** Character offset of (node, offset) within block's displayed text. */
function offsetWithin(block: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange()
  r.selectNodeContents(block)
  r.setEnd(node, offset)
  return r.toString().length
}

/** Maps a DOM selection onto answer lines. Comment cards and gaps between blocks are ignored. */
function anchorFromRange(range: Range, root: HTMLElement): CommentAnchor | null {
  const parts: { line: number; start: number; end: number; text: string }[] = []
  for (const block of root.querySelectorAll<HTMLElement>('[data-line]')) {
    if (!range.intersectsNode(block)) continue
    const full = block.textContent ?? ''
    let start = block.contains(range.startContainer) ? offsetWithin(block, range.startContainer, range.startOffset) : 0
    let end = block.contains(range.endContainer) ? offsetWithin(block, range.endContainer, range.endOffset) : full.length
    while (start < end && /\s/.test(full[start])) start++
    while (end > start && /\s/.test(full[end - 1])) end--
    if (end > start) parts.push({ line: Number(block.dataset.line), start, end, text: full.slice(start, end) })
  }
  if (parts.length === 0) return null
  const first = parts[0]
  const last = parts[parts.length - 1]
  return {
    startLine: first.line,
    startOffset: first.start,
    endLine: last.line,
    endOffset: last.end,
    quote: parts.map(p => p.text).join(' '),
  }
}

interface Props {
  page: Page
  pageIndex: number
  pageCount: number
  stickerCount: number
  comments: Comment[]
  commentCount: number
  onAddComment: (anchor: CommentAnchor, text: string) => void
  onUpdateComment: (id: string, text: string) => void
  onRemoveComment: (id: string) => void
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
  comments,
  commentCount,
  onAddComment,
  onUpdateComment,
  onRemoveComment,
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
  const [showComments, setShowComments] = useState(true)
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setPopup(null)
    setEditingTitle(false)
  }, [pageIndex])

  useEffect(() => {
    if (!flashId) return
    const t = window.setTimeout(() => setFlashId(null), 1200)
    return () => window.clearTimeout(t)
  }, [flashId])

  const showCard = (id: string) => {
    document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setFlashId(id)
  }

  const showPassage = (id: string) => {
    bodyRef.current
      ?.querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(id)
  }

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
    // An open comment box stays put until saved or cancelled, so a stray click can't lose the draft.
    if (popup?.composing) return
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
    const root = bodyRef.current
    if (!root?.contains(selection.anchorNode)) {
      setPopup(null)
      return
    }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setPopup({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 44,
      belowY: rect.bottom + 8,
      text,
      anchor: anchorFromRange(range, root),
      composing: false,
    })
  }, [popup?.composing])

  const makeSticker = () => {
    if (!popup) return
    onAddSticker({ text: popup.text, pageIndex, color: nextColor })
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const saveComment = (text: string) => {
    if (!popup?.anchor) return
    onAddComment(popup.anchor, text)
    setShowComments(true)
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const renderSegments = (segments: Segment[]): React.ReactNode =>
    segments.map((seg, i) => {
      const inner = seg.kind === 'strong' ? <strong>{seg.text}</strong>
        : seg.kind === 'code' ? <code>{seg.text}</code>
        : seg.text
      if (!seg.highlightId) return <span key={i}>{inner}</span>
      const id = seg.highlightId
      return (
        <mark
          key={i}
          className={`comment-mark${flashId === id ? ' comment-mark--flash' : ''}`}
          data-comment-id={id}
          onClick={() => { if (window.getSelection()?.isCollapsed) showCard(id) }}
        >
          {inner}
        </mark>
      )
    })

  const renderBody = (text: string) => {
    const visible = showComments ? comments : []
    const attachmentsAt = new Map<number, Attachment[]>()
    for (const a of page.attachments ?? []) attachmentsAt.set(a.line, [...(attachmentsAt.get(a.line) ?? []), a])
    // Line indices are kept even for hidden lines, since comment anchors refer to them.
    let gapOpen = true
    return text.split('\n').map((line, i) => {
      const attached = attachmentsAt.get(i)
      const block = blockForLine(line)
      if (!block && !attached) {
        if (isHiddenLine(line) || gapOpen) return null
        gapOpen = true
        return <br key={i} />
      }
      gapOpen = false
      let lineEl: React.ReactNode = null
      if (block) {
        const tokens = tokenizeBlock(block)
        const length = tokens.reduce((n, t) => n + t.text.length, 0)
        const highlights = visible
          .map(c => highlightForLine(c, i, length))
          .filter((h): h is Highlight => h !== null)
        const Tag = block.tag
        lineEl = <Tag data-line={i}>{renderSegments(segmentTokens(tokens, highlights))}</Tag>
      }
      const cards = visible.filter(c => c.endLine === i)
      return (
        <div key={i} className="content-block">
          {lineEl}
          {attached?.map((a, j) => <AttachmentView key={j} attachment={a} />)}
          {cards.map(c => (
            <CommentCard
              key={c.id}
              comment={c}
              flash={flashId === c.id}
              onUpdate={onUpdateComment}
              onRemove={onRemoveComment}
              onShowPassage={showPassage}
            />
          ))}
        </div>
      )
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
          <button
            type="button"
            className={`topbar-stickers${showComments ? '' : ' topbar-comments--off'}`}
            onClick={() => setShowComments(v => !v)}
            disabled={commentCount === 0}
            aria-pressed={showComments}
            title={commentCount === 0 ? 'Highlight text and choose Comment to add one'
              : showComments ? 'Hide comments' : 'Show comments'}
          >
            Comments {commentCount > 0 && <span className="sticker-badge">{commentCount}</span>}
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
          belowY={popup.belowY}
          quote={popup.anchor?.quote ?? popup.text}
          composing={popup.composing}
          canComment={popup.anchor !== null}
          onMake={makeSticker}
          onStartComment={() => setPopup(p => p && { ...p, composing: true })}
          onSaveComment={saveComment}
          onDismiss={() => setPopup(null)}
        />
      )}
    </div>
  )
}
