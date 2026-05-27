interface Props {
  x: number
  y: number
  onMake: () => void
  onDismiss: () => void
}

export default function StickerPopup({ x, y, onMake, onDismiss }: Props) {
  return (
    <div
      className="sticker-popup"
      style={{ left: x, top: y }}
      onMouseDown={e => e.preventDefault()}
    >
      <button className="sticker-popup-btn" onClick={onMake}>
        Make Sticker
      </button>
      <button className="sticker-popup-dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  )
}
