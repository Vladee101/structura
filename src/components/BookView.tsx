import { useState, useCallback } from 'react'
import { Book, Sticker, STICKER_COLORS } from '../types'
import { db } from '../db'
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

  const addSticker = useCallback((partial: { text: string; pageIndex: number; color: string }) => {
    const sticker: Sticker = {
      ...partial,
      id: `sticker-${Date.now()}`,
      bookId: book.id,
      createdAt: Date.now(),
    }
    setBook(prev => ({ ...prev, stickers: [...prev.stickers, sticker] }))
    void db.stickers.add(sticker)
  }, [book.id])

  const removeSticker = useCallback((id: string) => {
    setBook(prev => ({ ...prev, stickers: prev.stickers.filter(s => s.id !== id) }))
    void db.stickers.delete(id)
  }, [])

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
        pageIndex={activeIndex}
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
          pages={book.pages}
          onRemove={removeSticker}
          onClose={() => setShowStickers(false)}
        />
      )}
    </div>
  )
}
