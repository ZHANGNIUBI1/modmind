import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { UtilityProcess, utilityProcess } from 'electron'
import {
  isReadOnlySafeTool,
  pluginMcpToolName,
  type PluginRecord,
  type PluginToolDescriptor
} from '../shared/plugins'

export interface PluginRuntimeOptions {
  /** 插件宿主脚本 host.mjs 的绝对路径。 */
  hostScriptPath: string
  /** 插件私有数据根目录（userData/plugins/.data）。 */
  dataRootDirectory: string
  /** 当前项目信息提供者；返回 null 表示无项目。 */
  projectInfo: () => { name: string; path: string; kind: string } | null
  /** 宿主桥网络请求实现；仅声明 net.fetch 的插件可通过 ctx 触达。 */
  netFetch?: typeof fetch
  /** 系统剪贴板写入实现。 */
  clipboardWrite?: (text: string) => void | Promise<void>
  /** 测试注入点；生产态使用 Electron utilityProcess.fork。 */
  forkHost?: typeof utilityProcess.fork
  /** 后端入口启动状态，用于管理页展示。 */
  onRuntimeError?: (pluginId: string, error: string | null) => void
  /** 日志钩子（接入诊断体系）。 */
  log?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void
}

interface HostProcess {
  child: UtilityProcess
  pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>
  ready: Promise<void>
  crashed: boolean
}

const TOOL_CALL_TIMEOUT_MS = 30_000
const MAX_FETCH_RESPONSE_BYTES = 2 * 1024 * 1024

export class PluginRuntime {
  private readonly options: PluginRuntimeOptions
  private readonly hosts = new Map<string, HostProcess>()
  private readonly storageWriteTails = new Map<string, Promise<void>>()
  private records: Map<string, PluginRecord> = new Map()

  constructor(options: PluginRuntimeOptions) {
    this.options = options
  }

  /** 与 PluginService 的注册表保持同步（只读引用）。 */
  syncRecords(records: Map<string, PluginRecord>): void {
    const previous = this.records
    this.records = new Map(records)
    // 卸载、禁用、报错或内容修订变化都会使旧宿主失效。
    for (const [pluginId] of this.hosts) {
      const record = records.get(pluginId)
      const oldRecord = previous.get(pluginId)
      if (!record || !record.enabled || record.error || record.runtimeError || !oldRecord || this.recordSignature(oldRecord) !== this.recordSignature(record)) {
        this.terminate(pluginId)
      }
    }
  }

  listToolDescriptors(): PluginToolDescriptor[] {
    const descriptors: PluginToolDescriptor[] = []
    for (const record of this.records.values()) {
      if (!record.enabled || record.error || record.runtimeError || !record.manifest.backend) continue
      for (const tool of record.manifest.backend.tools) {
        descriptors.push({
          name: pluginMcpToolName(record.manifest.id, tool.name),
          description: `[${record.manifest.name}] ${tool.description}`,
          ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
          pluginId: record.manifest.id,
          toolName: tool.name,
          scope: record.scope
        })
      }
    }
    return descriptors
  }

  findTool(name: string): { descriptor: PluginToolDescriptor; record: PluginRecord } | undefined {
    for (const descriptor of this.listToolDescriptors()) {
      if (descriptor.name === name) {
        const record = this.records.get(descriptor.pluginId)
        if (record) return { descriptor, record }
      }
    }
    return undefined
  }

  async callTool(pluginId: string, toolName: string, input: unknown): Promise<unknown> {
    const record = this.records.get(pluginId)
    if (!record) throw new Error(`未找到插件：${pluginId}`)
    const unavailable = record.error ?? record.runtimeError
    if (!record.enabled || unavailable) throw new Error(`插件不可用：${pluginId}${unavailable ? `（${unavailable}）` : ''}`)
    const declaration = record.manifest.backend?.tools.find((tool) => tool.name === toolName)
    if (!declaration || !record.manifest.backend) throw new Error(`插件 ${pluginId} 未声明工具 ${toolName}`)

    const host = await this.ensureHost(record)
    return this.request(host, {
      kind: 'call',
      tool: toolName,
      input: input ?? {}
    }, TOOL_CALL_TIMEOUT_MS)
  }

  terminate(pluginId: string): void {
    const host = this.hosts.get(pluginId)
    if (!host) return
    this.hosts.delete(pluginId)
    try {
      host.child.kill()
    } catch {
      // 进程可能已退出
    }
    for (const [, entry] of host.pending) entry.reject(new Error('插件宿主已停止'))
    host.pending.clear()
  }

  terminateAll(): void {
    for (const pluginId of [...this.hosts.keys()]) this.terminate(pluginId)
  }

