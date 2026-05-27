import { useState, useCallback } from 'react'
import { Book, Sticker, STICKER_COLORS } from '../types'
import { saveBook } from '../utils/storage'
import RolodexSpine from './RolodexSpine'
import ContentPanel from './ContentPanel'
import StickerCollection from './StickerCollection'

interface Props {
  book: Book
  onBack: () => void
}

export default function BookView({ book: initialBook, onBack }: Props) {
  const [book, setBook] = useState<Book>(initialBook)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showStickers, setShowStickers] = useState(false)

  const updateBook = (updated: Book) => {
    setBook(updated)
    saveBook(updated)
  }

  const addSticker = useCallback((partial: Omit<Sticker, 'id' | 'createdAt'>) => {
    const sticker: Sticker = {
      ...partial,
      id: `sticker-${Date.now()}`,
      createdAt: Date.now(),
    }
    updateBook({ ...book, stickers: [...book.stickers, sticker] })
  }, [book])

  const removeSticker = useCallback((id: string) => {
    updateBook({ ...book, stickers: book.stickers.filter(s => s.id !== id) })
  }, [book])

  const nextColor = STICKER_COLORS[book.stickers.length % STICKER_COLORS.length]
  const activePage = book.pages[activeIndex]

  return (
    <div className="book-view">
      <RolodexSpine
        pages={book.pages}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />

      <ContentPanel
        page={activePage}
        pageCount={book.pages.length}
        stickerCount={book.stickers.length}
        onAddSticker={addSticker}
        onShowStickers={() => setShowStickers(true)}
        onNext={() => setActiveIndex(i => Math.min(i + 1, book.pages.length - 1))}
        onPrev={() => setActiveIndex(i => Math.max(i - 1, 0))}
        onBack={onBack}
        nextColor={nextColor}
      />

      {showStickers && (
        <StickerCollection
          stickers={book.stickers}
          onRemove={removeSticker}
          onClose={() => setShowStickers(false)}
        />
      )}
    </div>
  )
}
