import { useState, useEffect } from 'react'
import { Book } from './types'
import { db } from './db'
import { migrateFromLocalStorage } from './utils/migrate'
import { useIsMobile } from './hooks/useIsMobile'
import LibraryView from './components/LibraryView'
import BookView from './components/BookView'
import MobileNotice from './components/MobileNotice'
import PrivacyPage from './components/PrivacyPage'
import HowToImportPage from './components/HowToImportPage'

// Hash-based router: '#/' = library, '#/book/:id' = book view,
// '#/privacy' = privacy page, '#/how-to-import' = import guide.
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
  const isMobile = useIsMobile()

  useEffect(() => {
    void migrateFromLocalStorage().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!hash.startsWith('#/book/')) { setBook(null); return }
    const bookId = decodeURIComponent(hash.slice('#/book/'.length))
    db.books.get(bookId).then(async record => {
      if (!record) { window.location.hash = '#/'; return }
      const [stickers, comments] = await Promise.all([
        db.stickers.where('bookId').equals(bookId).toArray(),
        db.comments.where('bookId').equals(bookId).toArray(),
      ])
      setBook({ ...record, stickers, comments })
    })
  }, [hash, ready])

  if (isMobile) return <MobileNotice />

  if (hash === '#/privacy') {
    return <PrivacyPage onBack={() => { window.location.hash = '#/' }} />
  }

  if (hash === '#/how-to-import') {
    return <HowToImportPage onBack={() => { window.location.hash = '#/' }} />
  }

  if (!ready) return null

  if (hash.startsWith('#/book/') && book) {
    return <BookView book={book} onBack={() => { window.location.hash = '#/' }} />
  }
  if (hash.startsWith('#/book/')) return null  // loading book

  return <LibraryView />
}
