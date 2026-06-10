import { useState } from 'react'
import { Sticker, Page } from '../types'

type SortKey = 'page' | 'recent'

interface Props {
  stickers: Sticker[]
  pages: Page[]
  onRemove: (id: string) => void
  onClose: () => void
}

export default function StickerCollection({ stickers, pages, onRemove, onClose }: Props) {
  const [sort, setSort] = useState<SortKey>('page')

  const sorted = [...stickers].sort((a, b) =>
    sort === 'page' ? a.pageIndex - b.pageIndex : b.createdAt - a.createdAt
  )

  return (
    <div className="sticker-overlay" onClick={onClose}>
      <div className="sticker-collection" onClick={e => e.stopPropagation()}>
        <div className="collection-header">
          <h2 className="collection-title">Sticker Collection</h2>
          <div className="collection-controls">
            <div className="sort-tabs">
              <button
                type="button"
                className={`sort-tab ${sort === 'page' ? 'sort-tab--active' : ''}`}
                onClick={() => setSort('page')}
              >
                By Chapter
              </button>
              <button
                type="button"
                className={`sort-tab ${sort === 'recent' ? 'sort-tab--active' : ''}`}
                onClick={() => setSort('recent')}
              >
                Most Recent
              </button>
            </div>
            <button type="button" className="collection-close" onClick={onClose}>×</button>
          </div>
        </div>

        {stickers.length === 0 ? (
          <div className="collection-empty">
            <p>No stickers yet.</p>
            <p>Select any text in the book and click "Make Sticker" to save it here.</p>
          </div>
        ) : (
          <div className="sticker-grid">
            {sorted.map(sticker => {
              const pageTitle = pages[sticker.pageIndex]?.question ?? ''
              const label = pageTitle.length > 40 ? pageTitle.slice(0, 40) + '...' : pageTitle
              return (
                <div
                  key={sticker.id}
                  className="sticker-card"
                  style={{ backgroundColor: sticker.color }}
                >
                  <p className="sticker-text">"{sticker.text}"</p>
                  <div className="sticker-meta">
                    <span className="sticker-source">{label}</span>
                    <button type="button" className="sticker-remove" onClick={() => onRemove(sticker.id)}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
