import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { chatgptExportAdapter, linearize, pairTurns, parseZipBuffer } from '../chatgptExport'
import { claudeExportAdapter } from '../claudeExport'
import { deepseekExportAdapter } from '../deepseekExport'
import { pasteAdapter } from '../paste'
import { AdapterError } from '../types'
import type { AdapterInput } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileInput(json: unknown): AdapterInput {
  return { kind: 'file', name: 'conversations.json', json }
}

function textInput(text: string): AdapterInput {
  return { kind: 'text', text }
}

// ── ChatGPT fixture (inline — avoids JSON import config) ─────────────────────

const CHATGPT_FIXTURE = [
  {
    id: 'conv-chatgpt-1',
    title: 'TypeScript Basics',
    create_time: 1700000000,
    update_time: 1700000100,
    current_node: 'node-a3',
    mapping: {
      'node-system': {
        message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } },
        parent: null,
        children: ['node-u1'],
      },
      'node-u1': {
        message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['What is TypeScript?'] } },
        parent: 'node-system',
        children: ['node-a1-old', 'node-a1'],
      },
      // Regenerated branch — must be excluded
      'node-a1-old': {
        message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Old branch — should be excluded.'] } },
        parent: 'node-u1',
        children: [],
      },
      'node-a1': {
        message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['TypeScript is a typed superset of JavaScript.'] } },
        parent: 'node-u1',
        children: ['node-u2'],
      },
      'node-u2': {
        message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['Why use it?'] } },
        parent: 'node-a1',
        children: ['node-a2'],
      },
      'node-a2': {
        message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['It catches errors at compile time.'] } },
        parent: 'node-u2',
        children: ['node-u3'],
      },
      'node-u3': {
        message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['How do I start?'] } },
        parent: 'node-a2',
        children: ['node-a3'],
      },
      'node-a3': {
        message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Run npm install -g typescript.'] } },
        parent: 'node-u3',
        children: [],
      },
    },
  },
]

const CLAUDE_FIXTURE = [
  {
    uuid: 'claude-conv-fixture-1',
    name: 'Rust Basics',
    created_at: '2024-01-15T10:00:00Z',
    chat_messages: [
      { uuid: 'm1', text: 'What is Rust?', sender: 'human', created_at: '2024-01-15T10:00:01Z' },
      { uuid: 'm2', text: 'Rust is a systems language.', sender: 'assistant', created_at: '2024-01-15T10:00:02Z' },
      { uuid: 'm3', text: 'What makes it safe?', sender: 'human', created_at: '2024-01-15T10:00:03Z' },
      { uuid: 'm4', text: 'The ownership system.', sender: 'assistant', created_at: '2024-01-15T10:00:04Z' },
      { uuid: 'm5', text: 'Is it hard?', sender: 'human', created_at: '2024-01-15T10:00:05Z' },
      { uuid: 'm6', text: 'Steep curve but rewarding.', sender: 'assistant', created_at: '2024-01-15T10:00:06Z' },
    ],
  },
]

// ── ChatGPT: tree walk ────────────────────────────────────────────────────────

describe('chatgptExport — tree walk', () => {
  it('linearize picks current_node path, excludes old branch', () => {
    const conv = CHATGPT_FIXTURE[0]
    const msgs = linearize(conv)
    const texts = msgs.map(m => (m.content.parts[0] as string))
    expect(texts).not.toContain('Old branch — should be excluded.')
    expect(texts).toContain('TypeScript is a typed superset of JavaScript.')
  })

  it('full parse of fixture produces 3 pages', () => {
    const result = chatgptExportAdapter.parse(fileInput(CHATGPT_FIXTURE))
    expect(result).toHaveLength(1)
    expect(result[0].pages).toHaveLength(3)
    expect(result[0].source).toBe('chatgpt')
  })

  it('page content matches fixture data', () => {
    const [conv] = chatgptExportAdapter.parse(fileInput(CHATGPT_FIXTURE))
    expect(conv.pages[0].question).toBe('What is TypeScript?')
    expect(conv.pages[0].answer).toBe('TypeScript is a typed superset of JavaScript.')
    expect(conv.pages[2].question).toBe('How do I start?')
  })
})

// ── ChatGPT: role filtering ───────────────────────────────────────────────────

describe('chatgptExport — role filtering', () => {
  it('drops system messages — system content never appears in pages', () => {
    // linearize keeps system nodes; toRawTurns filters them; full pipeline must exclude them
    const [conv] = chatgptExportAdapter.parse(fileInput(CHATGPT_FIXTURE))
    const allRoles = CHATGPT_FIXTURE[0].mapping
    // The fixture has a system node — it must not produce any page content
    expect(allRoles['node-system']).toBeDefined()
    expect(conv.pages).toHaveLength(3) // only user/assistant pairs survive
  })

  it('pairTurns skips empty-text turns', () => {
    const turns = [
      { role: 'user' as const, text: '' },
      { role: 'user' as const, text: 'Real question' },
      { role: 'assistant' as const, text: 'Answer' },
    ]
    const pages = pairTurns(turns)
    expect(pages).toHaveLength(1)
    expect(pages[0].question).toBe('Real question')
  })
})

