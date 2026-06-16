import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'

// Survive LibraryView unmount so scroll + shelf filter are restored on return from BookView.
let savedLibraryScrollTop = 0
let savedLibraryShelfId: string | null = null
import { db, addBookToShelf, removeBookFromShelf } from '../db'
import type { BookRecord, Shelf, ShelfMembership } from '../db'
import type { Book } from '../types'
import { booksOnShelf, removeShelfMemberships, removeBookMemberships } from '../utils/shelves'
import { exportAllStickers } from '../utils/markdownExport'
import ImportPanel from './ImportPanel'
import ShelfRail from './ShelfRail'
import ShelfPopover from './ShelfPopover'

const SOURCE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  paste: 'Paste',
  deepseek: 'DeepSeek',
}

// ── Icon ──────────────────────────────────────────────────────────────────────

const PencilIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M9 1L11 3L3.5 10.5H1.5V8.5L9 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M7.5 2.5L9.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const ShelfIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1" y="9" width="10" height="1.5" rx="0.5" fill="currentColor"/>
    <rect x="2" y="3" width="1.2" height="6" rx="0.4" fill="currentColor"/>
    <rect x="8.8" y="3" width="1.2" height="6" rx="0.4" fill="currentColor"/>
    <rect x="5.4" y="2" width="1.2" height="7" rx="0.4" fill="currentColor"/>
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

