import { useState, useEffect } from 'react'
import { Book } from './types'
import { db } from './db'
import { migrateFromLocalStorage } from './utils/migrate'
import LibraryView from './components/LibraryView'
import BookView from './components/BookView'

// Hash-based router: '#/' = library, '#/book/:id' = book view.
// Two routes only — no external router dep needed.
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const [book, setBook] = useState<Book | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void migrateFromLocalStorage().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!hash.startsWith('#/book/')) { setBook(null); return }
    const bookId = decodeURIComponent(hash.slice('#/book/'.length))
    db.books.get(bookId).then(async record => {
      if (!record) { window.location.hash = '#/'; return }
      const stickers = await db.stickers.where('bookId').equals(bookId).toArray()
      setBook({ ...record, stickers })
    })
  }, [hash, ready])

  if (!ready) return null

  if (hash.startsWith('#/book/') && book) {
    return <BookView book={book} onBack={() => { window.location.hash = '#/' }} />
  }
  if (hash.startsWith('#/book/')) return null  // loading book

  return <LibraryView />
}
