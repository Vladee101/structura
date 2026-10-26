import { useState } from 'react'
import type { Comment } from '../types'

interface Props {
  comment: Comment
  flash: boolean
  onUpdate: (id: string, text: string) => void
  onRemove: (id: string) => void
  onShowPassage: (id: string) => void
}

const QUOTE_MAX = 120

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CommentCard({ comment, flash, onUpdate, onRemove, onShowPassage }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)

  const quote = comment.quote.length > QUOTE_MAX
    ? comment.quote.slice(0, QUOTE_MAX).trimEnd() + '…'
    : comment.quote

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== comment.text) onUpdate(comment.id, trimmed)
    setEditing(false)
  }

  return (
    <div id={`comment-${comment.id}`} className={`comment-card${flash ? ' comment-card--flash' : ''}`}>
      <button type="button" className="comment-card-quote" onClick={() => onShowPassage(comment.id)} title="Show passage">
        “{quote}”
      </button>
      {editing ? (
        <>
          <textarea
            className="comment-composer-input"
            aria-label="Edit comment"
            value={draft}
            autoFocus
            rows={3}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); setDraft(comment.text); setEditing(false) }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
            }}
          />
          <div className="comment-composer-actions">
            <button type="button" className="comment-btn-secondary" onClick={() => { setDraft(comment.text); setEditing(false) }}>
              Cancel
            </button>
            <button type="button" className="comment-btn" onClick={commit} disabled={!draft.trim()}>Save</button>
          </div>
        </>
      ) : (
        <p className="comment-card-text">{comment.text}</p>
      )}
      {!editing && (
        <div className="comment-card-meta">
          <span>{formatDate(comment.updatedAt)}{comment.updatedAt !== comment.createdAt && ' · edited'}</span>
          <span className="comment-card-actions">
            <button type="button" onClick={() => { setDraft(comment.text); setEditing(true) }}>Edit</button>
            <button
              type="button"
              onClick={() => { if (window.confirm('Delete this comment?')) onRemove(comment.id) }}
            >
              Delete
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
