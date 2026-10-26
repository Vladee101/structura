interface Props {
  onBack: () => void
}

export default function PrivacyPage({ onBack }: Props) {
  return (
    <div className="doc-page">
      <div className="doc-topbar">
        <button type="button" className="topbar-back" onClick={onBack}>
          ← Library
        </button>
      </div>

      <div className="doc-body">
        <div className="doc-content">
          <h1>Privacy</h1>

          <h2>The Short Version</h2>
          <p>Structura does not collect your conversations because Structura has nowhere to send them.</p>
          <p>There is no backend, no cloud service, no user accounts, no analytics platform, and no telemetry.</p>
          <p>Your conversation archives are processed entirely inside your browser and stored locally on your device.</p>
          <p>If you never export your data, it never leaves your machine.</p>

          <hr />

          <h2>How Structura Works</h2>
          <p>Structura is a local-first application.</p>
          <p>When you import a conversation export from ChatGPT, Claude, DeepSeek, or another supported platform:</p>
          <ol>
            <li>The archive is read by your browser.</li>
            <li>The conversation data is parsed locally.</li>
            <li>The resulting books, chapters, notes, and shelves are stored in your browser's IndexedDB.</li>
            <li>All reading, searching, organizing, and exporting happens locally.</li>
          </ol>
          <p>Structura does not upload your conversations to any server because no such server exists.</p>

          <hr />

          <h2>What Data Structura Collects</h2>
          <p>None.</p>
          <p>Structura does not collect:</p>
          <ul>
            <li>conversation content;</li>
            <li>prompts;</li>
            <li>AI responses;</li>
            <li>personal information;</li>
            <li>usage statistics;</li>
            <li>analytics events;</li>
            <li>crash reports;</li>
            <li>telemetry.</li>
          </ul>
          <p>The application has no mechanism for collecting this information.</p>

          <hr />

          <h2>What Data Structura Stores</h2>
          <p>Structura stores the following information locally on your device:</p>
          <ul>
            <li>imported conversations;</li>
            <li>generated books and chapters;</li>
            <li>notes and highlights;</li>
            <li>shelves and organization settings;</li>
            <li>application preferences.</li>
          </ul>
          <p>This data is stored inside your browser's local IndexedDB database.</p>
          <p>No copy is transmitted to Structura or any third party.</p>

          <hr />

          <h2>Network Activity</h2>
          <p>When you open Structura, your browser downloads the application files required to run the website.</p>
          <p>These files include:</p>
          <ul>
            <li>HTML;</li>
            <li>JavaScript;</li>
            <li>CSS;</li>
            <li>images and icons.</li>
          </ul>
          <p>
            After the application has loaded, importing conversations, reading books, creating notes,
            organizing shelves, and exporting content do not require communication with any external service.
          </p>

          <hr />

          <h2>Verify It Yourself</h2>
          <p>Privacy should not require trust.</p>
          <p>You can verify Structura's behavior directly:</p>
          <ol>
            <li>Open Structura with your browser's Developer Tools.</li>
            <li>Open the Network tab.</li>
            <li>Import a conversation archive.</li>
            <li>Create notes, rename books, and export content.</li>
            <li>Observe that no requests containing your conversation data are sent anywhere.</li>
          </ol>
          <p>If you discover network activity that should not occur, please report it as a security issue.</p>

          <hr />

          <h2>Open Source and Auditability</h2>
          <p>Structura's source code is publicly available.</p>
          <p>
            You are free to inspect how the application works, review the import process, examine storage
            mechanisms, and verify the absence of data transmission.
          </p>
          <p>
            The purpose of publishing the source code is transparency: a privacy-focused tool should be
            inspectable rather than trusted blindly.
          </p>

          <hr />

          <h2>Data Ownership</h2>
          <p>Your conversations remain yours.</p>
          <p>Structura does not claim ownership of your imported content because Structura never receives that content.</p>
          <p>You remain solely responsible for managing, backing up, and protecting your own data.</p>

          <hr />

          <h2>Data Deletion</h2>
          <p>Because your data is stored locally on your device, you can remove it at any time.</p>
          <p>Deleting Structura's local storage from your browser removes the data from Structura.</p>
          <p>Structura does not maintain any external copy that must be separately deleted.</p>

          <hr />

          <h2>Future Features</h2>
          <p>
            If Structura introduces optional features that communicate with software outside the browser
            (for example, a locally running LLM such as Ollama), those features will be clearly identified
            and documented.
          </p>
          <p>Structura's guiding principle remains unchanged:</p>
          <p>Your data should stay under your control and leave your device only when you explicitly choose to make it do so.</p>

          <hr />

          <h2>Contact</h2>
          <p>
            If you believe Structura behaves differently from what is described on this page, please open
            an issue on GitHub.
            <br />
            <a href="https://github.com/Vladee101/structura" target="_blank" rel="noopener noreferrer">
              https://github.com/Vladee101/structura
            </a>
          </p>
          <p>Privacy claims should be verifiable, and any deviation from those claims is considered a serious bug.</p>
        </div>
      </div>
    </div>
  )
}
