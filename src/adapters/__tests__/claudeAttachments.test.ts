import { describe, it, expect } from 'vitest'
import { toolSlots, attachToStoredPages } from '../claudeAttachments'
import type { ClaudeBlock } from '../claudeAttachments'
import { claudeExportAdapter } from '../claudeExport'
import { answerMarkdown } from '../../utils/markdownExport'
import { isHiddenLine } from '../../utils/comments'
import type { Attachment, FileAttachment } from '../../types'

const PH = 'This block is not supported on your current device yet.'
const tool = (name: string, input: Record<string, unknown>): ClaudeBlock => ({ type: 'tool_use', name, input })
const text = (t: string): ClaudeBlock => ({ type: 'text', text: t })

describe('toolSlots', () => {
  it('shows a file once per message, at first write, in its final state', () => {
    const files = new Map<string, string>()
    const slots = toolSlots([
      tool('create_file', { path: '/out/a.md', file_text: 'hello world' }),
      tool('str_replace', { path: '/out/a.md', old_str: 'world', new_str: 'there' }),
      tool('bash_tool', { command: 'ls' }),
    ], files)
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({ kind: 'file', path: '/out/a.md', content: 'hello there', updated: false })
    expect(slots[1]).toBeNull()
    expect(slots[2]).toBeNull()
  })

  it('marks files edited in a later message as updated', () => {
    const files = new Map<string, string>()
    toolSlots([tool('Write', { file_path: 'x.py', content: 'a = 1\na = 1' })], files)
    const [slot] = toolSlots([tool('Edit', { file_path: 'x.py', old_string: 'a = 1', new_string: 'a = 2', replace_all: true })], files)
    expect(slot).toMatchObject({ kind: 'file', content: 'a = 2\na = 2', updated: true })
  })

  it('ignores edits to files never seen in the conversation', () => {
    expect(toolSlots([tool('str_replace', { path: 'mine.txt', old_str: 'a', new_str: 'b' })], new Map())).toEqual([null])
  })

  it('reads widgets and charts', () => {
    const [w, c] = toolSlots([
      tool('visualize:show_widget', { title: 'flow_diagram', widget_code: '<svg></svg>' }),
      tool('chart_display_v0', {
        style: 'bar', title: 'Sales', x_axis: { data: ['Q1', 'Q2'] }, y_axis: { title: 'USD', max: 10 },
        series: [{ name: 'A', values: [1, 2] }],
      }),
    ], new Map())
    expect(w).toEqual({ kind: 'widget', title: 'flow_diagram', code: '<svg></svg>' })
    expect(c).toMatchObject({ kind: 'chart', categories: ['Q1', 'Q2'], series: [{ name: 'A', values: [1, 2] }], yMax: 10 })
  })
})

describe('Claude import with attachments', () => {
  const conv = [{
    uuid: 'att-1', name: 'Files', created_at: '2026-10-26T09:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'Write it', content: [text('Write it')] },
      {
        sender: 'assistant',
        text: `Here you go.\n\n\`\`\`\n${PH}\n\`\`\`\n\n\`\`\`\n${PH}\n\`\`\`\n\nDone.`,
        content: [
          text('Here you go.'),
          tool('create_file', { path: '/out/notes.md', file_text: '# Notes' }),
          { type: 'tool_result' },
          tool('view', { path: '/out' }),
          text('Done.'),
        ],
      },
    ],
  }]

  it('places attachments on hidden marker lines in new imports', () => {
    const [book] = claudeExportAdapter.parse({ kind: 'file', name: 'c.json', json: conv })
    const page = book.pages[0]
    const lines = page.answer.split('\n')
    expect(page.attachments).toHaveLength(1)
    const a = page.attachments![0]
    expect(isHiddenLine(lines[a.line])).toBe(true)
    expect(lines.filter(l => !isHiddenLine(l) && l.trim())).toEqual(['Here you go.', 'Done.'])
    expect((a as FileAttachment).content).toBe('# Notes')
  })

  it('rebuilds legacy answers exactly, with attachments on placeholder lines', () => {
    const [book] = claudeExportAdapter.parse({ kind: 'file', name: 'c.json', json: conv })
    const legacy = book.legacyPages![0]
    expect(legacy.answer).toBe(conv[0].chat_messages[1].text)
    expect(legacy.attachments).toHaveLength(1)
    expect(legacy.answer.split('\n')[legacy.attachments![0].line]).toBe(PH)
  })

  it('upgrades stored pages by matching answer text', () => {
    const [book] = claudeExportAdapter.parse({ kind: 'file', name: 'c.json', json: conv })
    const stored = [{ question: 'Renamed chapter', answer: conv[0].chat_messages[1].text }]
    const upgraded = attachToStoredPages(stored, book.legacyPages!)!
    expect(upgraded[0].question).toBe('Renamed chapter')
    expect(upgraded[0].attachments).toHaveLength(1)
    expect(attachToStoredPages([{ question: 'q', answer: 'other' }], book.legacyPages!)).toBeNull()
  })
})

describe('answerMarkdown', () => {
  const file: Attachment = { kind: 'file', path: '/o/a.py', content: 'x = 1\n\n\n\ny = 2', updated: false, line: 3 }

  it('writes files in place of legacy placeholders, fences included', () => {
    const answer = `Intro\n\n\`\`\`\n${PH}\n\`\`\`\n\nOutro`
    expect(answerMarkdown({ question: 'q', answer, attachments: [file] }))
      .toBe('Intro\n\n**File: `a.py`**\n\n```py\nx = 1\n\n\n\ny = 2\n```\n\nOutro')
  })

  it('keeps a preceding code block intact next to a new-style marker', () => {
    const answer = '```js\nlet a\n```\n\n[[structura:attachment:0]]'
    const chart: Attachment = { kind: 'chart', title: 'T', style: 'bar', categories: ['a'], series: [{ name: 'S', values: [3] }], line: 4 }
    expect(answerMarkdown({ question: 'q', answer, attachments: [chart] }))
      .toBe('```js\nlet a\n```\n\n**Chart: T**\n\n| | S |\n|---|---|\n| a | 3 |')
  })
})