export default function LibraryView() {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [memberships, setMemberships] = useState<ShelfMembership[]>([])
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  // Consume any shelf saved before opening a book; clear immediately so
  // subsequent fresh mounts don't inherit a stale value.
  const [activeShelfId, setActiveShelfId] = useState<string | null>(() => {
    const v = savedLibraryShelfId
    savedLibraryShelfId = null
    return v
  })
  // Tracks whether the first shelves load from DB has completed.
  const shelvesLoadedRef = useRef(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [shelfPopover, setShelfPopover] = useState<{ bookId: string; x: number; y: number } | null>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadBooks = useCallback(() => {
    void db.books.orderBy('importedAt').reverse().toArray().then(setBooks)
  }, [])

  const loadShelves = useCallback(() => {
    void db.shelves.orderBy('createdAt').toArray().then(data => {
      setShelves(data)
      shelvesLoadedRef.current = true
    })
  }, [])

  const loadMemberships = useCallback(() => {
    void db.shelfMemberships.toArray().then(setMemberships)
  }, [])

  useEffect(loadBooks, [loadBooks])
  useEffect(loadShelves, [loadShelves])
  useEffect(loadMemberships, [loadMemberships])

  // If the restored shelf was deleted while the user was in a book, fall back to
  // All Books. Guard with shelvesLoadedRef so we don't clear prematurely while
  // the first DB load is still in flight (shelves starts as []).
  useEffect(() => {
    if (!shelvesLoadedRef.current) return
    if (activeShelfId !== null && !shelves.some(s => s.id === activeShelfId)) {
      setActiveShelfId(null)
    }
  }, [shelves, activeShelfId])

  // ── Book mutations ────────────────────────────────────────────────────────────

  const openBook = (id: string) => {
    savedLibraryScrollTop = mainRef.current?.scrollTop ?? 0
    savedLibraryShelfId = activeShelfId
    window.location.hash = `#/book/${encodeURIComponent(id)}`
  }

  const deleteBook = async (id: string) => {
    if (!window.confirm('Delete this book and all its stickers?')) return
    await db.transaction('rw', db.books, db.stickers, db.shelfMemberships, async () => {
      await db.books.delete(id)
      await db.stickers.where('bookId').equals(id).delete()
      await db.shelfMemberships.where('bookId').equals(id).delete()
    })
    setBooks(prev => prev.filter(b => b.id !== id))
    setMemberships(prev => removeBookMemberships(prev, id))
  }

  // ── Book title rename ─────────────────────────────────────────────────────────

  const startEdit = (e: React.MouseEvent, book: BookRecord) => {
    e.stopPropagation()
    setEditingId(book.id)
    setEditValue(book.title)
    setTimeout(() => editRef.current?.select(), 0)
  }

  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== books.find(b => b.id === editingId)?.title) {
      await db.books.update(editingId, { title: trimmed })
      setBooks(prev => prev.map(b => b.id === editingId ? { ...b, title: trimmed } : b))
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  // ── Shelf mutations ────────────────────────────────────────────────────────────

  const createShelf = async (name: string, color: string) => {
    const shelf: Shelf = {
      id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color,
      createdAt: Date.now(),
    }
    await db.shelves.add(shelf)
    setShelves(prev => [...prev, shelf])
  }

  const renameShelf = async (id: string, name: string) => {
    await db.shelves.update(id, { name })
    setShelves(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  const deleteShelf = async (id: string, name: string) => {
    if (!window.confirm(`Delete shelf "${name}"?\n\nBooks in this shelf will NOT be deleted — only the shelf itself is removed.`)) return
    await db.transaction('rw', db.shelves, db.shelfMemberships, async () => {
      await db.shelves.delete(id)
      await db.shelfMemberships.where('shelfId').equals(id).delete()
    })
    setShelves(prev => prev.filter(s => s.id !== id))
    setMemberships(prev => removeShelfMemberships(prev, id))
    if (activeShelfId === id) setActiveShelfId(null)
  }

  // ── Shelf membership mutations ─────────────────────────────────────────────────

  const toggleMembership = async (shelfId: string, adding: boolean) => {
    if (!shelfPopover) return
    const { bookId } = shelfPopover
    if (adding) {
      await addBookToShelf(bookId, shelfId)
      const existing = memberships.some(m => m.shelfId === shelfId && m.bookId === bookId)
      if (!existing) {
        setMemberships(prev => [...prev, {
          id: `sm-${Date.now()}`,
          shelfId,
          bookId,
          addedAt: Date.now(),
        }])
      }
    } else {
      await removeBookFromShelf(bookId, shelfId)
      setMemberships(prev => prev.filter(m => !(m.shelfId === shelfId && m.bookId === bookId)))
    }
  }

  const createShelfAndAdd = async (name: string, color: string) => {
    if (!shelfPopover) return
    const { bookId } = shelfPopover
    const shelf: Shelf = {
      id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color,
      createdAt: Date.now(),
    }
    await db.shelves.add(shelf)
    await addBookToShelf(bookId, shelf.id)
    setShelves(prev => [...prev, shelf])
    setMemberships(prev => [...prev, {
      id: `sm-${Date.now()}`,
      shelfId: shelf.id,
      bookId,
      addedAt: Date.now(),
    }])
  }

  // ── Derived / filtered list ────────────────────────────────────────────────────

  const baseBooks = activeShelfId !== null
    ? booksOnShelf(books, memberships, activeShelfId)
    : books

  const filtered = search
    ? baseBooks.filter(b => b.title.toLowerCase().includes(search.toLowerCase()))
    : baseBooks

  const activeShelf = shelves.find(s => s.id === activeShelfId)

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExportHighlights = async () => {
    if (baseBooks.length === 0) return
    const bookIds = baseBooks.map(b => b.id)
    const stickers = await db.stickers.where('bookId').anyOf(bookIds).toArray()
    const fullBooks = baseBooks.map((b): Book => ({
      id: b.id,
      title: b.title,
      createdAt: b.createdAt,
      importedAt: b.importedAt,
      source: b.source,
      pages: b.pages,
      stickers: stickers.filter(s => s.bookId === b.id),
    }))
    exportAllStickers(fullBooks, activeShelf?.name)
  }

  // Restore scroll after returning from BookView. Runs synchronously after the
  // DOM reflects the full book list, so scrollTop is not clamped by missing height.
  // Only fires when there is a pending position (savedLibraryScrollTop > 0) AND
  // the list has content; the browser clamps any over-large value automatically.
  useLayoutEffect(() => {
    if (savedLibraryScrollTop > 0 && filtered.length > 0 && mainRef.current) {
      mainRef.current.scrollTop = savedLibraryScrollTop
      savedLibraryScrollTop = 0
    }
  }, [filtered])

  // Switching shelf filters resets scroll to top (different list context).
  const selectShelf = (id: string | null) => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    setActiveShelfId(id)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="library-view">
      <header className="library-header">
        <div className="library-brand">
          <span className="logo-word">Structura</span>
          <span className="logo-tagline">AI gives answers. Structura gives structure.</span>
        </div>
        <div className="library-controls">
          {books.length > 0 && (
            <input
              className="library-search"
              type="search"
              placeholder="Search books…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          {baseBooks.length > 0 && (
            <button
              type="button"
              className="library-export-btn"
              onClick={() => void handleExportHighlights()}
              title={activeShelf ? `Download ${activeShelf.name} highlights as Markdown` : 'Download all highlights as Markdown'}
            >
              ↓ Highlights
            </button>
          )}
          <button type="button" className="library-import-btn" onClick={() => setShowImport(true)}>
            + Import
          </button>
        </div>
      </header>

      <div className="library-body">
        <ShelfRail
          shelves={shelves}
          memberships={memberships}
          bookCount={books.length}
          activeShelfId={activeShelfId}
          onSelectShelf={selectShelf}
          onCreateShelf={createShelf}
          onRenameShelf={renameShelf}
          onDeleteShelf={deleteShelf}
        />

        <main ref={mainRef} className="library-main">
          {books.length === 0 ? (
            <div className="library-empty">
              <p className="library-empty-title">Your library is empty.</p>
              <p className="library-empty-sub">
                Import a ChatGPT, Claude, or DeepSeek export, or paste a conversation, to get started.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="library-empty">
              {activeShelfId && !search ? (
                <>
                  <p className="library-empty-title">This shelf is empty.</p>
                  <p className="library-empty-sub">
                    Add a book here from your library using the{' '}
                    <ShelfIcon /> shelf icon on any book card.
                  </p>
                </>
              ) : (
                <>
                  <p className="library-empty-title">No books match "{search}".</p>
                  <p className="library-empty-sub">Try a different search term{activeShelf ? ` or switch to All Books` : ''}.</p>
                </>
              )}
            </div>
          ) : (
            <div className="book-shelf">
              {filtered.map(book => (
                <div
                  key={book.id}
                  className="book-card"
                  tabIndex={editingId === book.id ? -1 : 0}
                  onClick={() => editingId !== book.id && openBook(book.id)}
                  onKeyDown={e => {
                    if (editingId === book.id) return
                    if (e.key === 'Enter' || e.key === ' ') openBook(book.id)
                  }}
                >
                  <div className="book-card-source">{SOURCE_LABELS[book.source] ?? book.source}</div>

                  {editingId === book.id ? (
                    <input
                      ref={editRef}
                      className="book-title-input"
                      aria-label="Book title"
                      value={editValue}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => void commitEdit()}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') void commitEdit()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                    />
                  ) : (
                    <div className="book-card-title">{book.title}</div>
                  )}

                  <div className="book-card-footer">
                    <span className="book-card-meta">
                      {book.pages.length} ch · {new Date(book.importedAt).toLocaleDateString()}
                    </span>
                    <div className="book-card-actions">
                      <button
                        type="button"
                        className="book-card-shelf"
                        onClick={e => {
                          e.stopPropagation()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setShelfPopover({ bookId: book.id, x: rect.right, y: rect.top })
                        }}
                        title="Add to shelf"
                        aria-label="Add to shelf"
                      >
                        <ShelfIcon />
                      </button>
                      <button
                        type="button"
                        className="book-card-rename"
                        onClick={e => startEdit(e, book)}
                        title="Rename"
                        aria-label="Rename book"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="book-card-delete"
                        onClick={e => { e.stopPropagation(); void deleteBook(book.id) }}
                        title="Delete"
                        aria-label="Delete book"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {shelfPopover && (
        <ShelfPopover
          bookId={shelfPopover.bookId}
          x={shelfPopover.x}
          y={shelfPopover.y}
          shelves={shelves}
          memberships={memberships}
          onToggle={toggleMembership}
          onCreateAndAdd={createShelfAndAdd}
          onClose={() => setShelfPopover(null)}
        />
      )}

      {showImport && (
        <ImportPanel
          onImported={() => { loadBooks(); setShowImport(false) }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