// ── ChatGPT: consecutive-turn concatenation ───────────────────────────────────

describe('chatgptExport — consecutive turn concatenation', () => {
  it('merges consecutive user turns into one question', () => {
    const turns = [
      { role: 'user' as const, text: 'Part one.' },
      { role: 'user' as const, text: 'Part two.' },
      { role: 'assistant' as const, text: 'Answer.' },
    ]
    const pages = pairTurns(turns)
    expect(pages).toHaveLength(1)
    expect(pages[0].question).toBe('Part one.\n\nPart two.')
  })

  it('merges consecutive assistant turns into one answer', () => {
    const turns = [
      { role: 'user' as const, text: 'Question.' },
      { role: 'assistant' as const, text: 'First part.' },
      { role: 'assistant' as const, text: 'Second part.' },
    ]
    const pages = pairTurns(turns)
    expect(pages).toHaveLength(1)
    expect(pages[0].answer).toBe('First part.\n\nSecond part.')
  })
})

// ── ChatGPT: trailing question drop ──────────────────────────────────────────

describe('chatgptExport — trailing question drop', () => {
  it('drops a user turn with no following assistant turn', () => {
    const turns = [
      { role: 'user' as const, text: 'Q1' },
      { role: 'assistant' as const, text: 'A1' },
      { role: 'user' as const, text: 'Unanswered' },
    ]
    const pages = pairTurns(turns)
    expect(pages).toHaveLength(1)
    expect(pages[0].question).toBe('Q1')
  })
})

// ── detect() sniffs ───────────────────────────────────────────────────────────

describe('detect()', () => {
  it('chatgpt detect: true for data with mapping + current_node', () => {
    expect(chatgptExportAdapter.detect(fileInput(CHATGPT_FIXTURE))).toBe(true)
  })

  it('chatgpt detect: false for claude data', () => {
    expect(chatgptExportAdapter.detect(fileInput(CLAUDE_FIXTURE))).toBe(false)
  })

  it('claude detect: true for data with chat_messages + uuid', () => {
    expect(claudeExportAdapter.detect(fileInput(CLAUDE_FIXTURE))).toBe(true)
  })

  it('claude detect: false for chatgpt data', () => {
    expect(claudeExportAdapter.detect(fileInput(CHATGPT_FIXTURE))).toBe(false)
  })

  it('paste detect: true for text input', () => {
    expect(pasteAdapter.detect(textInput('You\nHello\n\nAssistant\nHi'))).toBe(true)
  })

  it('paste detect: false for file input', () => {
    expect(pasteAdapter.detect(fileInput([]))).toBe(false)
  })
})

// ── Claude adapter ────────────────────────────────────────────────────────────

describe('claudeExport', () => {
  it('parses 3 pages from fixture', () => {
    const result = claudeExportAdapter.parse(fileInput(CLAUDE_FIXTURE))
    expect(result).toHaveLength(1)
    expect(result[0].pages).toHaveLength(3)
    expect(result[0].source).toBe('claude')
  })

  it('uses conversation uuid as id', () => {
    const [conv] = claudeExportAdapter.parse(fileInput(CLAUDE_FIXTURE))
    expect(conv.id).toBe('claude-conv-fixture-1')
  })
})

// ── Malformed input → AdapterError ───────────────────────────────────────────

describe('malformed input', () => {
  it('chatgpt parse throws AdapterError on non-array', () => {
    expect(() => chatgptExportAdapter.parse(fileInput({ not: 'an array' }))).toThrow(AdapterError)
  })

  it('chatgpt parse throws AdapterError on text input', () => {
    expect(() => chatgptExportAdapter.parse(textInput('hello'))).toThrow(AdapterError)
  })

  it('claude parse throws AdapterError on non-array', () => {
    expect(() => claudeExportAdapter.parse(fileInput(null))).toThrow(AdapterError)
  })

  it('chatgpt parse returns empty on array of invalid items', () => {
    const result = chatgptExportAdapter.parse(fileInput([{ garbage: true }]))
    expect(result).toHaveLength(0)
  })
})

// ── Paste adapter ─────────────────────────────────────────────────────────────

describe('pasteAdapter', () => {
  it('parses a simple 2-turn paste', () => {
    const text = 'You\nWhat is 2+2?\n\nAssistant\nIt is 4.'
    const result = pasteAdapter.parse(textInput(text))
    expect(result).toHaveLength(1)
    expect(result[0].pages[0].question).toContain('What is 2+2?')
    expect(result[0].source).toBe('paste')
  })

  it('returns empty array for empty text', () => {
    expect(pasteAdapter.parse(textInput(''))).toHaveLength(0)
  })
})

