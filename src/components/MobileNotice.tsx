import { useState } from 'react'

const SITE_URL = 'https://structura.wiki'

export default function MobileNotice() {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable or permission denied — the URL text below
      // is the fallback, so there's nothing else to do here.
    }
  }

  return (
    <div className="mobile-notice">
      <div className="mobile-notice-inner">
        <div className="mobile-notice-logo">
          <span className="logo-word">Structura</span>
          <span className="logo-tagline">AI gives answers. Structura gives structure.</span>
        </div>
        <p className="mobile-notice-about">
          Structura turns your AI chat exports into a searchable library of chapters and highlights.
        </p>
        <div className="mobile-notice-card">
          <h1 className="mobile-notice-heading">Structura is desktop-only</h1>
          <p className="mobile-notice-body">
            Your library lives in your browser on the device where you imported it — it's
            never uploaded anywhere. That's what keeps it private, but it also means
            there's nothing to show on a phone you didn't import on.
          </p>
          <p className="mobile-notice-cta">Open structura.wiki on your computer to get started.</p>
          <button type="button" className="mobile-notice-copy-btn" onClick={() => void copyLink()}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <span className="mobile-notice-url">{SITE_URL}</span>
        </div>
      </div>
    </div>
  )
}
