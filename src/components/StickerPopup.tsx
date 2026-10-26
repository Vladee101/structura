import { useState } from 'react'

interface Props {
  x: number
  y: number
  /** Top edge for the comment box, just below the selection. */
  belowY: number
  quote: string
  composing: boolean
  canComment: boolean
  onMake: () => void
  onStartComment: () => void
  onSaveComment: (text: string) => void
  onDismiss: () => void
}

const BOX_WIDTH = 320

export default function StickerPopup({
  x, y, belowY, quote, composing, canComment, onMake, onStartComment, onSaveComment, onDismiss,
}: Props) {
  const [text, setText] = useState('')

  if (composing) {
    const margin = BOX_WIDTH / 2 + 12
    const left = Math.min(Math.max(x, margin), window.innerWidth - margin)
    const save = () => { if (text.trim()) onSaveComment(text.trim()) }
    return (
      <div className="comment-composer" style={{ left, top: belowY }}>
        <p className="comment-composer-quote">“{quote}”</p>
        <textarea
          className="comment-composer-input"
          aria-label="Comment"
          placeholder="Add a comment…"
          value={text}
          autoFocus
          rows={3}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onDismiss() }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
          }}
        />
        <div className="comment-composer-actions">
          <span className="comment-composer-hint">Enter to save · Shift+Enter for new line</span>
          <button type="button" className="comment-btn-secondary" onClick={onDismiss}>Cancel</button>
          <button type="button" className="comment-btn" onClick={save} disabled={!text.trim()}>Save</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="sticker-popup"
      style={{ left: x, top: y }}
      onMouseDown={e => e.preventDefault()}
    >
      <button className="sticker-popup-btn" onClick={onMake}>
        Make Sticker
      </button>
      {canComment && (
        <button className="sticker-popup-btn sticker-popup-btn--alt" onClick={onStartComment}>
          Comment
        </button>
      )}
      <button className="sticker-popup-dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  )
}
