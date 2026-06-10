import { describe, it, expect } from 'vitest'
import { chatgptExportAdapter, linearize, pairTurns } from '../chatgptExport'
import { claudeExportAdapter } from '../claudeExport'
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
