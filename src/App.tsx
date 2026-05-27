import { useState, useEffect } from 'react'
import { Book } from './types'
import { saveBook, loadBook, clearBook } from './utils/storage'
import ImportScreen from './components/ImportScreen'
import BookView from './components/BookView'

export default function App() {
  const [book, setBook] = useState<Book | null>(null)

  useEffect(() => {
    const saved = loadBook()
    if (saved) setBook(saved)
  }, [])

  const handleBook = (b: Book) => {
    saveBook(b)
    setBook(b)
  }

  const handleBack = () => {
    const confirmed = book
      ? window.confirm('Leave this book? Your stickers are saved and will reload next time.')
      : true
    if (confirmed) {
      clearBook()
      setBook(null)
    }
  }

  if (book) {
    return <BookView book={book} onBack={handleBack} />
  }

  return <ImportScreen onBook={handleBook} />
}