  // -------------------------------------------------------------------------

  private ensureHost(record: PluginRecord): Promise<HostProcess> {
    const existing = this.hosts.get(record.manifest.id)
    if (existing && !existing.crashed) return existing.ready.then(() => existing)
    if (existing) this.terminate(record.manifest.id)

    const manifest = record.manifest
    if (!manifest.backend) throw new Error(`插件 ${manifest.id} 没有后端`)

    const entryPath = path.resolve(record.directory, manifest.backend.entry)
    const storageDirectory = path.join(this.options.dataRootDirectory, manifest.id)
    const bootstrap = {
      pluginId: manifest.id,
      permissions: manifest.permissions,
      storageDirectory
    }

    const forkOptions = { serviceName: `modmind-plugin-${manifest.id}`, stdio: 'ignore' as const }
    const child = this.options.forkHost
      ? this.options.forkHost(this.options.hostScriptPath, [entryPath, JSON.stringify(bootstrap)], forkOptions)
      : utilityProcess.fork(this.options.hostScriptPath, [entryPath, JSON.stringify(bootstrap)], forkOptions)

    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    let resolveReady: (() => void) | undefined
    let rejectReady: ((error: Error) => void) | undefined
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    const host: HostProcess = { child, pending, ready, crashed: false }
    let readySettled = false

    const failStartup = (error: Error): void => {
      if (readySettled) return
      readySettled = true
      host.crashed = true
      rejectReady?.(error)
      this.options.onRuntimeError?.(manifest.id, error.message)
      try { child.kill() } catch { /* 进程可能已经退出 */ }
    }

    child.on('message', (event: unknown) => {
      const data = event as { id?: string; kind?: string; ok?: boolean; result?: unknown; error?: string; op?: string; args?: unknown; level?: 'info' | 'warn' | 'error'; message?: string; registeredTools?: string[] }
      if (!data || typeof data !== 'object') return

      if (data.kind === 'ready') {
        const registered = new Set(Array.isArray(data.registeredTools) ? data.registeredTools : [])
        const missing = manifest.backend?.tools.map((tool) => tool.name).filter((name) => !registered.has(name)) ?? []
        if (missing.length > 0) {
          failStartup(new Error(`后端未注册 manifest 中声明的工具：${missing.join(', ')}`))
          return
        }
        readySettled = true
        this.options.onRuntimeError?.(manifest.id, null)
        resolveReady?.()
        return
      }
      if (data.kind === 'failed') {
        failStartup(new Error(data.error ?? '插件启动失败'))
        return
      }
      if (data.kind === 'log') {
        this.options.log?.(data.level ?? 'info', `[${manifest.id}] ${data.message ?? ''}`)
        return
      }
      if (data.kind === 'ctx' && typeof data.id === 'string') {
        const args = data.args && typeof data.args === 'object' ? data.args as Record<string, unknown> : {}
        void this.handleContextOp(manifest.id, String(data.op ?? ''), args).then((result) => {
          child.postMessage({ id: data.id, kind: 'ctx', ok: true, result })
        }).catch((error: unknown) => {
          child.postMessage({ id: data.id, kind: 'ctx', ok: false, error: error instanceof Error ? error.message : String(error) })
        })
        return
      }
      if (typeof data.id === 'string') {
        const contextEntry = pending.get(data.id)
        if (!contextEntry) return
        pending.delete(data.id)
        if (data.ok) contextEntry.resolve(data.result)
        else contextEntry.reject(new Error(data.error ?? '插件调用失败'))
      }
    })

    child.on('exit', () => {
      host.crashed = true
      if (!readySettled) {
        readySettled = true
        const error = new Error('插件宿主进程在就绪前退出')
        rejectReady?.(error)
        this.options.onRuntimeError?.(manifest.id, error.message)
      }
      for (const [, entry] of host.pending) entry.reject(new Error('插件宿主进程已退出'))
      host.pending.clear()
    })

    this.hosts.set(manifest.id, host)

    // 就绪超时保护
    const timeout = setTimeout(() => failStartup(new Error(`插件 ${manifest.id} 启动超时`)), 15_000)
    void ready.then(() => clearTimeout(timeout), () => clearTimeout(timeout))

    return ready.then(() => host)
  }

