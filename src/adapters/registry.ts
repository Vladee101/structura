import type { AdapterInput, ParsedConversation } from './types'
import { AdapterError } from './types'
import { chatgptExportAdapter } from './chatgptExport'
import { claudeExportAdapter } from './claudeExport'
import { deepseekExportAdapter } from './deepseekExport'
import { pasteAdapter } from './paste'

const adapters = [chatgptExportAdapter, deepseekExportAdapter, claudeExportAdapter, pasteAdapter]

export function parseInput(input: AdapterInput): ParsedConversation[] {
  const adapter = adapters.find(a => a.detect(input))
  if (!adapter) throw new AdapterError('No adapter could handle this input.')
  return adapter.parse(input)
}
