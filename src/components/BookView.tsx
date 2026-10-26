import { useState, useCallback } from 'react'
import { Book, Comment, Sticker, STICKER_COLORS } from '../types'
import { db } from '../db'
import { renumberAfterPageDelete } from '../utils/comments'
import type { CommentAnchor } from './ContentPanel'
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

  const addComment = useCallback((anchor: CommentAnchor, text: string) => {
    const now = Date.now()
    const comment: Comment = {
      ...anchor,
      id: `comment-${now}-${Math.random().toString(36).slice(2, 7)}`,
      bookId: book.id,
      pageIndex: activeIndex,
      text,
      createdAt: now,
      updatedAt: now,
    }
    setBook(prev => ({ ...prev, comments: [...prev.comments, comment] }))
    void db.comments.add(comment)
  }, [book.id, activeIndex])

  const updateComment = useCallback((id: string, text: string) => {
    const updatedAt = Date.now()
    setBook(prev => ({ ...prev, comments: prev.comments.map(c => c.id === id ? { ...c, text, updatedAt } : c) }))
    void db.comments.update(id, { text, updatedAt })
  }, [])

  const removeComment = useCallback((id: string) => {
    setBook(prev => ({ ...prev, comments: prev.comments.filter(c => c.id !== id) }))
    void db.comments.delete(id)
  }, [])

  const renameChapter = useCallback((newTitle: string) => {
    const newPages = book.pages.map((p, i) => i === activeIndex ? { ...p, question: newTitle } : p)
    setBook(prev => ({ ...prev, pages: newPages }))
    void db.books.update(book.id, { pages: newPages })
  }, [book, activeIndex])

  const deleteChapter = useCallback(async (pageIndex: number) => {
    if (!window.confirm('Delete this chapter?')) return
    const newPages = book.pages.filter((_, i) => i !== pageIndex)
    const newStickers = renumberAfterPageDelete(book.stickers, pageIndex)
    const newComments = renumberAfterPageDelete(book.comments, pageIndex)
    setBook(prev => ({ ...prev, pages: newPages, stickers: newStickers, comments: newComments }))
    setActiveIndex(prev => pageIndex < prev ? prev - 1 : Math.min(prev, newPages.length - 1))
    await db.transaction('rw', db.books, db.stickers, db.comments, async () => {
      await db.books.update(book.id, { pages: newPages })
      await db.stickers.where('bookId').equals(book.id).filter(s => s.pageIndex === pageIndex).delete()
      const toRenumber = await db.stickers.where('bookId').equals(book.id).filter(s => s.pageIndex > pageIndex).toArray()
      for (const s of toRenumber) {
        await db.stickers.update(s.id, { pageIndex: s.pageIndex - 1 })
      }
      await db.comments.where('bookId').equals(book.id).filter(c => c.pageIndex === pageIndex).delete()
      const commentsToRenumber = await db.comments.where('bookId').equals(book.id).filter(c => c.pageIndex > pageIndex).toArray()
      for (const c of commentsToRenumber) {
        await db.comments.update(c.id, { pageIndex: c.pageIndex - 1 })
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
        comments={book.comments.filter(c => c.pageIndex === activeIndex)}
        commentCount={book.comments.length}
        onAddComment={addComment}
        onUpdateComment={updateComment}
        onRemoveComment={removeComment}
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