  private request(host: HostProcess, payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        host.pending.delete(id)
        reject(new Error('插件工具调用超时（30s）'))
      }, timeoutMs)
      host.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) }
      })
      try {
        host.child.postMessage({ id, ...payload })
      } catch (error) {
        clearTimeout(timer)
        host.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  // -------------------------------------------------------------------------
  // 面板桥：供沙箱面板经渲染进程 IPC 调用的宿主能力实现
  // -------------------------------------------------------------------------

  async handleContextOp(pluginId: string, op: string, args: Record<string, unknown>): Promise<unknown> {
    const record = this.records.get(pluginId)
    if (!record || !record.enabled || record.error || record.runtimeError) throw new Error(`插件不可用：${pluginId}`)

    switch (op) {
      case 'projectInfo': {
        if (!record.manifest.permissions.includes('project.read')) throw new Error('缺少权限：project.read')
        return this.options.projectInfo()
      }
      case 'storageGet': {
        if (!record.manifest.permissions.includes('storage')) throw new Error('缺少权限：storage')
        await this.storageWriteTails.get(record.manifest.id)?.catch(() => undefined)
        const file = this.storageFile(record.manifest.id)
        const store = await this.readStore(file)
        return store[String(args.key)] ?? null
      }
      case 'storageSet': {
        if (!record.manifest.permissions.includes('storage')) throw new Error('缺少权限：storage')
        await this.enqueueStorageWrite(record.manifest.id, async () => {
          const file = this.storageFile(record.manifest.id)
          const store = await this.readStore(file)
          store[String(args.key)] = args.value ?? null
          await fs.mkdir(path.dirname(file), { recursive: true })
          const pending = `${file}.pending-${process.pid}-${randomUUID()}`
          await fs.writeFile(pending, JSON.stringify(store, null, 2), 'utf8')
          await fs.rename(pending, file).catch(async () => {
            await fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8')
            await fs.rm(pending, { force: true }).catch(() => undefined)
          })
        })
        return null
      }
      case 'netFetch': {
        if (!record.manifest.permissions.includes('net.fetch')) throw new Error('缺少权限：net.fetch')
        if (!this.options.netFetch) throw new Error('网络能力未配置')
        const url = String(args.url ?? '')
        if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http(s) URL')
        const init = (args.init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string }
        const response = await this.options.netFetch(url, {
          method: init.method ?? 'GET',
          headers: init.headers,
          body: init.body,
          signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT_MS)
        })
        const contentLength = Number(response.headers.get('content-length') ?? '0')
        if (Number.isFinite(contentLength) && contentLength > MAX_FETCH_RESPONSE_BYTES) throw new Error('网络响应超过 2 MiB')
        const chunks: Buffer[] = []
        let total = 0
        if (response.body) {
          const reader = response.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_FETCH_RESPONSE_BYTES) {
              await reader.cancel()
              throw new Error('网络响应超过 2 MiB')
            }
            chunks.push(Buffer.from(value))
          }
        }
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: Buffer.concat(chunks).toString('utf8') }
      }
      case 'pluginTool': {
        const toolName = String(args.toolName ?? '')
        const target = record.manifest.backend?.tools.find((tool) => tool.name === toolName)
        if (!target) throw new Error(`工具不存在：${toolName}`)
        return this.callTool(pluginId, toolName, args.input)
      }
      case 'clipboardWrite': {
        if (!record.manifest.permissions.includes('clipboard.write')) throw new Error('缺少权限：clipboard.write')
        if (!this.options.clipboardWrite) throw new Error('剪贴板能力未配置')
        await this.options.clipboardWrite(String(args.text ?? ''))
        return { written: true }
      }
      default:
        throw new Error(`未知上下文操作：${op}`)
    }
  }

  private storageFile(pluginId: string): string {
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(pluginId)) throw new Error('非法插件 id')
    return path.join(this.options.dataRootDirectory, `${pluginId}.json`)
  }

  private async readStore(file: string): Promise<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private async enqueueStorageWrite(pluginId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.storageWriteTails.get(pluginId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    this.storageWriteTails.set(pluginId, current)
    try {
      await current
    } finally {
      if (this.storageWriteTails.get(pluginId) === current) this.storageWriteTails.delete(pluginId)
    }
  }

  private recordSignature(record: PluginRecord): string {
    return JSON.stringify({
      directory: record.directory,
      scope: record.scope,
      enabled: record.enabled,
      revision: record.revision ?? 0,
      error: record.error ?? null,
      runtimeError: record.runtimeError ?? null,
      manifest: record.manifest
    })
  }

  /** 只读模式下是否放行某工具（对齐 READ_ONLY_DENIED_ACTIONS）。 */
  static isReadOnlyAllowed(descriptor: PluginToolDescriptor): boolean {
    return isReadOnlySafeTool({
      name: descriptor.toolName,
      description: descriptor.description,
      ...(descriptor.inputSchema ? { inputSchema: descriptor.inputSchema } : {}),
      ...(descriptor.annotations ? { annotations: descriptor.annotations } : {})
    })
  }
}
