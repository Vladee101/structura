import { useState, useCallback } from 'react'
import { Book, Sticker, STICKER_COLORS } from '../types'
import { db } from '../db'
import { exportBook, exportBookStickers } from '../utils/markdownExport'
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

  const renameChapter = useCallback((newTitle: string) => {
    const newPages = book.pages.map((p, i) => i === activeIndex ? { ...p, question: newTitle } : p)
    setBook(prev => ({ ...prev, pages: newPages }))
    void db.books.update(book.id, { pages: newPages })
  }, [book, activeIndex])

  const deleteChapter = useCallback(async (pageIndex: number) => {
    if (!window.confirm('Delete this chapter?')) return
    const newPages = book.pages.filter((_, i) => i !== pageIndex)
    const newStickers = book.stickers
      .filter(s => s.pageIndex !== pageIndex)
      .map(s => s.pageIndex > pageIndex ? { ...s, pageIndex: s.pageIndex - 1 } : s)
    setBook(prev => ({ ...prev, pages: newPages, stickers: newStickers }))
    setActiveIndex(prev => pageIndex < prev ? prev - 1 : Math.min(prev, newPages.length - 1))
    await db.transaction('rw', db.books, db.stickers, async () => {
      await db.books.update(book.id, { pages: newPages })
      await db.stickers.where('bookId').equals(book.id).filter(s => s.pageIndex === pageIndex).delete()
      const toRenumber = await db.stickers.where('bookId').equals(book.id).filter(s => s.pageIndex > pageIndex).toArray()
      for (const s of toRenumber) {
        await db.stickers.update(s.id, { pageIndex: s.pageIndex - 1 })
      }
    })
  }, [book])

  const nextColor = STICKER_COLORS[book.stickers.length % STICKER_COLORS.length]
  const activePage = book.pages[activeIndex]

  return (
    <div className="book-view">
      <RolodexSpine
        title={book.title}
        pages={book.pages}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        onDeleteChapter={deleteChapter}
      />

      <ContentPanel
        page={activePage}
        pageIndex={activeIndex}
        pageCount={book.pages.length}
        stickerCount={book.stickers.length}
        onAddSticker={addSticker}
        onShowStickers={() => setShowStickers(true)}
        onExportBook={() => exportBook(book)}
        onExportStickers={() => exportBookStickers(book)}
        onNext={() => setActiveIndex(i => Math.min(i + 1, book.pages.length - 1))}
        onPrev={() => setActiveIndex(i => Math.max(i - 1, 0))}
        onBack={onBack}
        onRenameChapter={renameChapter}
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
