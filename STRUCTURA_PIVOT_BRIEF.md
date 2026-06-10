# Structura — Pivot Brief: Share-Link Proxy → Export-File Library

**Audience:** coding agent (Claude Code)
**Author:** Vlad
**Status:** Approved for implementation
**Date:** 2026-06-10

---

## 1. Context

Structura is an open-source, client-side web app that transforms exported LLM conversations into readable "books": each user prompt becomes a chapter title, each AI answer becomes the chapter body. UI metaphor: rolodex-style color tabs for navigation (left spine) + book-style content panel for reading (right). Users can highlight text to create "stickers" collected at the back of each book.

**Positioning:** privacy-first, zero-backend, fully static. "Your conversations never leave your browser." Deploy target: static hosting (GitHub Pages or Vercel static — no serverless functions).

**Current working state (do not break):**
- Import screen with paste-text mode and smart speaker-label detection (handles arbitrary names, e.g. "Vlad" / "Claude", inline and standalone label formats, CRLF)
- BookView: dark spine, color-coded numbered tabs, serif content panel, markdown rendering (bold, bullets, headers, inline code), prev/next nav, scroll-to-top on tab switch
- Sticker system: select text → create sticker; sticker collection modal with sort by chapter / recent
- localStorage persistence for one book + its stickers
- Stack: Vite + React + TypeScript, no backend

**Dead code from a failed direction (see ADR-001):**
- `/api` directory: Vercel edge function `parse.ts` + share-page scrapers for ChatGPT and Claude
- `vercel.json`
- URL-import mode in `ImportScreen.tsx` (mode tabs, URL input, fetch to `/api/parse`, related error states and CSS)

---

## 2. Architecture Decision Records

### ADR-001 — Import mechanism: official export files, not share-link scraping

**Status:** Accepted (supersedes the share-link approach)

**Context.** Copy-paste import is high-friction and users rarely copy full conversations. We attempted share-link import via a Vercel edge function that fetched and parsed public share pages server-side.

**What we learned in production testing:**
- ChatGPT share pages return HTTP 403 to server-side fetches — Cloudflare bot detection fingerprints TLS/client characteristics; header spoofing does not help.
- Claude share pages are a client-side React shell; fetched HTML contains no conversation content (rendered post-load by JS).
- Scraping live pages requires a real browser executing JS → that path leads to a browser extension, with its own costs: store review friction, Manifest V3 churn, permanent breakage risk on every UI redesign of three platforms, and a severe trust problem (an extension reading private AI chats is exactly what users should be paranoid about).
- Additionally, routing share URLs through our API quietly broke the "nothing leaves your browser" privacy claim.

**Decision.** Import via **official data exports**, parsed entirely client-side:
- ChatGPT: Settings → Data Controls → Export → ZIP containing `conversations.json` (full history, structured JSON).
- Claude: Settings → Privacy → Export data → `conversations.json` (full history).
- Anything else: paste-text fallback with the existing smart-label parser.

**Consequences:**
- (+) Zero scraping fragility; exports are documented, sanctioned features.
- (+) App returns to fully static — privacy claim is true again and becomes the headline feature.
- (+) One file yields the user's **entire history** → product upgrades from "one book" to "a library." Bigger wow for the same parsing effort.
- (−) Export friction: ChatGPT emails a ZIP (minutes to hours). Mitigation: clear README/UI instructions; the user does this once.
- (−) Export formats are undocumented and may drift. Mitigation: adapter isolation (§3), schema validation with explicit user-facing error messages, sample fixtures in tests.
- Browser extension is **deferred, not rejected** — roadmap item "live capture," to be revisited only on demonstrated user demand.

### ADR-002 — Persistence: IndexedDB (Dexie), not localStorage

**Status:** Accepted

**Context.** Current persistence is localStorage (single book + stickers). Full ChatGPT exports are commonly 10–50MB+. localStorage caps at ~5MB and fails synchronously and silently-ish on quota.

**Decision.** Migrate persistence to IndexedDB via Dexie.js. Tables: `books`, `stickers`. Books keyed by stable content hash (survives re-import); stickers reference `bookId`.

**Consequences:**
- (+) Hundreds of MB capacity, async API, indexed queries for the library view.
- (+) Dexie is small (~25KB) and battle-tested.
- (−) One-time migration: on first load, if legacy localStorage book exists, import it into Dexie, then clear the legacy key.

### ADR-003 — AI enrichment: optional local Ollama, never required

**Status:** Accepted (Phase 4, not MVP)