// ── parseZipBuffer — manifest-driven and fallback ─────────────────────────────

const enc = new TextEncoder()
const CONV_A = { id: 'a', marker: 'conv-a' }
const CONV_B = { id: 'b', marker: 'conv-b' }

function makeManifest(version: number, files: string[]) {
  return {
    version,
    manifest_file: 'export_manifest.json',
    logical_files: {
      'conversations.json': { files, shard_count: files.length, sharded: files.length > 1 },
    },
  }
}

describe('parseZipBuffer — manifest primary path', () => {
  it('uses manifest array order, not alphabetical — shard 001 listed first comes out first', () => {
    // Manifest lists 001 before 000; result must follow that order, not sort order.
    const zip = zipSync({
      'export_manifest.json': enc.encode(JSON.stringify(
        makeManifest(1, ['conversations-001.json', 'conversations-000.json'])
      )),
      'conversations-000.json': enc.encode(JSON.stringify([CONV_B])),
      'conversations-001.json': enc.encode(JSON.stringify([CONV_A])),
    })
    const { conversations, manifestVersion } = parseZipBuffer(zip)
    expect(manifestVersion).toBe(1)
    expect(conversations).toHaveLength(2)
    expect((conversations[0] as typeof CONV_A).marker).toBe('conv-a') // 001 listed first
    expect((conversations[1] as typeof CONV_B).marker).toBe('conv-b') // 000 listed second
  })

  it('ignores .dat and user.json entries not listed in manifest', () => {
    const zip = zipSync({
      'export_manifest.json': enc.encode(JSON.stringify(
        makeManifest(1, ['conversations-000.json', 'conversations-001.json'])
      )),
      'conversations-000.json': enc.encode(JSON.stringify([CONV_A])),
      'conversations-001.json': enc.encode(JSON.stringify([CONV_B])),
      'user.json': enc.encode(JSON.stringify({ name: 'Test User' })),
      'chat.dat': enc.encode('binary data'),
    })
    const { conversations, manifestVersion } = parseZipBuffer(zip)
    expect(manifestVersion).toBe(1)
    expect(conversations).toHaveLength(2)
  })

  it('manifest version 2 with unparseable conversations entry throws AdapterError mentioning version', () => {
    const zip = zipSync({
      'export_manifest.json': enc.encode(JSON.stringify(
        makeManifest(2, []) // empty files array → treated as unparseable entry
      )),
    })
    expect(() => parseZipBuffer(zip)).toThrow(AdapterError)
    expect(() => parseZipBuffer(zip)).toThrow('manifest version 2')
  })
})

describe('parseZipBuffer — fallback path', () => {
  it('no manifest: falls back to filename pattern, sorted ascending', () => {
    const zip = zipSync({
      'conversations-000.json': enc.encode(JSON.stringify([CONV_A])),
      'conversations-001.json': enc.encode(JSON.stringify([CONV_B])),
    })
    const { conversations, manifestVersion } = parseZipBuffer(zip)
    expect(manifestVersion).toBeNull()
    expect(conversations).toHaveLength(2)
    expect((conversations[0] as typeof CONV_A).marker).toBe('conv-a') // 000 comes first alphabetically
  })

  it('manifest present but malformed JSON falls back to filename pattern', () => {
    const zip = zipSync({
      'export_manifest.json': enc.encode('this is not valid json {{{'),
      'conversations-000.json': enc.encode(JSON.stringify([CONV_A])),
    })
    const { conversations, manifestVersion } = parseZipBuffer(zip)
    expect(manifestVersion).toBeNull()
    expect(conversations).toHaveLength(1)
  })
})

// ── DeepSeek adapter ──────────────────────────────────────────────────────────

function ds(id: string, parentId: string | null, childrenIds: string[], fragments: Array<{ type: string; content: string }>) {
  return {
    id,
    parent: parentId,
    children: childrenIds,
    message: fragments.length === 0 && parentId === null
      ? null  // root node
      : { files: [], model: 'deepseek-chat', inserted_at: '2025-01-01T00:00:00.000000+00:00', fragments },
  }
}

