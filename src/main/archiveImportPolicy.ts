export interface ZipExpansionState {
  entryCount: number
  expandedBytes: number
}

export interface ZipExpansionEntry {
  fileName: string
  uncompressedSize: number
}

export function recordZipExpansion(state: ZipExpansionState, entry: ZipExpansionEntry): void {
  state.entryCount += 1
  state.expandedBytes += entry.uncompressedSize
  if (state.entryCount > 20_000) throw new Error('ZIP archive contains more than 20,000 entries')
  if (entry.uncompressedSize > 256 * 1024 * 1024) throw new Error(`ZIP entry is too large: ${entry.fileName}`)
  if (state.expandedBytes > 2 * 1024 * 1024 * 1024) throw new Error('ZIP expanded size exceeds the 2 GB import limit')
}