**Decision.** Core experience is 100% deterministic (raw prompt = chapter title, truncated for tab labels). If a local Ollama instance is reachable at `http://localhost:11434`, unlock optional enrichment: AI-shortened tab titles, per-chapter summaries. Feature-detect via a HEAD/GET ping with short timeout; degrade silently.

**Constraint to document for users:** Ollama blocks cross-origin requests by default; users must set `OLLAMA_ORIGINS` to the app origin (or `*`). README gets a dedicated setup section. No cloud API keys, ever — this preserves the zero-cost, privacy-first story.

---

## 3. Target Architecture

### 3.1 Adapter interface

All import paths implement one interface. Adding a platform = adding one file.

```ts
// src/adapters/types.ts
export interface ParsedConversation {
  id: string;            // stable hash of content
  title: string;         // conversation title from export, or first prompt truncated
  createdAt: number;     // epoch ms
  source: 'chatgpt' | 'claude' | 'paste';
  pages: Page[];         // ordered Q&A pairs
}

export interface Page {
  question: string;      // user turn (chapter title)
  answer: string;        // assistant turn, markdown
}

export interface ConversationAdapter {
  id: string;                          // 'chatgpt-export', 'claude-export', 'paste'
  displayName: string;
  /** Cheap sniff: can this adapter handle this input? */
  detect(input: AdapterInput): boolean;
  /** Full parse. Throws AdapterError with a user-facing message on failure. */
  parse(input: AdapterInput): ParsedConversation[];
}

export type AdapterInput =
  | { kind: 'file'; name: string; json: unknown }
  | { kind: 'text'; text: string };
```

Registry tries `detect()` in order: `chatgpt-export` → `claude-export` → `paste`. First match wins; on parse failure show the adapter's error message, never a blank screen.

### 3.2 ChatGPT export adapter — tree walk (critical detail)

ChatGPT's `conversations.json` is an **array of conversations**; each conversation's messages live in `mapping`: a dict of `nodeId → { id, message, parent, children }` forming a **tree** (branches exist from message edits/regenerations). The linear thread the user last saw is recovered by walking **backwards from `current_node` via `parent` pointers**, then reversing.

```ts
function linearize(conv: ChatGPTConversation): RawMessage[] {
  const out: RawMessage[] = [];
  let nodeId: string | null = conv.current_node;
  while (nodeId) {
    const node = conv.mapping[nodeId];
    if (node?.message) out.push(node.message);
    nodeId = node?.parent ?? null;
  }
  return out.reverse();
}
```

Filtering rules after linearization:
- Keep only `message.author.role` ∈ {`user`, `assistant`}.
- Drop messages with empty `content.parts` (system stubs, blanks).
- Drop `content_type` other than `text` unless trivially convertible; tool/system messages are skipped.
- Pair into Q&A pages: consecutive user turns concatenate into one question; consecutive assistant turns concatenate into one answer. A page is emitted on each user→assistant boundary; a trailing unanswered question is dropped.

### 3.3 Claude export adapter

Claude's export `conversations.json`: array of conversations, each with `uuid`, `name`, `created_at`, and `chat_messages[]` where each message has `sender` (`human` | `assistant`) and text content. Already linear — no tree walk. Apply the same pairing rules as §3.2.

**Agent instruction:** treat both schemas as *expected but unverified*. Validate defensively (Zod or hand-rolled guards); on shape mismatch, throw `AdapterError` with: "This file doesn't match the {platform} export format we know. The format may have changed — please open an issue with a redacted sample." Do not crash, do not half-render.

### 3.4 Data layer (Dexie)

```ts
// src/db.ts
import Dexie, { Table } from 'dexie';

export interface BookRecord extends ParsedConversation { importedAt: number; }
export interface StickerRecord {
  id: string; bookId: string; pageIndex: number;
  text: string; color: string; createdAt: number;
}

class StructuraDB extends Dexie {
  books!: Table<BookRecord, string>;
  stickers!: Table<StickerRecord, string>;
  constructor() {
    super('structura');
    this.version(1).stores({
      books: 'id, importedAt, createdAt, source',
      stickers: 'id, bookId, createdAt',
    });
  }
}
export const db = new StructuraDB();
```

### 3.5 Views & routing

```
/            LibraryView  — shelf of books (cover = title + source badge + page count + date), import button, delete book, search by title
/book/:id    BookView     — existing UI, loaded from Dexie by id
```