const DS_LINEAR_FIXTURE = [{
  id: 'ds-conv-1',
  title: 'Linear Test',
  inserted_at: '2025-02-06T21:14:55.519000+08:00',
  updated_at: '2025-02-06T21:15:10.000000+08:00',
  mapping: {
    root:    ds('root',    null,    ['node-u1'], []),
    'node-u1': ds('node-u1', 'root',   ['node-a1'], [{ type: 'REQUEST',  content: 'What is DeepSeek?' }]),
    'node-a1': ds('node-a1', 'node-u1', ['node-u2'], [
      { type: 'SEARCH',   content: 'search traces' },
      { type: 'THINK',    content: 'internal thinking' },
      { type: 'RESPONSE', content: 'DeepSeek is an AI.' },
    ]),
    'node-u2': ds('node-u2', 'node-a1', ['node-empty'], [{ type: 'REQUEST', content: 'What can it do?' }]),
    'node-empty': ds('node-empty', 'node-u2', ['node-think'], []),  // empty fragments — no role
    'node-think': ds('node-think', 'node-empty', ['node-a2'], [{ type: 'THINK', content: 'more thinking' }]),
    'node-a2': ds('node-a2', 'node-think', [], [{ type: 'RESPONSE', content: 'It can reason.' }]),
  },
}]

const DS_BRANCH_FIXTURE = [{
  id: 'ds-conv-branch',
  title: 'Branch Test',
  inserted_at: '2025-02-07T10:00:00.000000+00:00',
  updated_at: '2025-02-07T10:00:05.000000+00:00',
  mapping: {
    root:      ds('root',      null,       ['node-u1'], []),
    'node-u1': ds('node-u1',   'root',     ['node-a-old', 'node-a-new'], [{ type: 'REQUEST', content: 'Ask something' }]),
    // Two children — adapter must pick the LAST (node-a-new)
    'node-a-old': ds('node-a-old', 'node-u1', [], [{ type: 'RESPONSE', content: 'old answer — should be excluded' }]),
    'node-a-new': ds('node-a-new', 'node-u1', [], [{ type: 'RESPONSE', content: 'new answer' }]),
  },
}]

describe('deepseekExport — linearization and content', () => {
  it('parses linear fixture into 2 pages', () => {
    const result = deepseekExportAdapter.parse(fileInput(DS_LINEAR_FIXTURE))
    expect(result).toHaveLength(1)
    expect(result[0].pages).toHaveLength(2)
    expect(result[0].source).toBe('deepseek')
  })

  it('strips SEARCH and THINK fragments — only RESPONSE appears', () => {
    const [conv] = deepseekExportAdapter.parse(fileInput(DS_LINEAR_FIXTURE))
    expect(conv.pages[0].question).toBe('What is DeepSeek?')
    expect(conv.pages[0].answer).toBe('DeepSeek is an AI.')
    expect(conv.pages[0].answer).not.toContain('search traces')
    expect(conv.pages[0].answer).not.toContain('internal thinking')
  })

  it('empty-fragments and THINK-only nodes are dropped — no blank pages', () => {
    const [conv] = deepseekExportAdapter.parse(fileInput(DS_LINEAR_FIXTURE))
    expect(conv.pages).toHaveLength(2)
    for (const page of conv.pages) {
      expect(page.question.trim()).not.toBe('')
      expect(page.answer.trim()).not.toBe('')
    }
  })

  it('createdAt is parsed from inserted_at ISO string', () => {
    const [conv] = deepseekExportAdapter.parse(fileInput(DS_LINEAR_FIXTURE))
    // 2025-02-06T21:14:55.519000+08:00 => UTC 2025-02-06T13:14:55.519Z
    expect(conv.createdAt).toBe(new Date('2025-02-06T21:14:55.519000+08:00').getTime())
  })
})

describe('deepseekExport — branching', () => {
  it('picks the last child on a branch — newest branch wins', () => {
    const result = deepseekExportAdapter.parse(fileInput(DS_BRANCH_FIXTURE))
    expect(result).toHaveLength(1)
    expect(result[0].pages).toHaveLength(1)
    expect(result[0].pages[0].answer).toBe('new answer')
    expect(result[0].pages[0].answer).not.toContain('old answer')
  })
})

describe('deepseekExport — detect()', () => {
  it('returns true for DeepSeek data (mapping + fragments, no current_node)', () => {
    expect(deepseekExportAdapter.detect(fileInput(DS_LINEAR_FIXTURE))).toBe(true)
  })

  it('returns false for ChatGPT data (has current_node)', () => {
    expect(deepseekExportAdapter.detect(fileInput(CHATGPT_FIXTURE))).toBe(false)
  })
})

describe('deepseekExport — malformed input', () => {
  it('throws AdapterError on text input', () => {
    expect(() => deepseekExportAdapter.parse(textInput('hello'))).toThrow(AdapterError)
  })

  it('throws AdapterError on non-array', () => {
    expect(() => deepseekExportAdapter.parse(fileInput({ not: 'an array' }))).toThrow(AdapterError)
  })

  it('skips invalid items and returns empty when no valid conversations', () => {
    const result = deepseekExportAdapter.parse(fileInput([{ garbage: true }]))
    expect(result).toHaveLength(0)
  })
})
