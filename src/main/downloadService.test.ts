import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadManager } from './downloadService'

const roots: string[] = []
const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})
function server(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const instance = http.createServer(handler)
  servers.push(instance)
  return new Promise((resolve) => instance.listen(0, '127.0.0.1', () => {
    const address = instance.address() as { port: number }
    resolve({ url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((done) => instance.close(() => done())) })
  }))
}

describe('verified download manager', () => {
  it('falls back to the next source and atomically verifies the result', async () => {
    const source = await server((_request, response) => { response.statusCode = 503; response.end('offline') })
    const good = await server((_request, response) => { response.end('modmind-fixture') })
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-download-'))
    roots.push(root)
    const value = Buffer.from('modmind-fixture')
    const result = await new DownloadManager().download({
      sources: [
        { id: 'bad', label: 'bad mirror', url: source.url },
        { id: 'good', label: 'good mirror', url: good.url }
      ],
      destination: path.join(root, 'mods', 'example.jar'),
      retriesPerSource: 1,
      expectedHash: { algorithm: 'sha256', value: createHash('sha256').update(value).digest('hex') }
    })
    expect(result.source.id).toBe('good')
    expect(await fs.readFile(result.destination)).toEqual(value)
    expect(result.failures).toHaveLength(1)
  })

  it('never leaves a corrupt destination after a hash failure', async () => {
    const source = await server((_request, response) => { response.end('wrong') })
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-download-hash-'))
    roots.push(root)
    const destination = path.join(root, 'example.jar')
    await expect(new DownloadManager().download({
      sources: [{ id: 'only', label: 'only', url: source.url }],
      destination,
      retriesPerSource: 1,
      expectedHash: { algorithm: 'sha256', value: '0'.repeat(64) }
    })).rejects.toThrow(/all download sources failed/)
    await expect(fs.access(destination)).rejects.toThrow()
  })
})
