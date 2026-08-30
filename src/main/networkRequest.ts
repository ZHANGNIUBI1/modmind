import { Agent, ProxyAgent, interceptors, request } from 'undici'

export interface FetchTextOptions {
  timeoutMs?: number
  attempts?: number
  headers?: Record<string, string>
  signal?: AbortSignal
  method?: 'GET' | 'POST'
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_ATTEMPTS = 3

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Metadata endpoints (Modrinth, CurseForge, mappings.dev, GitHub API) are hit
 * constantly with tiny JSON requests and are frequently reset by hostile or
 * congested networks. A single attempt makes the whole feature fail; short
 * backoff retries recover most of those failures.
 */
export async function fetchJsonWithRetry<T>(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; attempts?: number }): Promise<T> {
  const text = await fetchTextWithRetry(url, init)
  return JSON.parse(text) as T
}

export async function postJsonWithRetry<T>(url: string, body: unknown, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<T> {
  const text = await fetchTextWithRetry(url, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  }, JSON.stringify(body))
  return JSON.parse(text) as T
}

export async function fetchTextWithRetry(url: string, options: FetchTextOptions = {}, body?: string): Promise<string> {
  const attempts = Math.min(Math.max(options.attempts ?? DEFAULT_ATTEMPTS, 1), 5)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await proxiedUndiciRequest(url, {
        method: options.method ?? 'GET',
        headers: { 'User-Agent': 'ModMind/1.4 (network-request)', ...(options.headers ?? {}) },
        signal: options.signal,
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
        ...(body !== undefined ? { body } : {})
      })
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.statusCode}`)
      return await response.body.text()
    } catch (error) {
      lastError = error
      if (options.signal?.aborted || attempt >= attempts) break
      await delay(attempt * 350)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * The global fetch ignores HTTP(S)_PROXY environment variables, so users who
 * need a proxy to reach Mojang/GitHub/Modrinth hosts would always download
 * directly. Route requests through undici with a ProxyAgent when configured.
 */
let proxyOverrideUrl = ''
let proxyOverrideAgent: ProxyAgent | undefined

function newProxyAgent(proxyUrl: string): ProxyAgent | undefined {
  try {
    return new ProxyAgent(/^[a-z][a-z0-9+.-]*:\/\//i.test(proxyUrl) ? proxyUrl : `http://${proxyUrl}`)
  } catch {
    return undefined
  }
}

/**
 * Application-configured proxy (设置→网络). Takes precedence over the
 * HTTPS_PROXY environment variables; pass an empty string to clear it.
 */
export function setNetworkProxy(url: string): void {
  const trimmed = url.trim()
  if (trimmed === proxyOverrideUrl) return
  void proxyOverrideAgent?.close().catch(() => undefined)
  proxyOverrideUrl = trimmed
  proxyOverrideAgent = trimmed ? newProxyAgent(trimmed) : undefined
}

/**
 * Hosts that must never be routed through the configured proxy: MC百科 and
 * Gitee are China-only services whose anti-abuse defenses may reject foreign
 * exit IPs, and loopback targets are always local.
 */
const DIRECT_HOST_SUFFIXES = ['mcmod.cn', 'gitee.com', 'localhost']
const DIRECT_HOST_PREFIXES = ['127.']

function shouldBypassProxy(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return DIRECT_HOST_PREFIXES.some((prefix) => host.startsWith(prefix))
      || DIRECT_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

export function proxyDispatcher(url?: string): ProxyAgent | undefined {
  if (proxyOverrideUrl) {
    if (url && shouldBypassProxy(url)) return undefined
    if (proxyOverrideAgent) return proxyOverrideAgent
  }
  if (url && (process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy) && shouldBypassProxy(url)) return undefined
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  const trimmed = proxyUrl?.trim()
  if (!trimmed) return undefined
  return newProxyAgent(trimmed)
}

export interface ProxiedRequestOptions {
  method?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  bodyTimeout?: number
  headersTimeout?: number
  body?: string
}

export interface ProxiedResponse {
  ok: boolean
  statusCode: number
  headers: { get(name: string): string | null }
  /** undici's body is already a Node readable; it also exposes .text(). */
  body: NodeJS.ReadableStream & { text(): Promise<string> }
}

/**
 * Indirection point so tests can intercept transport without real sockets
 * (mirrors how the global fetch used to be stubbed).
 */
export const httpTransport = {
  request: actualProxiedRequest
}

export async function proxiedUndiciRequest(url: string, options: ProxiedRequestOptions): Promise<ProxiedResponse> {
  return await httpTransport.request(url, options)
}

async function actualProxiedRequest(url: string, options: ProxiedRequestOptions): Promise<ProxiedResponse> {
  // A custom dispatcher cannot take maxRedirections, so always compose the
  // redirect interceptor — with a ProxyAgent when configured, a default Agent
  // otherwise.
  const base = proxyDispatcher(url) ?? new Agent()
  const response = await request(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    signal: options.signal,
    bodyTimeout: options.bodyTimeout,
    headersTimeout: options.headersTimeout,
    ...(options.body !== undefined ? { body: options.body } : {}),
    dispatcher: base.compose(interceptors.redirect({ maxRedirections: 5 }))
  })
  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    statusCode: response.statusCode,
    headers: { get: (name) => response.headers[String(name).toLowerCase()]?.toString() ?? null },
    body: response.body as unknown as ProxiedResponse['body']
  }
}
