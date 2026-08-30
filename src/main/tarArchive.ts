import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { createGunzip } from 'node:zlib'
import type { ZipExpansionEntry } from './archiveImportPolicy'

export type ArchiveEntryCallback = (entry: ZipExpansionEntry) => void

function text(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/\0+$/, '').trim()
}

function octal(buffer: Buffer): number {
  const value = text(buffer).replace(/^\x00+/, '')
  if (!value) return 0
  const parsed = Number.parseInt(value.replace(/[^0-7].*$/, ''), 8)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('TAR entry has an invalid size')
  return parsed
}

function safeEntryPath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some((part) => !part || part === '..')) {
    throw new Error(`TAR entry path is unsafe: ${value}`)
  }
  return normalized
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false
  return true
}

function parsePaxPath(payload: Buffer): string | undefined {
  const value = payload.toString('utf8')
  for (const record of value.split(/(?=\d+ )/)) {
    const match = record.match(/^\d+ path=(.*?)(?:\n|$)/s)
    if (match?.[1]) return match[1]
  }
  return undefined
}

/** Detects POSIX/GNU tar, including tar streams compressed with gzip. */
export function archiveSignature(buffer: Buffer): 'tar' | 'gzip' | 'zip' | 'unknown' {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return 'gzip'
  if (buffer.length >= 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar') return 'tar'
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'PK\x03\x04') return 'zip'
  return 'unknown'
}

export async function archiveSignatureForFile(filePath: string): Promise<'tar' | 'gzip' | 'zip' | 'unknown'> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(512)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return archiveSignature(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export async function extractTar(filePath: string, destination: string, onEntry?: ArchiveEntryCallback): Promise<void> {
  const source = createReadStream(filePath)
  const signature = await archiveSignatureForFile(filePath)
  const input: AsyncIterable<Buffer> = signature === 'gzip' ? source.pipe(createGunzip()) : source
  let pending = Buffer.alloc(0)
  let longPath: string | undefined
  let paxPath: string | undefined
  let finished = false

  const take = (size: number): Buffer | null => {
    if (pending.length < size) return null
    const result = pending.subarray(0, size)
    pending = pending.subarray(size)
    return result
  }

  for await (const chunk of input) {
    pending = Buffer.concat([pending, chunk])
    while (!finished) {
      const header = take(512)
      if (!header) break
      if (isZeroBlock(header)) {
        finished = true
        break
      }
      const type = text(header.subarray(156, 157)) || '0'
      const name = text(header.subarray(0, 100))
      const prefix = text(header.subarray(345, 500))
      const headerPath = prefix ? `${prefix}/${name}` : name
      const size = octal(header.subarray(124, 136))
      const blocks = Math.ceil(size / 512)
      if (pending.length < blocks * 512) {
        pending = Buffer.concat([header, pending])
        break
      }
      const payload = take(blocks * 512)!.subarray(0, size)
      if (type === 'x') {
        paxPath = parsePaxPath(payload)
        continue
      }
      if (type === 'L') {
        longPath = payload.toString('utf8').replace(/\0+$/, '')
        continue
      }
      const entryPath = safeEntryPath(paxPath ?? longPath ?? headerPath)
      paxPath = undefined
      longPath = undefined
      onEntry?.({ fileName: entryPath, uncompressedSize: size })
      const target = path.resolve(destination, ...entryPath.split('/'))
      const root = path.resolve(destination)
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`TAR entry escapes extraction directory: ${entryPath}`)
      if (type === '5') {
        await fs.mkdir(target, { recursive: true })
      } else if (type === '0') {
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, payload)
      }
    }
  }
  if (!finished) throw new Error('TAR archive ended before its end-of-archive marker')
}
