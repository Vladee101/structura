interface Props {
  onBack: () => void
}

export default function HowToImportPage({ onBack }: Props) {
  return (
    <div className="doc-page">
      <div className="doc-topbar">
        <button type="button" className="topbar-back" onClick={onBack}>
          ← Library
        </button>
      </div>

      <div className="doc-body">
        <div className="doc-content">
          <h1>How to Import Your Data</h1>

          
          <p>Export your data as a ZIP file from your platform, then click to browse or drag and drop the ZIP into Structura.</p>

          <h2>ChatGPT</h2>
          <ol>
            <li>Open <strong>Settings</strong></li>
            <li>Go to <strong>Data Controls</strong></li>
            <li>Click <strong>Export Data</strong></li>
            <li>Wait for the email from OpenAI</li>
            <li>Download the ZIP file</li>
            <li>Drop the ZIP into Structura</li>
          </ol>

          <hr />

          <h2>Claude</h2>
          <ol>
            <li>Open <strong>Settings</strong></li>
            <li>Go to <strong>Privacy</strong></li>
            <li>Click <strong>Export Data</strong></li>
            <li>Wait for the email from Anthropic</li>
            <li>Download the file from the email and drop it into Structura</li>
            <li>Click <strong>Download your conversations</strong>, then drop that ZIP into Structura</li>
          </ol>

          <hr />

          <h2>DeepSeek</h2>
          <ol>
            <li>Open <strong>Settings</strong></li>
            <li>Go to <strong>Data</strong></li>
            <li>Click <strong>Download Data</strong></li>
            <li>Download the ZIP file</li>
            <li>Drop the ZIP into Structura</li>
          </ol>

          <hr />

          <h2>Notes</h2>
          <ul>
            <li>Import the ZIP file directly. Do not extract it first.</li>
            <li>
              Already imported your Claude chats? Import the same ZIP again to add the files,
              charts and widgets Claude made. Your stickers and comments are kept.
            </li>
            <li>Structura processes the archive locally in your browser.</li>
            <li>Your conversations are never uploaded to a server.</li>
            <li>Re-importing an updated export will not create duplicate books. Existing conversations are matched and updated automatically.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