Use a minimal router (react-router or hand-rolled hash routing — agent's choice, justify in one comment). LibraryView is the new default screen; ImportScreen becomes a modal/panel inside it.

---

## 4. Implementation Plan

Work in phases. **Each phase must end with: `tsc --noEmit` clean, app runs, and the phase's acceptance criteria demonstrably met.** Do not start the next phase with the previous one red.

### Phase 0 — Excision
1. Delete `/api`, `vercel.json`, and all URL-import code paths in `ImportScreen.tsx` (mode tabs, URL state, fetch logic) + orphaned CSS.
2. Remove `vercel dev` from scripts; restore plain `vite` dev.
3. Grep for dangling references (`/api/parse`, `vercel`).

**Accept:** repo builds and runs as the pre-Vercel paste-text app. No references to the API remain.

### Phase 1 — Adapter layer
1. Create `src/adapters/` with `types.ts`, `registry.ts`, `chatgptExport.ts`, `claudeExport.ts`, `paste.ts` (wraps existing smart-label parser unchanged).
2. Implement detection: ChatGPT sniff = array items containing `mapping` + `current_node`; Claude sniff = array items containing `chat_messages` + `uuid`.
3. Fixtures: create `src/adapters/__fixtures__/` with one minimal handcrafted sample per format (3 Q&A pairs, one edited branch in the ChatGPT sample to prove the tree walk picks the `current_node` path).
4. Unit tests (Vitest) for: tree walk picks correct branch, role filtering, consecutive-turn concatenation, trailing-question drop, both detect() sniffs, malformed input → AdapterError.

**Accept:** all tests green; parsing a fixture in a scratch script yields correct `ParsedConversation[]`.

### Phase 2 — Storage migration
1. Add Dexie per §3.4.
2. Migration shim: on app boot, if legacy localStorage book exists → convert to `BookRecord` + `StickerRecord[]`, write to Dexie, delete legacy keys.
3. Rewire sticker persistence to Dexie.

**Accept:** legacy book from localStorage appears in Dexie after boot; stickers survive refresh; localStorage no longer used for book data.

### Phase 3 — Library
1. Build LibraryView + routing per §3.5.
2. File import: `<input type="file" accept=".json,.zip">` + drag-and-drop. If ZIP (ChatGPT ships one), extract `conversations.json` client-side (`fflate`, not JSZip — smaller). Run through adapter registry; bulk-insert books; show import summary ("Imported 47 conversations, skipped 3 empty").
3. Empty-conversation policy: skip conversations producing 0 pages; count them in the summary.
4. Keep paste-text as secondary import inside the import panel.
5. BookView loads by route param from Dexie; back-to-library affordance on the spine.

**Accept:** dropping a real ChatGPT export ZIP produces a populated shelf; opening any book shows the existing book UI; delete works; refresh persists everything.

### Phase 4 — Ollama enrichment (optional, after 0–3 are merged)
1. Feature-detect Ollama (GET `http://localhost:11434/api/tags`, 1s timeout).
2. If present: per-book "Enrich" action → shorten tab titles (≤4 words) and generate 1-sentence chapter summaries via `/api/generate`; store results on the BookRecord; UI marks enriched books.
3. If absent: feature invisible. No errors, no nags.

**Accept:** with Ollama running (and `OLLAMA_ORIGINS` set), enrichment works and persists; with Ollama absent, app is indistinguishable from Phase 3.

### Phase 5 — Portfolio polish (no agent code; checklist for Vlad)
- README: hero GIF, one-paragraph pitch, privacy section, export how-to per platform, Ollama setup (`OLLAMA_ORIGINS`), architecture diagram (C4 container level), link to `docs/adr/`.
- Move ADRs 001–003 from this brief into `docs/adr/` as standalone files.
- Roadmap section: browser extension ("live capture — pending demand"), Gemini/Takeout adapter, EPUB export.
- Deploy static build to GitHub Pages.

---

## 5. Non-Goals (MVP)

- No browser extension (deferred — ADR-001).
- No server, no auth, no telemetry, no cloud AI APIs.
- No EPUB/PDF export yet (roadmap; chapter structure is designed to make it cheap later).
- No mobile-first work; desktop-first stands. Mobile = read-only later.
- No Gemini adapter yet (Takeout format; roadmap — the adapter interface makes it a one-file addition).

## 6. Conventions for the Agent

- TypeScript strict; no `any` in adapter code — unknown inputs are `unknown` + guards.
- Every adapter failure surfaces a user-facing message; never a console-only error.
- No new runtime deps beyond: `dexie`, `fflate`, router (if chosen), `vitest` (dev). Justify anything else in a comment before adding.
- Preserve the existing CSS/visual identity; new views reuse the established palette and serif/spine aesthetic.
- Commit per phase, message format: `phase-N: <summary>`.
