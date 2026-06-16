import { Page, TAB_COLORS } from '../types'

interface Props {
  title: string
  pages: Page[]
  activeIndex: number
  onSelect: (index: number) => void
  onDeleteChapter?: (index: number) => void
}

export default function RolodexSpine({ title, pages, activeIndex, onSelect, onDeleteChapter }: Props) {
  return (
    <div className="spine">
      <div className="spine-header">
        <span className="spine-book-label">{title}</span>
        <span className="spine-count">{pages.length} chapters</span>
      </div>

      <div className="spine-tabs">
        {pages.map((page, i) => {
          const color = TAB_COLORS[i % TAB_COLORS.length]
          const isActive = i === activeIndex
          return (
            <div
              key={i}
              className={`spine-tab ${isActive ? 'spine-tab--active' : ''}`}
              style={{ '--tab-color': color } as React.CSSProperties}
            >
              <button
                type="button"
                className="spine-tab-btn"
                onClick={() => onSelect(i)}
              >
                <span className="tab-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="tab-title">{page.question}</span>
              </button>
              {onDeleteChapter && pages.length > 1 && (
                <button
                  type="button"
                  className="spine-tab-delete"
                  onClick={() => onDeleteChapter(i)}
                  title="Delete chapter"
                  aria-label="Delete chapter"
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
