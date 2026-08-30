import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchTextWithRetry, postJsonWithRetry, proxyDispatcher, setNetworkProxy } from './networkRequest'

let server: Server
const hitCounts = new Map<string, number>()
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    const key = `${req.method} ${req.url}`
    const hits = (hitCounts.get(key) ?? 0) + 1
    hitCounts.set(key, hits)

    if (req.url === '/flaky' && req.method === 'GET' && hits === 1) {
      res.writeHead(502)
      res.end('bad gateway')
      return
    }

    if (req.method === 'POST') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ echoed: body ? JSON.parse(body) : null }))
      })
      return
    }

    res.writeHead(200)
    res.end(`fine for ${req.url}`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('networkRequest helpers', () => {
  it('surfaces the last HTTP status after exhausting attempts', async () => {
    await expect(fetchTextWithRetry(`http://127.0.0.1:${port}/flaky`, { attempts: 1 })).rejects.toThrow(/HTTP 502/)
  })

  it('retries and succeeds on a later attempt', async () => {
    const text = await fetchTextWithRetry(`http://127.0.0.1:${port}/flaky`, { attempts: 3 })
    expect(text).toContain('/flaky')
    expect(hitCounts.get('GET /flaky')).toBeGreaterThanOrEqual(2)
  })

  it('does not retry when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchTextWithRetry(`http://127.0.0.1:${port}/aborted`, { signal: controller.signal, attempts: 3 })).rejects.toThrow()
    expect(hitCounts.has('GET /aborted')).toBe(false)
  })

  it('round-trips a JSON POST body', async () => {
    const result = await postJsonWithRetry<{ echoed?: { probe?: boolean } }>(`http://127.0.0.1:${port}/echo`, { probe: true })
    expect(result.echoed?.probe).toBe(true)
  })
})

describe('configured network proxy', () => {
  afterAll(() => {
    setNetworkProxy('')
  })

  it('activates a dispatcher for foreign hosts once configured', () => {
    expect(proxyDispatcher('https://api.curseforge.com/v1/games')).toBeUndefined()
    setNetworkProxy('http://127.0.0.1:7890')
    const dispatcher = proxyDispatcher('https://api.curseforge.com/v1/games')
    expect(dispatcher).toBeDefined()
    // Same cached instance while the configured URL stays unchanged.
    expect(proxyDispatcher('https://edge.forgecdn.net/files/1/1/mod.jar')).toBe(dispatcher)
  })

  it('keeps China-only hosts and loopback direct even with a proxy configured', () => {
    setNetworkProxy('http://127.0.0.1:7890')
    expect(proxyDispatcher('https://www.mcmod.cn/')).toBeUndefined()
    expect(proxyDispatcher('https://search.mcmod.cn/s')).toBeUndefined()
    expect(proxyDispatcher('https://gitee.com/api/v5/user')).toBeUndefined()
    expect(proxyDispatcher(`http://127.0.0.1:${port}/echo`)).toBeUndefined()
    expect(proxyDispatcher('http://localhost:8080/health')).toBeUndefined()
  })

  it('clears the override when reset to empty', () => {
    setNetworkProxy('http://127.0.0.1:7890')
    setNetworkProxy('')
    expect(proxyDispatcher('https://api.curseforge.com/v1/games')).toBeUndefined()
  })

  it('still bypasses China-only hosts when only the environment proxy is set', () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890'
    try {
      expect(proxyDispatcher('https://www.mcmod.cn/')).toBeUndefined()
      expect(proxyDispatcher('https://api.curseforge.com/v1/games')).toBeDefined()
    } finally {
      delete process.env.HTTPS_PROXY
    }
  })
})
