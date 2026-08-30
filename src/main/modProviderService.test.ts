import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpTransport, type ProxiedRequestOptions, type ProxiedResponse } from './networkRequest'
import { curseForgeFingerprint, CurseForgeProvider, ModrinthProvider } from './modProviderService'

function jsonResponse(payload: unknown, status = 200): ProxiedResponse {
  const text = JSON.stringify(payload)
  const body = Object.assign(Readable.from([Buffer.from(text)]), {
    text: async () => text
  })
  return {
    ok: status >= 200 && status < 300,
    statusCode: status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    body: body as unknown as ProxiedResponse['body']
  }
}

function urlOf(url: string, options?: ProxiedRequestOptions): string {
  void options
  return String(url)
}

afterEach(() => vi.restoreAllMocks())

describe('mod provider adapters', () => {
  it('normalizes Modrinth search and version files with compatibility filters', async () => {
    const fetcher = vi.fn(async (input: string, options?: ProxiedRequestOptions) => {
      const url = urlOf(input, options)
      if (url.includes('/search?')) return jsonResponse({ total_hits: 1, hits: [{ project_id: 'abc', slug: 'example', title: 'Example', description: 'desc', client_side: 'required', server_side: 'optional', downloads: 4 }] })
      return jsonResponse([{ id: 'v1', version_number: '1.0', server_side: 'required', dependencies: [{ project_id: 'fabric-api', version_id: 'api-v1', dependency_type: 'required' }], files: [{ url: 'https://cdn.example.test/example.jar', filename: 'fabric-api-0.116.0+1.21.1.jar', primary: true, hashes: { sha512: 'a'.repeat(128) } }, { url: 'https://cdn.example.test/example-sources.jar', filename: 'fabric-api-0.116.0+1.21.1-sources.jar', hashes: { sha1: 'b'.repeat(40) } }] }])
    })
    vi.spyOn(httpTransport, 'request').mockImplementation(fetcher)
    const provider = new ModrinthProvider()
    const search = await provider.search({ query: 'example', minecraftVersion: '1.21.1', loader: 'fabric' })
    expect(search.hits[0]).toMatchObject({ projectId: 'abc', slug: 'example', downloads: 4 })
    const versions = await provider.versions('abc', { minecraftVersion: '1.21.1', loader: 'fabric' })
    expect(versions[0]).toMatchObject({ filename: 'fabric-api-0.116.0+1.21.1.jar', sha512: 'a'.repeat(128), dependencies: [{ provider: 'modrinth', projectId: 'fabric-api', versionId: 'api-v1', kind: 'required' }], referenceArtifacts: [{ kind: 'sources', filename: 'fabric-api-0.116.0+1.21.1-sources.jar' }] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('requires a CurseForge key and maps API files to verified sources', async () => {
    expect(() => new CurseForgeProvider('')).toThrow(/API key/)
    vi.spyOn(httpTransport, 'request').mockImplementation(async () => jsonResponse({ data: [{ id: 10, slug: 'example', name: 'Example', summary: 'desc', downloadCount: 2 }] }))
    const provider = new CurseForgeProvider('secret')
    const result = await provider.search({ query: 'example', minecraftVersion: '1.20.1', loader: 'forge' })
    expect(result.hits[0]).toMatchObject({ projectId: '10', provider: 'curseforge' })
  })

  it('rejects provider file names that could escape the mods directory', async () => {
    vi.spyOn(httpTransport, 'request').mockImplementation(async () => jsonResponse([{ id: 'v1', files: [{ url: 'https://cdn.example.test/example.jar', filename: '../escape.jar', primary: true }] }]))
    const provider = new ModrinthProvider()
    await expect(provider.versions('abc', { minecraftVersion: '1.21.1', loader: 'fabric' })).resolves.toEqual([])
  })

  it('marks a version as client-only when Modrinth declares its server environment unsupported', async () => {
    vi.spyOn(httpTransport, 'request').mockImplementation(async () => jsonResponse([{ id: 'v1', client_side: 'required', server_side: 'unsupported', files: [{ url: 'https://cdn.example.test/client.jar', filename: 'client.jar', primary: true }] }]))
    const provider = new ModrinthProvider()
    await expect(provider.versions('client', { minecraftVersion: '1.21.1', loader: 'fabric' })).resolves.toMatchObject([{ side: 'client' }])
  })

  it('identifies an exact Modrinth file by SHA-1 and loads project identity', async () => {
    vi.spyOn(httpTransport, 'request').mockImplementation(async (input: string) => {
      const url = String(input)
      if (url.includes('/version_file/')) return jsonResponse({ id: 'v1', project_id: 'create', version_number: '6.0.5', loaders: ['fabric'], game_versions: ['1.21.1'], files: [{ url: 'https://cdn.example.test/create.jar', filename: 'create.jar', primary: true, hashes: { sha1: 'a'.repeat(40) } }] })
      return jsonResponse({ id: 'create', slug: 'create', title: 'Create', source_url: 'https://github.com/example/create', license: { id: 'MIT' } })
    })
    const result = await new ModrinthProvider().identify({ sha1: 'a'.repeat(40) }, { minecraftVersion: '1.21.1', loader: 'fabric' })
    expect(result).toMatchObject({ candidate: { projectId: 'create', name: 'Create' }, file: { versionId: 'v1', versionName: '6.0.5' } })
  })

  it('uses CurseForge whitespace-insensitive fingerprints', () => {
    expect(curseForgeFingerprint(Buffer.from('abc \r\n\tdef'))).toBe(curseForgeFingerprint(Buffer.from('abcdef')))
  })
})
