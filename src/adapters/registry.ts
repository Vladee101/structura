import type { AdapterInput, ParsedConversation } from './types'
import { AdapterError } from './types'
import { chatgptExportAdapter } from './chatgptExport'
import { claudeExportAdapter, readClaudeDownloadManifest } from './claudeExport'
import { deepseekExportAdapter } from './deepseekExport'
import { pasteAdapter } from './paste'

const adapters = [chatgptExportAdapter, deepseekExportAdapter, claudeExportAdapter, pasteAdapter]

export function parseInput(input: AdapterInput): ParsedConversation[] {
  if (input.kind === 'file' && readClaudeDownloadManifest(input.json)) {
    throw new AdapterError(
      'This is the Claude export manifest, which only lists download links. ' +
      'Download the "conversations" file it links to (conversations-000.zip) and import that instead.'
    )
  }
  const adapter = adapters.find(a => a.detect(input))
  if (!adapter) throw new AdapterError('No adapter could handle this input.')
  return adapter.parse(input)
}
