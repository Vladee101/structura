import { useEffect, useRef, useState } from 'react'
import type { Shelf, ShelfMembership } from '../db'
import { nextShelfColor, shelvesForBook } from '../utils/shelves'

interface Props {
  bookId: string
  x: number
  y: number
  shelves: Shelf[]
  memberships: ShelfMembership[]
  onToggle: (shelfId: string, adding: boolean) => Promise<void>
  onCreateAndAdd: (name: string, color: string) => Promise<void>
  onClose: () => void
}

export default function ShelfPopover({
  bookId, x, y, shelves, memberships,
  onToggle, onCreateAndAdd, onClose,
}: Props) {
  const [newName, setNewName] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const newInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const memberShelfIds = new Set(shelvesForBook(memberships, bookId))

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus()
  }, [addingNew])

  // Position: appear to the left of the icon, above if near bottom
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    transform: 'translateX(-100%)',
    zIndex: 200,
  }

  const commitNew = async () => {
    const name = newName.trim()
    if (name) {
      const color = nextShelfColor(shelves.length)
      await onCreateAndAdd(name, color)
    }
    setNewName('')
    setAddingNew(false)
  }

  return (
    <div ref={containerRef} className="shelf-popover" style={style} role="dialog" aria-label="Add to shelf">
      <div className="shelf-popover-header">Add to shelf</div>

      {shelves.length === 0 && !addingNew && (
        <p className="shelf-popover-empty">No shelves yet.</p>
      )}

      {shelves.map(shelf => {
        const isMember = memberShelfIds.has(shelf.id)
        return (
          <label key={shelf.id} className="shelf-popover-item">
            <input
              type="checkbox"
              className="shelf-popover-check"
              checked={isMember}
              onChange={() => void onToggle(shelf.id, !isMember)}
            />
            <span className="shelf-popover-dot" style={{ background: shelf.color }} />
            <span className="shelf-popover-name">{shelf.name}</span>
          </label>
        )
      })}

      <div className="shelf-popover-new">
        {addingNew ? (
          <input
            ref={newInputRef}
            className="shelf-popover-new-input"
            aria-label="New shelf name"
            placeholder="Shelf name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={() => void commitNew()}
            onKeyDown={e => {
              if (e.key === 'Enter') void commitNew()
              if (e.key === 'Escape') { setNewName(''); setAddingNew(false) }
            }}
          />
        ) : (
          <button type="button" className="shelf-popover-add-btn" onClick={() => setAddingNew(true)}>
            + New shelf…
          </button>
        )}
      </div>
    </div>
  )
}
