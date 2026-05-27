import { Page, TAB_COLORS } from '../types'

interface Props {
  pages: Page[]
  activeIndex: number
  onSelect: (index: number) => void
}

export default function RolodexSpine({ pages, activeIndex, onSelect }: Props) {
  return (
    <div className="spine">
      <div className="spine-header">
        <span className="spine-book-label">Book of AI</span>
        <span className="spine-count">{pages.length} chapters</span>
      </div>

      <div className="spine-tabs">
        {pages.map((page, i) => {
          const color = TAB_COLORS[i % TAB_COLORS.length]
          const isActive = i === activeIndex
          return (
            <button
              key={page.id}
              className={`spine-tab ${isActive ? 'spine-tab--active' : ''}`}
              onClick={() => onSelect(i)}
              style={{ '--tab-color': color } as React.CSSProperties}
            >
              <span className="tab-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="tab-title">{page.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
