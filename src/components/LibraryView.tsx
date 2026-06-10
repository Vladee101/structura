import { useState, useEffect, useCallback } from 'react'
import { db } from '../db'
import type { BookRecord } from '../db'
import ImportPanel from './ImportPanel'

const SOURCE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  paste: 'Paste',
}

export default function LibraryView() {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  const loadBooks = useCallback(() => {
    void db.books.orderBy('importedAt').reverse().toArray().then(setBooks)
  }, [])

  useEffect(loadBooks, [loadBooks])

  const deleteBook = async (id: string) => {
    if (!window.confirm('Delete this book and all its stickers?')) return
    await db.transaction('rw', db.books, db.stickers, async () => {
      await db.books.delete(id)
      await db.stickers.where('bookId').equals(id).delete()
    })
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  const openBook = (id: string) => {
    window.location.hash = `#/book/${encodeURIComponent(id)}`
  }

  const filtered = search
    ? books.filter(b => b.title.toLowerCase().includes(search.toLowerCase()))
    : books

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
          <button type="button" className="library-import-btn" onClick={() => setShowImport(true)}>
            + Import
          </button>
        </div>
      </header>

      <main className="library-main">
        {books.length === 0 ? (
          <div className="library-empty">
            <p className="library-empty-title">Your library is empty.</p>
            <p className="library-empty-sub">
              Import a ChatGPT or Claude export, or paste a conversation, to get started.
            </p>
            <button type="button" className="import-btn" onClick={() => setShowImport(true)}>
              Import Conversations
            </button>
          </div>
        ) : (
          <div className="book-shelf">
            {filtered.map(book => (
              <button
                key={book.id}
                type="button"
                className="book-card"
                onClick={() => openBook(book.id)}
              >
                <div className="book-card-source">{SOURCE_LABELS[book.source] ?? book.source}</div>
                <div className="book-card-title">{book.title}</div>
                <div className="book-card-footer">
                  <span className="book-card-meta">
                    {book.pages.length} ch · {new Date(book.importedAt).toLocaleDateString()}
                  </span>
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
              </button>
            ))}
          </div>
        )}
      </main>

      {showImport && (
        <ImportPanel
          onImported={() => { loadBooks(); setShowImport(false) }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
