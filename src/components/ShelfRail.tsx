import { useState, useRef, useEffect } from 'react'
import type { Shelf, ShelfMembership } from '../db'
import { nextShelfColor, shelfBookCount } from '../utils/shelves'

interface Props {
  shelves: Shelf[]
  memberships: ShelfMembership[]
  bookCount: number
  activeShelfId: string | null
  onSelectShelf: (id: string | null) => void
  onCreateShelf: (name: string, color: string) => Promise<void>
  onRenameShelf: (id: string, name: string) => Promise<void>
  onDeleteShelf: (id: string, name: string) => Promise<void>
}

export default function ShelfRail({
  shelves, memberships, bookCount,
  activeShelfId, onSelectShelf,
  onCreateShelf, onRenameShelf, onDeleteShelf,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newShelfOpen, setNewShelfOpen] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) editRef.current?.select()
  }, [editingId])

  useEffect(() => {
    if (newShelfOpen) newRef.current?.focus()
  }, [newShelfOpen])

  const startRename = (shelf: Shelf) => {
    setEditingId(shelf.id)
    setEditValue(shelf.name)
  }

  const commitRename = async () => {
    if (!editingId) return
    const trimmed = editValue.trim()
    if (trimmed) await onRenameShelf(editingId, trimmed)
    setEditingId(null)
  }

  const commitNew = async () => {
    const name = newShelfName.trim()
    if (name) {
      const color = nextShelfColor(shelves.length)
      await onCreateShelf(name, color)
    }
    setNewShelfName('')
    setNewShelfOpen(false)
  }

  return (
    <nav className="shelf-rail" aria-label="Shelves">
      {/* All Books */}
      <button
        type="button"
        className={`shelf-rail-item shelf-rail-item--all ${activeShelfId === null ? 'shelf-rail-item--active' : ''}`}
        onClick={() => onSelectShelf(null)}
      >
        <span className="shelf-rail-dot shelf-rail-dot--all" />
        <span className="shelf-rail-name">All Books</span>
        <span className="shelf-rail-count">{bookCount}</span>
      </button>

      <div className="shelf-rail-divider" />

      {/* Shelf list */}
      {shelves.map(shelf => (
        <div
          key={shelf.id}
          className={`shelf-rail-item ${activeShelfId === shelf.id ? 'shelf-rail-item--active' : ''}`}
          onClick={() => { if (editingId !== shelf.id) onSelectShelf(shelf.id) }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectShelf(shelf.id) }}
        >
          <span
            className="shelf-rail-dot"
            style={{ background: shelf.color }}
          />
          {editingId === shelf.id ? (
            <input
              ref={editRef}
              className="shelf-rail-edit"
              aria-label="Shelf name"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={() => void commitRename()}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') void commitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <span className="shelf-rail-name">{shelf.name}</span>
          )}
          <span className="shelf-rail-count">{shelfBookCount(memberships, shelf.id)}</span>

          {editingId !== shelf.id && (
            <span className="shelf-rail-actions" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="shelf-rail-btn"
                title="Rename shelf"
                aria-label="Rename shelf"
                onClick={() => startRename(shelf)}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M9 1L11 3L3.5 10.5H1.5V8.5L9 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M7.5 2.5L9.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                type="button"
                className="shelf-rail-btn shelf-rail-btn--delete"
                title="Delete shelf"
                aria-label="Delete shelf"
                onClick={() => void onDeleteShelf(shelf.id, shelf.name)}
              >
                ×
              </button>
            </span>
          )}
        </div>
      ))}

      {/* New shelf */}
      <div className="shelf-rail-new">
        {newShelfOpen ? (
          <input
            ref={newRef}
            className="shelf-rail-edit shelf-rail-new-input"
            aria-label="New shelf name"
            placeholder="Shelf name…"
            value={newShelfName}
            onChange={e => setNewShelfName(e.target.value)}
            onBlur={() => void commitNew()}
            onKeyDown={e => {
              if (e.key === 'Enter') void commitNew()
              if (e.key === 'Escape') { setNewShelfName(''); setNewShelfOpen(false) }
            }}
          />
        ) : (
          <button
            type="button"
            className="shelf-rail-add"
            onClick={() => setNewShelfOpen(true)}
          >
            + New shelf
          </button>
        )}
      </div>
    </nav>
  )
}
