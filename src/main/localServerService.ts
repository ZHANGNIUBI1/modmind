import path from 'node:path'
import type { ProjectInfo } from '../shared/types'
import type { LocalServerEvent, LocalServerOperationProgress, LocalServerState } from '../shared/minecraft'
import { buildServerPack, installServerRuntime } from './serverPackService'
import { ServerProcess, type ServerProcessOptions } from './serverVerificationService'

export interface LocalServerStartOptions {
  port?: number
  acceptEula?: boolean
  onlineMode?: boolean
}

export interface LocalServerManagerOptions {
  getProject: () => ProjectInfo | null
  getJavaPath: () => Promise<string>
  onState: (state: LocalServerState) => void
  onEvent: (event: LocalServerEvent) => void
}

function dataDirectory(_project: ProjectInfo): '.modmind' {
  return '.modmind'
}

function validPort(value: number | undefined): number {
  const port = Number.isInteger(value) ? value! : 25565
  if (port < 1024 || port > 65535) throw new Error('本机服务端端口需要在 1024-65535 之间')
  return port
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class LocalServerManager {
  private readonly getProject: LocalServerManagerOptions['getProject']
  private readonly getJavaPath: LocalServerManagerOptions['getJavaPath']
  private readonly onState: LocalServerManagerOptions['onState']
  private readonly onEvent: LocalServerManagerOptions['onEvent']
  private process: ServerProcess | null = null
  private startPromise: Promise<LocalServerState> | null = null
  private lastProgressUpdateAt = 0
  private state: LocalServerState = {
    stage: 'idle',
    minecraftVersion: '',
    running: false,
    recentLogs: [],
    message: '本机服务端尚未启动'
  }

  constructor(options: LocalServerManagerOptions) {
    this.getProject = options.getProject
    this.getJavaPath = options.getJavaPath
    this.onState = options.onState
    this.onEvent = options.onEvent
  }

  getState(): LocalServerState {
    return {
      ...this.state,
      recentLogs: this.state.recentLogs.map((entry) => ({ ...entry })),
      operationProgress: this.state.operationProgress ? { ...this.state.operationProgress } : undefined
    }
  }

  isRunning(): boolean { return Boolean(this.process?.isRunning()) }

  recordOperation(message: string, level: LocalServerEvent['level'] = 'info', logPath?: string): void {
    if (logPath) this.state = { ...this.state, logPath }
    this.capture(message, level)
  }

  setOperationProgress(progress: LocalServerOperationProgress): void {
    const fraction = progress.fraction === undefined ? undefined : Math.min(Math.max(progress.fraction, 0), 1)
    const next = { ...progress, fraction }
    const previous = this.state.operationProgress
    const now = Date.now()
    const messageChanged = previous?.message !== next.message
    const fractionChanged = Math.abs((previous?.fraction ?? -1) - (next.fraction ?? -1)) >= 0.01
    if (!messageChanged && !fractionChanged && now - this.lastProgressUpdateAt < 120) return
    this.lastProgressUpdateAt = now
    this.update({ operationProgress: next })
  }

  clearOperationProgress(): void {
    if (!this.state.operationProgress) return
    this.lastProgressUpdateAt = 0
    this.update({ operationProgress: undefined })
  }

  async start(options: LocalServerStartOptions = {}): Promise<LocalServerState> {
    if (this.startPromise) return this.startPromise
    const pending = this.startInternal(options)
    this.startPromise = pending
    try {
      return await pending
    } finally {
      if (this.startPromise === pending) this.startPromise = null
    }
  }

  private async startInternal(options: LocalServerStartOptions): Promise<LocalServerState> {
    const project = this.requireProject()
    if (this.process?.isRunning()) throw new Error('本机服务端已经在运行')
    const port = validPort(options.port)
    const root = path.join(project.path, dataDirectory(project), 'server-pack')
    this.update({ stage: 'preparing', running: false, minecraftVersion: project.minecraftVersion, loader: project.loader, loaderVersion: project.loaderVersion, port, pid: undefined, logPath: undefined, operationProgress: undefined, message: '正在构建本机服务端包', recentLogs: [] })
    try {
      const pack = await buildServerPack(project, { outputDirectory: root, port, acceptEula: true, onlineMode: options.onlineMode === true, preserveExistingFiles: true })
      this.update({ stage: 'installing', message: '正在准备匹配版本的服务端运行时' })
      const javaPath = await this.getJavaPath()
      const runtime = await installServerRuntime({ serverPack: pack, javaPath }, project)
      this.update({ stage: 'starting', message: '正在启动本机服务端' })
      const server = new ServerProcess()
      this.process = server
      const processOptions: ServerProcessOptions = {
        pack,
        runtime,
        port,
        onEvent: (event) => this.capture(event.message, event.level),
        onExit: (code, signal) => {
          if (this.process !== server || this.state.stage === 'stopping') return
          this.process = null
          const message = code === 0 ? '本机服务端已停止' : `本机服务端已退出（代码 ${code ?? '未知'}${signal ? `，信号 ${signal}` : ''}）`
          this.update({ stage: code === 0 ? 'stopped' : 'error', running: false, pid: undefined, message })
          this.emit({ stage: code === 0 ? 'stopped' : 'error', message, level: code === 0 ? 'info' : 'error' })
        }
      }
      const started = await server.start(processOptions)
      this.update({ stage: 'running', running: true, address: started.address, logPath: started.logPath, pid: server.pid, message: '本机服务端运行中' })
      this.emit({ stage: 'running', message: `服务端已就绪：${started.address}` })
      return this.getState()
    } catch (error) {
      this.process = null
      const message = `本机服务端启动失败：${describeError(error)}`
      this.update({ stage: 'error', running: false, pid: undefined, message })
      this.emit({ stage: 'error', message, level: 'error' })
      throw error
    }
  }

  async stop(): Promise<LocalServerState> {
    if (this.startPromise) throw new Error('本机服务端正在准备启动，请等待启动完成后再停止')
    const server = this.process
    if (!server) {
      if (this.state.stage !== 'idle') this.update({ stage: 'stopped', running: false, pid: undefined, message: '本机服务端已停止' })
      return this.getState()
    }
    this.update({ stage: 'stopping', message: '正在停止本机服务端' })
    await server.stop()
    this.process = null
    this.update({ stage: 'stopped', running: false, pid: undefined, message: '本机服务端已停止' })
    this.emit({ stage: 'stopped', message: '本机服务端已停止' })
    return this.getState()
  }

  async restart(options: LocalServerStartOptions = {}): Promise<LocalServerState> {
    await this.stop()
    return this.start(options)
  }

  async sendCommand(command: string): Promise<LocalServerState> {
    if (!this.process?.isRunning()) throw new Error('请先启动本机服务端')
    this.process.sendCommand(command)
    this.emit({ stage: 'running', message: `已发送命令：${command.trim()}` })
    return this.getState()
  }

  async destroy(): Promise<void> {
    await this.stop().catch(() => undefined)
  }

  private requireProject(): ProjectInfo {
    const project = this.getProject()
    if (!project || project.kind !== 'modpack') throw new Error('本机服务端面板需要打开一个整合包项目')
    if (!['fabric', 'quilt', 'forge', 'neoforge'].includes(project.loader)) throw new Error('当前整合包 Loader 不支持本机服务端')
    return project
  }

  private update(patch: Partial<LocalServerState>): void {
    this.state = {
      ...this.state,
      ...patch,
      recentLogs: patch.recentLogs ? patch.recentLogs.map((entry) => ({ ...entry })) : this.state.recentLogs,
      operationProgress: patch.operationProgress ? { ...patch.operationProgress } : patch.operationProgress === undefined && 'operationProgress' in patch ? undefined : this.state.operationProgress
    }
    this.onState(this.getState())
  }

  private capture(message: string, level: LocalServerEvent['level'] = 'info'): void {
    const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!lines.length) return
    const time = new Date().toISOString()
    const recentLogs = [...this.state.recentLogs, ...lines.map((message) => ({ message, time, level }))].slice(-240)
    this.update({ recentLogs })
    for (const line of lines.slice(-8)) this.emit({ stage: this.state.stage, message: line, level })
  }

  private emit(event: Omit<LocalServerEvent, 'time'>): void {
    this.onEvent({ ...event, time: new Date().toISOString() })
  }
}
