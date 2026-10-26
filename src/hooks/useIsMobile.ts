import { useState, useEffect } from 'react'

// Low on purpose: only real phones should hit this. Touchscreen laptops,
// tablets-with-keyboards, and narrow/split-screen desktop windows must not.
const MOBILE_QUERY = '(max-width: 600px)'

/** True only on phone-width viewports; live-updates as the viewport resizes. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
