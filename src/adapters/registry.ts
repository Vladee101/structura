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
  const conversations = adapter.parse(input)
  // Recognised but nothing readable usually means the provider changed its export format.
  if (conversations.length === 0 && input.kind === 'file') {
    throw new AdapterError(
      `This looks like a ${adapter.displayName.replace(/ Export$/, '')} export, but no conversations could be read from it. ` +
      'The format may have changed — please open an issue with a redacted sample.'
    )
  }
  return conversations
}
