import { useEffect, useMemo, useRef, useState } from 'react'

// Widgets and HTML/SVG files come from imported chats, so they run in an iframe with
// `sandbox="allow-scripts"` only: an opaque origin with no access to the library's storage,
// no forms, popups or top-level navigation.

// Claude draws widgets against its own stylesheet; these stand-ins keep them legible.
const BASE_STYLE = `
:root {
  --color-text-primary: #1c1c1c; --color-text-secondary: #5f5a52; --color-text-tertiary: #8a8378;
  --color-background-primary: #ffffff; --color-background-secondary: #f6f2ea; --color-background-tertiary: #efe9de;
  --color-border-primary: #a99f8f; --color-border-secondary: #cfc7b9; --color-border-tertiary: #e4ddd0;
  --color-text-info: #2f5f8f; --color-background-info: #e6eef7; --color-border-info: #9db7d4;
  --color-text-success: #3d6b46; --color-background-success: #e7f1e8; --color-border-success: #a3c4a8;
  --color-text-warning: #8a5a12; --color-background-warning: #fbf1dc; --color-border-warning: #e3c27e;
  --color-text-danger: #9b3b2a; --color-background-danger: #f8e6e2; --color-border-danger: #dba79c;
  --font-sans: system-ui, -apple-system, sans-serif; --font-mono: Menlo, Monaco, 'Courier New', monospace;
  --border-radius-md: 6px; --border-radius-lg: 10px; --radius: 6px;
  --text-primary: var(--color-text-primary); --text-secondary: var(--color-text-secondary);
  --text-muted: var(--color-text-tertiary); --border: var(--color-border-tertiary);
  --border-strong: var(--color-border-secondary); --surface-1: var(--color-background-primary);
  --surface-2: var(--color-background-secondary);
}
html, body { margin: 0; background: transparent; }
html { overflow: hidden; }
body { padding: 8px; font-family: var(--font-sans); font-size: 14px; color: var(--color-text-primary); line-height: 1.5; }
svg { max-width: 100%; height: auto; }
svg text { font-family: var(--font-sans); fill: var(--color-text-primary); }
.th { font-size: 14px; font-weight: 600; fill: var(--color-text-primary); }
.ts { font-size: 12px; fill: var(--color-text-secondary); }
.ti { font-size: 11px; fill: var(--color-text-tertiary); }
.node rect, rect.node { fill: var(--color-background-secondary); stroke: var(--color-border-secondary); }
.arr { stroke: var(--color-text-tertiary); stroke-width: 1.5; fill: none; }
.leader { stroke: var(--color-border-secondary); stroke-dasharray: 3 3; fill: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${[
  ['teal', '#dff2ee', '#3f8f80', '#1f5c51'], ['purple', '#ece6f6', '#7a5fa0', '#4d3870'],
  ['coral', '#fbe6df', '#c4664a', '#8a3f2a'], ['gray', '#eeece8', '#8f8a82', '#4a4640'],
  ['blue', '#e3edf8', '#4a7aad', '#2a5180'], ['amber', '#fbefd6', '#c9913a', '#7f5815'],
  ['green', '#e4f1e3', '#5f8f6a', '#365c3f'], ['red', '#f8e2df', '#b8483a', '#7c2a20'],
  ['pink', '#f8e3ec', '#b45a82', '#7a3355'],
].map(([c, light, mid, dark]) => `
.c-${c} rect, .c-${c} circle, .c-${c} ellipse, .c-${c} polygon, rect.c-${c}, circle.c-${c}, ellipse.c-${c}, polygon.c-${c} { fill: ${light}; stroke: ${mid}; }
.c-${c} path:not(.arr) { stroke: ${mid}; }
.c-${c} text, text.c-${c}, .c-${c} .th, .c-${c} .ts { fill: ${dark}; }
.c-${c}:not(svg *) { background: ${light}; border-color: ${mid}; color: ${dark}; }`).join('')}
`

function frameDocument(code: string, frameId: string): string {
  const report = `
<script>
window.sendPrompt = function () {};
(function () {
  function post() {
    var h = Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height + 16);
    parent.postMessage({ structuraFrame: ${JSON.stringify(frameId)}, height: Math.ceil(h) }, '*');
  }
  // The viewport never changes size on its own; the body grows as content lays out.
  if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
  window.addEventListener('load', post);
  window.addEventListener('resize', post);
  setTimeout(post, 50);
  setTimeout(post, 500);
})();
</script>`
  // A full document (an HTML file) keeps its own head; fragments get a minimal shell.
  if (/<html[\s>]/i.test(code)) {
    const withStyle = code.replace(/<head[^>]*>/i, m => `${m}<style>${BASE_STYLE}</style>`)
    return /<\/body>/i.test(withStyle) ? withStyle.replace(/<\/body>/i, `${report}</body>`) : withStyle + report
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body>${code}${report}</body></html>`
}

interface Props {
  code: string
  title: string
  minHeight?: number
}

let frameCount = 0
const MAX_HEIGHT = 1600

export default function SandboxFrame({ code, title, minHeight = 80 }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [frameId] = useState(() => `f${++frameCount}`)
  const [height, setHeight] = useState(minHeight)
  const srcDoc = useMemo(() => frameDocument(code, frameId), [code, frameId])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return
      const data = e.data as { structuraFrame?: string; height?: number } | null
      if (data?.structuraFrame !== frameId || typeof data.height !== 'number') return
      setHeight(Math.min(Math.max(data.height, minHeight), MAX_HEIGHT))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameId, minHeight])

  return (
    <iframe
      ref={ref}
      className="sandbox-frame"
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
      srcDoc={srcDoc}
      style={{ height }}
    />
  )
}
