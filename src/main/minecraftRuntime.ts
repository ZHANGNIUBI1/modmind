import { app } from 'electron'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'node:child_process'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import extractZip from 'extract-zip'
import { Agent } from 'undici'
import { MinecraftFolder, Version, launch } from '@xmcl/core'
import {
  fetchJavaRuntimeManifest,
  getFabricLoaders,
  getForgeVersionList,
  getQuiltLoaders,
  getVersionList,
  install,
  installDependencies,
  installFabric,
  installForge,
  installJavaRuntimeTask,
  installNeoForged,
  installQuiltVersion,
  JavaRuntimeTargetType
} from '@xmcl/installer'
import type {
  MinecraftLaunchOptions,
  GradleVerificationResult,
  MinecraftCrashInfo,
  MinecraftLaunchTestResult,
  MinecraftManagedMod,
  MinecraftRuntimeEvent,
  MinecraftRuntimeStage,
  MinecraftRuntimeState
} from '../shared/minecraft'
import type { LoaderKind, ProjectInfo } from '../shared/types'
import { gradleDistributionSources, type GradleDistributionSource, type GradleDownloadSourcePreference } from './gradleDownload'
import { isGradleDistributionLockFailure, isGradleNetworkFailure, isGradleWrapperBootstrapFailure } from './gradleFailure'
import { gradleChecksumForVersion, gradleVersionForProject, javaRuntimeTargetForMinecraft } from './loaderCompatibility'

interface RuntimeMetadata {
  minecraftVersion: string
  loader: LoaderKind
  loaderVersionId: string
  fabricVersionId?: string
  loaderVersion: string
  javaPath: string
  javaTarget: string
  preparedAt: string
}

interface MinecraftRuntimeOptions {
  getProject: () => ProjectInfo | null
  onState: (state: MinecraftRuntimeState) => void
  onEvent: (event: MinecraftRuntimeEvent) => void
  authorizeBuild?: (project: ProjectInfo) => Promise<void>
  getGradlePreference?: () => Promise<{
    preferLocalGradle: boolean
    executable?: string
    downloadSource?: GradleDownloadSourcePreference
  }>
}

export function gradleVersionFor(project: ProjectInfo): string {
  return gradleVersionForProject(project)
}

interface GradleRuntimeSelection {
  executable: string
  javaHome: string
  usesWrapper: boolean
  source: 'wrapper' | 'managed' | 'local'
  version?: string
}

async function probeGradleExecutable(configured: string | undefined): Promise<{ executable: string; version?: string } | null> {
  let executable = configured?.trim() || 'gradle'
  if (/["\r\n&|<>^]/.test(executable)) return null
  if (configured?.trim()) {
    const stat = await fs.stat(executable).catch(() => null)
    if (stat?.isDirectory()) executable = path.join(executable, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')
    if (!(await exists(executable))) return null
  }
  return await new Promise((resolve) => {
    const child = spawn(executable, ['--version'], { windowsHide: true, shell: process.platform === 'win32' })
    let output = ''
    let settled = false
    const finish = (value: { executable: string; version?: string } | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      if (child.pid) {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false })
        else child.kill('SIGTERM')
      }
      finish(null)
    }, 10_000)
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    child.once('error', () => finish(null))
    child.once('exit', (code) => {
      const version = output.match(/^Gradle\s+([^\s]+)$/m)?.[1]
      finish(code === 0 ? { executable, ...(version ? { version } : {}) } : null)
    })
  })
}

async function probeGradleDistributionSource(source: GradleDistributionSource): Promise<number> {
  const sampleBytes = 2 * 1024 * 1024
  const started = Date.now()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let downloaded = 0
  try {
    const response = await fetch(source.url, {
      headers: { Range: `bytes=0-${sampleBytes - 1}` },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok || !response.body) return 0
    reader = response.body.getReader()
    while (downloaded < sampleBytes) {
      const result = await reader.read()
      if (result.done) break
      downloaded += result.value.byteLength
    }
    const elapsedMs = Math.max(Date.now() - started, 1)
    return downloaded >= 64 * 1024 ? downloaded / elapsedMs : 0
  } catch {
    return 0
  } finally {
    await reader?.cancel().catch(() => undefined)
  }
}

function projectDataDirectory(project: ProjectInfo): '.modmind' | '.modtool' {
  return project.toolDataDirectory === '.modtool' ? '.modtool' : '.modmind'
}

function projectArtifactName(project: ProjectInfo): string {
  return projectDataDirectory(project) === '.modtool' ? 'modtool-current-project.jar' : 'modmind-current-project.jar'
}

function managedLoaderApiName(project: ProjectInfo): string {
  const api = project.loader === 'quilt' ? 'quilted-fabric-api' : 'fabric-api'
  return projectDataDirectory(project) === '.modtool' ? `modtool-managed-${api}.jar` : `modmind-managed-${api}.jar`
}

function summarizeGradleFailure(logText: string): string {
  const lines = logText.split(/\r?\n/)
  if (isGradleNetworkFailure(logText)) {
    return '无法下载 Gradle 分发包。请检查网络/代理，或在设置中启用“优先使用本机 Gradle”并指定与模板兼容的版本；迁移本身不受影响。'
  }
  const compilerErrors: string[] = []
  for (let index = 0; index < lines.length && compilerErrors.length < 12; index += 1) {
    if (!/\.java:\d+:\s*(?:error|错误):/i.test(lines[index])) continue
    compilerErrors.push(...lines.slice(index, index + 3).map((line) => line.trimEnd()).filter(Boolean))
  }
  if (compilerErrors.length) return compilerErrors.join('\n')

  const whatWentWrong = lines.findIndex((line) => line.trim() === '* What went wrong:')
  if (whatWentWrong >= 0) {
    const end = lines.findIndex((line, index) => index > whatWentWrong && line.trim().startsWith('* Try:'))
    return lines.slice(whatWentWrong + 1, end > whatWentWrong ? end : whatWentWrong + 14).filter(Boolean).join('\n')
  }
  return lines.filter(Boolean).slice(-16).join('\n')
}

function summarizeMinecraftCrash(report: string): string {
  const lines = report.split(/\r?\n/)
  const description = lines.find((line) => line.startsWith('Description:'))
  const entrypoint = lines.find((line) => line.includes('Could not execute entrypoint'))
  const causes = lines.filter((line) => line.startsWith('Caused by:'))
  const rootCause = causes.at(-1)
  const modFrames = lines
    .filter((line) => /^\s*at (?:knot\/\/)?dev\.(?:modmind|modtool)\./.test(line))
    .slice(0, 6)
    .map((line) => line.trim())
  const diagnostic = rootCause?.includes("This registry can't create intrusive holders")
    ? 'DETERMINISTIC DIAGNOSTIC: Moving Item/Block construction into register() does not fix this failure. Ensure a compatible Fabric API is declared in Gradle, present in the runtime mods directory, and loaded before registering content during ModInitializer.'
    : undefined
  return [description, entrypoint, rootCause, ...modFrames, diagnostic].filter(Boolean).join('\n')
}

async function listExtractedFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll('\\', '/'))
    }
  }
  await visit(root)
  return files
}

async function validateModArtifact(filePath: string, loader: LoaderKind): Promise<void> {
  const stat = await fs.stat(filePath)
  if (stat.size < 1_024) throw new Error('Mod JAR is implausibly small')
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-jar-'))
  try {
    await extractZip(filePath, { dir: temporaryRoot })
    const files = await listExtractedFiles(temporaryRoot)
    const descriptors = loader === 'fabric'
      ? ['fabric.mod.json']
      : loader === 'quilt' ? ['quilt.mod.json']
        : loader === 'forge' ? ['META-INF/mods.toml', 'mcmod.info'] : ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']
    if (!descriptors.some((descriptor) => files.includes(descriptor))) {
      throw new Error(`Mod JAR does not contain a ${loader} descriptor`)
    }
    if (!files.some((file) => file.endsWith('.class'))) throw new Error('Mod JAR does not contain compiled class files')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid Mod JAR: ${detail}`)
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function replaceModArtifact(source: string, target: string, loader: LoaderKind): Promise<void> {
  const pending = `${target}.pending`
  const backup = `${target}.backup`

  // Recover an interrupted swap before attempting another deployment.
  if (!(await exists(target)) && (await exists(backup))) await fs.rename(backup, target)
  await fs.rm(pending, { force: true })
  await fs.copyFile(source, pending)
  await validateModArtifact(pending, loader)

  let backedUp = false
  try {
    await fs.rm(backup, { force: true })
    if (await exists(target)) {
      await fs.rename(target, backup)
      backedUp = true
    }
    await fs.rename(pending, target)
    await fs.rm(backup, { force: true })
  } catch (error) {
    await fs.rm(pending, { force: true }).catch(() => undefined)
    if (backedUp && !(await exists(target)) && (await exists(backup))) {
      await fs.rename(backup, target).catch(() => undefined)
    }
    throw error
  }
}

async function fetchCompatibleJavaRuntimeManifest(target: string) {
  const agent = new Agent({ connections: 4 })
  const dispatcher = agent.compose((dispatch) => (options, handler) => {
    const compatibleOptions = { ...options }
    delete (compatibleOptions as typeof compatibleOptions & { throwOnError?: boolean }).throwOnError
    return dispatch(compatibleOptions, handler)
  })
  try {
    return await fetchJavaRuntimeManifest({ target: target as JavaRuntimeTargetType, dispatcher })
  } finally {
    await dispatcher.close()
  }
}

function offlineUuid(username: string): string {
  const bytes = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x30
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes.toString('hex')
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function findFile(root: string, predicate: (name: string, fullPath: string) => boolean): Promise<string | null> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        const nested = await findFile(fullPath, predicate)
        if (nested) return nested
      } else if (entry.isFile() && predicate(entry.name, fullPath)) {
        return fullPath
      }
    }
  } catch {
    return null
  }
  return null
}

async function findFiles(
  root: string,
  predicate: (name: string, fullPath: string) => boolean,
  limit = 500
): Promise<string[]> {
  const matches: string[] = []
  const visit = async (directory: string): Promise<void> => {
    if (matches.length >= limit) return
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (matches.length >= limit) return
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(fullPath)
      else if (entry.isFile() && predicate(entry.name, fullPath)) matches.push(fullPath)
    }
  }
  await visit(root)
  return matches
}

async function readConfiguredLoaderVersion(project: ProjectInfo): Promise<string | undefined> {
  const propertiesPath = path.join(project.path, 'gradle.properties')
  const content = await fs.readFile(propertiesPath, 'utf8').catch(() => '')
  const value = content.match(/^(?:loader_version|forge_version|neo_version|neoforge_version)\s*=\s*([^\s#]+)\s*$/m)?.[1]
  return value && /^[0-9A-Za-z.+_-]+$/.test(value) ? value : undefined
}

async function readConfiguredLoaderApiVersion(project: ProjectInfo): Promise<string | undefined> {
  const content = await fs.readFile(path.join(project.path, 'gradle.properties'), 'utf8').catch(() => '')
  const properties = project.loader === 'quilt' ? ['qfapi_version'] : ['fabric_api_version', 'fabric_version']
  const value = properties.map((property) => content.match(new RegExp(`^${property}\\s*=\\s*([^\\s#]+)\\s*$`, 'm'))?.[1]).find(Boolean)
  return value && /^[0-9A-Za-z.+_-]+$/.test(value) ? value : undefined
}

export class MinecraftRuntimeManager {
  private readonly getProject: () => ProjectInfo | null
  private readonly onState: (state: MinecraftRuntimeState) => void
  private readonly onEvent: (event: MinecraftRuntimeEvent) => void
  private readonly authorizeBuild?: (project: ProjectInfo) => Promise<void>
  private readonly getGradlePreference?: MinecraftRuntimeOptions['getGradlePreference']
  private process: ChildProcess | null = null
  private preparePromise: Promise<MinecraftRuntimeState> | null = null
  private buildPromise: Promise<MinecraftManagedMod> | null = null
  private buildProcess: ChildProcess | null = null
  private verificationProcess: ChildProcess | null = null
  private lastProgressAt = 0
  private lastProgressStage: MinecraftRuntimeStage | '' = ''
  private state: MinecraftRuntimeState = {
    stage: 'idle',
    minecraftVersion: '',
    installed: false,
    running: false,
    message: '等待准备测试实例',
    mods: []
  }

  constructor(options: MinecraftRuntimeOptions) {
    this.getProject = options.getProject
    this.onState = options.onState
    this.onEvent = options.onEvent
    this.authorizeBuild = options.authorizeBuild
    this.getGradlePreference = options.getGradlePreference
  }

  getState(): MinecraftRuntimeState {
    return { ...this.state, mods: [...this.state.mods] }
  }

  async refresh(): Promise<MinecraftRuntimeState> {
    const project = this.requireProject()
    const metadata = await this.readMetadata(project)
    const mods = await this.listMods()
    const lastCrash = this.state.lastCrash ?? (await this.readLatestCrash(project, 0))
    this.updateState({
      minecraftVersion: project.minecraftVersion,
      loader: project.loader,
      instancePath: this.instanceRoot(project),
      installed: Boolean(metadata),
      loaderVersionId: metadata?.loaderVersionId,
      fabricVersionId: metadata?.fabricVersionId,
      loaderVersion: metadata?.loaderVersion,
      javaPath: metadata?.javaPath,
      mods,
      lastCrash
    })
    return this.getState()
  }

  prepare(): Promise<MinecraftRuntimeState> {
    if (this.preparePromise) return this.preparePromise
    this.preparePromise = this.prepareInternal()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.updateState({ stage: 'error', message })
        this.onEvent({ stage: 'error', message, level: 'error', time: new Date().toISOString() })
        throw error
      })
      .finally(() => {
        this.preparePromise = null
      })
    return this.preparePromise
  }

  async launch(options: MinecraftLaunchOptions, signal?: AbortSignal): Promise<MinecraftRuntimeState> {
    const project = this.requireProject()
    if (this.process && this.state.running) throw new Error('Minecraft 测试实例已经在运行')
    const username = options.username.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('离线用户名需要 3-16 个字母、数字或下划线')
    if (!Number.isInteger(options.maxMemoryMb) || options.maxMemoryMb < 1024 || options.maxMemoryMb > 16384) {
      throw new Error('最大内存需要在 1024-16384 MB 之间')
    }

    const syncedArtifact = path.join(this.modsRoot(project), projectArtifactName(project))
    if (!(await exists(syncedArtifact))) {
      throw new Error('测试实例中没有已同步的项目 Mod，请先点击“构建并同步”')
    }
    await validateModArtifact(syncedArtifact, project.loader)
    if (signal?.aborted) throw Object.assign(new Error('Minecraft 启动已取消'), { name: 'AbortError' })
    await this.prepare()
    const metadata = await this.readMetadata(project)
    if (!metadata) throw new Error('Minecraft 测试实例尚未准备完成')

    const instanceRoot = this.instanceRoot(project)
    await fs.mkdir(instanceRoot, { recursive: true })
    this.updateState({ lastCrash: undefined })
    this.emit('launching', '正在生成离线启动参数')
    const launchedAt = Date.now()
    let child: ChildProcess
    try {
      child = await launch({
        gamePath: instanceRoot,
        resourcePath: this.resourceRoot(),
        version: metadata.loaderVersionId,
        javaPath: metadata.javaPath,
        gameProfile: { name: username, id: offlineUuid(username) },
        accessToken: '0',
        userType: 'legacy',
        launcherName: 'ModMind',
        launcherBrand: 'ModMind',
        minMemory: Math.min(512, options.maxMemoryMb),
        maxMemory: options.maxMemoryMb,
        resolution: { width: options.width ?? 1280, height: options.height ?? 720 },
        extraExecOption: { cwd: instanceRoot, windowsHide: false }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.updateState({ stage: 'error', running: false, message })
      this.onEvent({ stage: 'error', message, level: 'error', time: new Date().toISOString() })
      throw error
    }
    this.process = child
    const launcherLog = createWriteStream(path.join(instanceRoot, 'launcher-console.log'), { flags: 'w' })
    child.stdout?.pipe(launcherLog, { end: false })
    child.stderr?.pipe(launcherLog, { end: false })
    child.stdout?.on('data', (chunk: Buffer) => this.emit('running', chunk.toString('utf8').trim(), 'info', false))
    child.stderr?.on('data', (chunk: Buffer) => this.emit('running', chunk.toString('utf8').trim(), 'warning', false))
    child.once('spawn', () => {
      this.updateState({ stage: 'running', running: true, pid: child.pid, message: 'Minecraft 测试实例运行中' })
      this.emit('running', `Minecraft 已启动，进程 ID ${child.pid ?? '-'}`)
    })
    child.once('error', (error) => {
      this.process = null
      launcherLog.end()
      this.updateState({ stage: 'error', running: false, pid: undefined, message: error.message })
      this.emit('error', error.message, 'error')
    })
    child.once('exit', (code, signal) => {
      this.process = null
      launcherLog.end()
      void this.handleMinecraftExit(project, launchedAt, code, signal)
    })
    return this.getState()
  }

  async testLaunch(options: MinecraftLaunchOptions, stableWindowMs = 20_000, signal?: AbortSignal): Promise<MinecraftLaunchTestResult> {
    await this.launch(options, signal)
    const deadline = Date.now() + stableWindowMs
    this.emit('running', `正在验证 Minecraft 启动稳定性（${Math.round(stableWindowMs / 1000)} 秒）`)
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        await this.stop()
        throw Object.assign(new Error('Minecraft 验证已取消'), { name: 'AbortError' })
      }
      if (!this.process) {
        const crashDeadline = Date.now() + 3_000
        while (!this.state.lastCrash && Date.now() < crashDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return { success: false, state: this.getState(), crash: this.state.lastCrash }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!this.process || !this.state.running) {
      return { success: false, state: this.getState(), crash: this.state.lastCrash }
    }
    this.emit('running', 'Minecraft 已通过启动稳定性验证')
    return { success: true, state: this.getState() }
  }

  async inspectMinecraftClass(className: string): Promise<string> {
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(className)) {
      throw new Error('Minecraft 类名格式无效')
    }
    const project = this.requireProject()
    const cacheRoot = path.join(
      app.getPath('userData'),
      'gradle-runtime',
      'cache',
      'caches',
      'fabric-loom',
      'minecraftMaven',
      'net',
      'minecraft',
      'minecraft-merged'
    )
    const mappedJar = await findFile(
      cacheRoot,
      (name, fullPath) => name.endsWith('.jar') && name.includes(project.minecraftVersion) && !fullPath.includes('intermediary')
    )
    if (!mappedJar) throw new Error('尚未找到当前版本的 Minecraft 映射 JAR；请先调用 build_project')
    const { javaPath } = await this.ensureJava(project)
    const javap = path.join(path.dirname(javaPath), process.platform === 'win32' ? 'javap.exe' : 'javap')
    const runJavap = async (classPath: string): Promise<{ output: string; error: string; exitCode: number }> => {
      const child = spawn(javap, ['-classpath', classPath, className], { windowsHide: true, shell: false })
      let output = ''
      let errorOutput = ''
      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length < 100_000) output += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (errorOutput.length < 20_000) errorOutput += chunk.toString('utf8')
      })
      const exitCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error('javap class inspection timed out'))
        }, 20_000)
        child.once('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.once('exit', (code) => {
          clearTimeout(timer)
          resolve(code ?? 1)
        })
      })
      return { output: output.trim(), error: errorOutput.trim(), exitCode }
    }

    const minecraftResult = await runJavap(mappedJar)
    if (minecraftResult.exitCode === 0) return minecraftResult.output

    const modulesRoot = path.join(
      app.getPath('userData'),
      'gradle-runtime',
      'cache',
      'caches',
      'modules-2',
      'files-2.1'
    )
    const classGroupPrefix = className.split('.').slice(0, 2).join('.')
    const groupDirectories = (await fs.readdir(modulesRoot, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name === classGroupPrefix || entry.name.startsWith(`${classGroupPrefix}.`))
      .map((entry) => path.join(modulesRoot, entry.name))
    const dependencyJars = (
      await Promise.all(
        groupDirectories.map((directory) =>
          findFiles(directory, (name) => name.endsWith('.jar') && !/(?:sources|javadoc)\.jar$/i.test(name))
        )
      )
    ).flat()
    dependencyJars.push(
      ...(await findFiles(
        this.modsRoot(project),
        (name) => name.endsWith('.jar') && name !== projectArtifactName(project),
        100
      ))
    )
    const uniqueJars = [...new Set(dependencyJars)]
    if (uniqueJars.length) {
      const dependencyResult = await runJavap([mappedJar, ...uniqueJars].join(path.delimiter))
      if (dependencyResult.exitCode === 0) return dependencyResult.output
      if (dependencyResult.error) throw new Error(dependencyResult.error)
    }
    throw new Error(minecraftResult.error || `javap exited with code ${minecraftResult.exitCode}`)
  }

  async stop(): Promise<MinecraftRuntimeState> {
    const active = this.process
    if (active && !active.killed) this.killProcessTree(active)
    if (this.buildProcess && !this.buildProcess.killed) this.killProcessTree(this.buildProcess)
    if (this.verificationProcess && !this.verificationProcess.killed) this.killProcessTree(this.verificationProcess)
    const deadline = Date.now() + 5_000
    while (active && this.process === active && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
    return this.getState()
  }

  private killProcessTree(child: ChildProcess): void {
    if (!child.pid) return
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false })
    else child.kill('SIGTERM')
  }

  private spawnGradle(
    runtime: GradleRuntimeSelection,
    project: ProjectInfo,
    args: string[],
    env: NodeJS.ProcessEnv
  ): ChildProcessWithoutNullStreams {
    if (process.platform === 'win32' && runtime.usesWrapper) {
      return spawn(
        path.join(runtime.javaHome, 'bin', 'java.exe'),
        [
          '-Dfile.encoding=UTF-8',
          '-Xmx64m',
          '-Xms64m',
          '-Dorg.gradle.appname=gradlew',
          '-jar',
          path.join(project.path, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
          ...args
        ],
        { cwd: project.path, windowsHide: true, shell: false, env }
      )
    }
    return spawn(runtime.executable, args, {
      cwd: project.path,
      windowsHide: true,
      shell: process.platform === 'win32',
      env
    })
  }

  private async gradleRuntime(project: ProjectInfo, forceManaged = false): Promise<GradleRuntimeSelection> {
    const { javaPath } = await this.ensureJava(project)
    const requiredVersion = gradleVersionFor(project)
    const preference = await this.getGradlePreference?.().catch(() => ({
      preferLocalGradle: false,
      executable: undefined,
      downloadSource: 'auto' as const
    }))
    const downloadSource = preference?.downloadSource ?? 'auto'
    if (!forceManaged && preference?.preferLocalGradle) {
      const local = await probeGradleExecutable(preference.executable)
      if (local) {
        if (local.version && local.version !== requiredVersion) {
          this.emit('building-mod', `本机 Gradle ${local.version} 与模板推荐的 ${requiredVersion} 不同，按用户设置继续`, 'warning')
        }
        return { ...local, javaHome: path.dirname(path.dirname(javaPath)), usesWrapper: false, source: 'local' }
      }
      this.emit('building-mod', '未找到可用的本机 Gradle，已回退项目 Wrapper', 'warning')
    }
    const wrapperPath = path.join(project.path, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
    if (!forceManaged && downloadSource === 'official' && await exists(wrapperPath)) {
      return { executable: wrapperPath, javaHome: path.dirname(path.dirname(javaPath)), usesWrapper: true, source: 'wrapper' }
    }
    return {
      executable: await this.ensureGradle(requiredVersion, downloadSource),
      javaHome: path.dirname(path.dirname(javaPath)),
      usesWrapper: false,
      source: 'managed',
      version: requiredVersion
    }
  }

  async testGradleTask(candidates: string[], stableWindowMs = 0, signal?: AbortSignal): Promise<GradleVerificationResult> {
    const project = this.requireProject()
    if (this.process || this.verificationProcess || this.buildPromise) throw new Error('已有 Minecraft、构建或验证任务正在运行')
    await this.authorizeBuild?.(project)
    const runtime = await this.gradleRuntime(project)
    const env = {
      ...process.env,
      JAVA_HOME: runtime.javaHome,
      GRADLE_USER_HOME: path.join(app.getPath('userData'), 'gradle-runtime', 'cache')
    }
    const taskList = this.spawnGradle(runtime, project, ['tasks', '--all', '--console=plain', '--no-daemon'], env)
    let taskOutput = ''
    taskList.stdout.on('data', (chunk: Buffer) => { if (taskOutput.length < 2_000_000) taskOutput += chunk.toString('utf8') })
    taskList.stderr.on('data', (chunk: Buffer) => { if (taskOutput.length < 2_000_000) taskOutput += chunk.toString('utf8') })
    const taskExit = await new Promise<number>((resolve, reject) => {
      taskList.once('error', reject)
      taskList.once('exit', (code) => resolve(code ?? 1))
    })
    if (taskExit !== 0) throw new Error(`无法读取 Gradle 任务：${summarizeGradleFailure(taskOutput)}`)
    const task = candidates.find((candidate) => new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(taskOutput))
    if (!task) return { skipped: true, success: true, summary: `项目没有提供 ${candidates.join(' / ')} 任务` }

    await fs.mkdir(path.join(project.path, 'run'), { recursive: true })
    await fs.writeFile(path.join(project.path, 'run', 'eula.txt'), 'eula=true\n', 'utf8')
    const logDirectory = path.join(project.path, projectDataDirectory(project), 'builds')
    await fs.mkdir(logDirectory, { recursive: true })
    const logPath = path.join(logDirectory, `${task}-${Date.now()}.log`)
    const log = createWriteStream(logPath, { flags: 'w' })
    this.emit('testing-server', `正在执行 Gradle ${task}`)
    const child = this.spawnGradle(runtime, project, [task, '--console=plain', '--no-daemon', '--stacktrace'], env)
    this.verificationProcess = child
    let output = ''
    let readyAt = 0
    const capture = (chunk: Buffer, level: MinecraftRuntimeEvent['level']): void => {
      const text = chunk.toString('utf8')
      log.write(text)
      output = `${output}${text}`.slice(-200_000)
      if (/Done \([\d.]+s\)!|For help, type "help"|Server started|Dedicated server took/i.test(text)) readyAt ||= Date.now()
      const line = text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).at(-1)
      if (line) this.emit('testing-server', line, level, false)
    }
    child.stdout.on('data', (chunk: Buffer) => capture(chunk, 'info'))
    child.stderr.on('data', (chunk: Buffer) => capture(chunk, 'warning'))
    let exitCode: number | null = null
    child.once('exit', (code) => { exitCode = code ?? 1 })
    const abort = (): void => this.killProcessTree(child)
    signal?.addEventListener('abort', abort, { once: true })
    const deadline = Date.now() + (stableWindowMs ? 150_000 : 10 * 60_000)
    while (exitCode === null && Date.now() < deadline) {
      if (signal?.aborted) break
      if (stableWindowMs && readyAt && Date.now() - readyAt >= stableWindowMs) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const reachedStableWindow = Boolean(stableWindowMs && readyAt && Date.now() - readyAt >= stableWindowMs)
    if (exitCode === null) this.killProcessTree(child)
    const stopDeadline = Date.now() + 5_000
    while (exitCode === null && Date.now() < stopDeadline) await new Promise((resolve) => setTimeout(resolve, 100))
    signal?.removeEventListener('abort', abort)
    this.verificationProcess = null
    await new Promise<void>((resolve) => log.end(resolve))
    if (signal?.aborted) throw Object.assign(new Error(`${task} 已取消`), { name: 'AbortError' })
    if (reachedStableWindow || (!stableWindowMs && exitCode === 0)) {
      this.emit('idle', `${task} 验证通过`)
      return { task, skipped: false, success: true, summary: reachedStableWindow ? `服务端就绪后稳定运行 ${Math.round(stableWindowMs / 1000)} 秒` : `${task} 执行成功`, logPath }
    }
    const detail = summarizeGradleFailure(output)
    this.emit('error', `${task} 验证失败`, 'error')
    return { task, skipped: false, success: false, summary: detail || (exitCode === null ? `${task} 超时` : `${task} 退出代码 ${exitCode}`), logPath }
  }

  async syncProjectMod(): Promise<MinecraftManagedMod | null> {
    const project = this.requireProject()
    if (this.process && this.state.running) {
      throw new Error('Minecraft 测试实例正在运行。请先停止测试，再同步项目模组；运行中的 JAR 不允许被覆盖。')
    }
    const buildDirectory = path.join(project.path, 'build', 'libs')
    if (!(await exists(buildDirectory))) {
      this.emit('syncing-mod', '未发现 build/libs，启动时将保留现有项目 JAR', 'warning')
      return null
    }
    const entries = await fs.readdir(buildDirectory, { withFileTypes: true })
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jar') && !/(sources|javadoc|dev|shadow)/i.test(entry.name))
        .map(async (entry) => {
          const source = path.join(buildDirectory, entry.name)
          return { source, stat: await fs.stat(source) }
        })
    )
    const latest = candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]
    if (!latest) return null
    await validateModArtifact(latest.source, project.loader)
    const modsDirectory = this.modsRoot(project)
    await fs.mkdir(modsDirectory, { recursive: true })
    await replaceModArtifact(latest.source, path.join(modsDirectory, projectArtifactName(project)), project.loader)
    this.emit('syncing-mod', `已同步项目模组：${path.basename(latest.source)}`)
    const mods = await this.listMods()
    this.updateState({ mods })
    return mods.find((mod) => mod.projectArtifact) ?? null
  }

  buildProject(signal?: AbortSignal): Promise<MinecraftManagedMod> {
    if (this.buildPromise) return this.buildPromise
    this.buildPromise = this.buildProjectInternal(signal)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.updateState({ stage: 'error', message })
        this.onEvent({ stage: 'error', message, level: 'error', time: new Date().toISOString() })
        throw error
      })
      .finally(() => {
        this.buildPromise = null
      })
    return this.buildPromise
  }

  private async buildProjectInternal(signal?: AbortSignal, forceManaged = false): Promise<MinecraftManagedMod> {
    const project = this.requireProject()
    if (this.process && this.state.running) {
      throw new Error('Minecraft 测试实例正在运行。请先停止测试再构建，避免覆盖正在加载的项目 JAR。')
    }
    if (signal?.aborted) throw Object.assign(new Error('构建已取消'), { name: 'AbortError' })
    await this.authorizeBuild?.(project)
    const gradleVersion = gradleVersionFor(project)
    const runtime = await this.gradleRuntime(project, forceManaged)
    const usesWrapper = runtime.usesWrapper
    const logDirectory = path.join(project.path, projectDataDirectory(project), 'builds')
    const logPath = path.join(logDirectory, 'minecraft-test-build.log')
    await fs.mkdir(logDirectory, { recursive: true })
    const log = createWriteStream(logPath, { flags: 'w' })
    const javaHome = runtime.javaHome
    const gradleLabel = runtime.source === 'local'
      ? `本机 Gradle${runtime.version ? ` ${runtime.version}` : ''}`
      : usesWrapper ? '项目 Gradle Wrapper' : `Gradle ${gradleVersion}`
    this.emit('building-mod', `正在使用 ${gradleLabel} 构建项目`)

    const child = this.spawnGradle(runtime, project, ['build', '--no-daemon', '--stacktrace'], {
      ...process.env,
      JAVA_HOME: javaHome,
      GRADLE_USER_HOME: path.join(app.getPath('userData'), 'gradle-runtime', 'cache')
    })
    this.buildProcess = child
    let aborted = false
    const abortBuild = (): void => {
      aborted = true
      if (!child.pid) return
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false })
      } else {
        child.kill('SIGTERM')
      }
    }
    signal?.addEventListener('abort', abortBuild, { once: true })
    const recentLines: string[] = []
    const capture = (chunk: Buffer, level: MinecraftRuntimeEvent['level']): void => {
      const text = chunk.toString('utf8')
      log.write(text)
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      recentLines.push(...lines)
      if (recentLines.length > 60) recentLines.splice(0, recentLines.length - 60)
      const visible = lines.at(-1)
      if (visible) this.emit('building-mod', visible, level, false)
    }
    child.stdout.on('data', (chunk: Buffer) => capture(chunk, 'info'))
    child.stderr.on('data', (chunk: Buffer) => capture(chunk, 'warning'))
    const exitCode = await new Promise<number>((resolve) => {
      child.once('error', () => resolve(1))
      child.once('exit', (code) => resolve(code ?? 1))
    })
    this.buildProcess = null
    signal?.removeEventListener('abort', abortBuild)
    await new Promise<void>((resolve) => log.end(resolve))
    if (aborted) throw Object.assign(new Error('构建已取消'), { name: 'AbortError' })
    if (exitCode !== 0) {
      const fullLog = await fs.readFile(logPath, 'utf8').catch(() => recentLines.join('\n'))
      if (!forceManaged && usesWrapper && isGradleWrapperBootstrapFailure(fullLog)) {
        const reason = isGradleDistributionLockFailure(fullLog) ? 'Wrapper 分发缓存被占用' : '项目 Wrapper 下载失败'
        this.emit('building-mod', `${reason}，正在使用 ModMind 的跨平台 Gradle 下载器重试`, 'warning')
        return this.buildProjectInternal(signal, true)
      }
      const detail = summarizeGradleFailure(fullLog)
      throw new Error(`Gradle 构建失败（退出代码 ${exitCode}）${detail ? `\n${detail}` : ''}\n完整日志：${logPath}`)
    }
    const artifact = await this.syncProjectMod()
    if (!artifact) throw new Error('Gradle 构建成功，但 build/libs 中没有找到可运行的 Mod JAR')
    this.emit('syncing-mod', '项目构建完成并已同步到测试实例')
    return artifact
  }

  async importMods(filePaths: string[]): Promise<MinecraftManagedMod[]> {
    const project = this.requireProject()
    const destination = this.modsRoot(project)
    await fs.mkdir(destination, { recursive: true })
    for (const filePath of filePaths) {
      if (path.extname(filePath).toLowerCase() !== '.jar') continue
      const name = path.basename(filePath)
      if (name.toLowerCase() === projectArtifactName(project) || (['fabric', 'quilt'].includes(project.loader) && name.toLowerCase() === managedLoaderApiName(project))) continue
      await fs.copyFile(filePath, path.join(destination, name))
    }
    const mods = await this.listMods()
    this.updateState({ mods })
    this.emit('idle', `前置模组已更新，共 ${mods.filter((mod) => !mod.projectArtifact).length} 个`)
    return mods
  }

  async removeMod(name: string): Promise<MinecraftManagedMod[]> {
    const project = this.requireProject()
    if (name === projectArtifactName(project) || (['fabric', 'quilt'].includes(project.loader) && name === managedLoaderApiName(project)) || path.basename(name) !== name) {
      throw new Error('不能删除项目模组、托管依赖或无效路径')
    }
    const target = path.join(this.modsRoot(project), name)
    if (path.dirname(target) !== this.modsRoot(project)) throw new Error('无效的模组路径')
    await fs.rm(target, { force: true })
    const mods = await this.listMods()
    this.updateState({ mods })
    return mods
  }

  async listMods(): Promise<MinecraftManagedMod[]> {
    const project = this.requireProject()
    const directory = this.modsRoot(project)
    await fs.mkdir(directory, { recursive: true })
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const mods = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.jar'))
        .map(async (entry): Promise<MinecraftManagedMod> => {
          const filePath = path.join(directory, entry.name)
          const stat = await fs.stat(filePath)
          return {
            name: entry.name,
            path: filePath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            projectArtifact: entry.name === projectArtifactName(project)
          }
        })
    )
    return mods.sort((a, b) => Number(b.projectArtifact) - Number(a.projectArtifact) || a.name.localeCompare(b.name))
  }

  destroy(): void {
    if (this.process && !this.process.killed) this.process.kill()
    if (this.buildProcess && !this.buildProcess.killed) this.killProcessTree(this.buildProcess)
    if (this.verificationProcess && !this.verificationProcess.killed) this.killProcessTree(this.verificationProcess)
    this.process = null
    this.buildProcess = null
    this.verificationProcess = null
  }

  private async prepareInternal(): Promise<MinecraftRuntimeState> {
    const project = this.requireProject()
    const configuredLoaderVersion = (await readConfiguredLoaderVersion(project)) ?? project.loaderVersion
    await fs.mkdir(this.instanceRoot(project), { recursive: true })
    await fs.mkdir(this.resourceRoot(), { recursive: true })
    if (project.loader === 'fabric' || project.loader === 'quilt') await this.ensureManagedLoaderApi(project)
    const cached = await this.readMetadata(project)
    const cachedVersionJson = cached
      ? path.join(this.resourceRoot(), 'versions', cached.loaderVersionId, `${cached.loaderVersionId}.json`)
      : ''
    if (
      cached &&
      (!configuredLoaderVersion || cached.loaderVersion === configuredLoaderVersion) &&
      (await exists(cached.javaPath)) &&
      (await exists(cachedVersionJson))
    ) {
      this.updateState({
        stage: 'idle',
        minecraftVersion: project.minecraftVersion,
        loader: project.loader,
        loaderVersionId: cached.loaderVersionId,
        fabricVersionId: cached.fabricVersionId,
        loaderVersion: cached.loaderVersion,
        javaPath: cached.javaPath,
        instancePath: this.instanceRoot(project),
        installed: true,
        message: '测试实例已准备',
        mods: await this.listMods()
      })
      return this.getState()
    }

    this.emit('preparing', `正在准备 Minecraft ${project.minecraftVersion}`)
    const { target, javaPath } = await this.ensureJava(project)

    this.emit('downloading-game', `正在下载 Minecraft ${project.minecraftVersion}`)
    const versionList = await getVersionList()
    const versionMeta = versionList.versions.find((version) => version.id === project.minecraftVersion)
    if (!versionMeta) throw new Error(`找不到 Minecraft 版本：${project.minecraftVersion}`)
    await install(versionMeta, this.resourceRoot(), {
      side: 'client',
      assetsDownloadConcurrency: 16,
      librariesDownloadConcurrency: 16
    })

    this.emit('installing-loader', `正在安装 ${project.loader} Loader`)
    let loaderVersion = configuredLoaderVersion
    let loaderVersionId: string
    if (project.loader === 'fabric') {
      const loaders = await getFabricLoaders()
      const loader = loaderVersion
        ? loaders.find((item) => item.version === loaderVersion)
        : loaders.find((item) => item.stable) ?? loaders[0]
      if (!loader) throw new Error(loaderVersion ? `Fabric Meta 没有返回 Loader ${loaderVersion}` : 'Fabric Meta 没有返回可用 Loader')
      loaderVersion = loader.version
      loaderVersionId = await installFabric({
        minecraftVersion: project.minecraftVersion,
        version: loader.version,
        minecraft: this.resourceRoot(),
        side: 'client'
      })
    } else if (project.loader === 'quilt') {
      const loaders = await getQuiltLoaders()
      const loader = loaderVersion
        ? loaders.find((item) => item.version === loaderVersion)
        : loaders.find((item) => !/(?:alpha|beta|rc)/i.test(item.version)) ?? loaders[0]
      if (!loader) throw new Error(loaderVersion ? `Quilt Meta 没有返回 Loader ${loaderVersion}` : 'Quilt Meta 没有返回可用 Loader')
      loaderVersion = loader.version
      loaderVersionId = await installQuiltVersion({
        minecraftVersion: project.minecraftVersion,
        version: loader.version,
        minecraft: this.resourceRoot(),
        side: 'client'
      })
    } else if (project.loader === 'forge') {
      if (!loaderVersion) {
        const forge = await getForgeVersionList({ minecraft: project.minecraftVersion })
        const selected = forge.versions.find((entry) => entry.type === 'recommended') ?? forge.versions.find((entry) => entry.type === 'latest') ?? forge.versions[0]
        if (!selected) throw new Error(`Forge 没有返回 Minecraft ${project.minecraftVersion} 的版本`)
        loaderVersion = `${project.minecraftVersion}-${selected.version}`
      }
      const forgeVersion = loaderVersion.startsWith(`${project.minecraftVersion}-`)
        ? loaderVersion.slice(project.minecraftVersion.length + 1)
        : loaderVersion
      loaderVersionId = await installForge(
        { mcversion: project.minecraftVersion, version: forgeVersion },
        this.resourceRoot(),
        { java: javaPath, side: 'client' }
      )
    } else {
      if (!loaderVersion) throw new Error(`NeoForge ${project.minecraftVersion} 缺少加载器版本`)
      const artifact = project.minecraftVersion === '1.20.1' ? 'forge' : 'neoforge'
      loaderVersionId = await installNeoForged(artifact, loaderVersion, this.resourceRoot(), { java: javaPath, side: 'client' })
    }
    const resolved = await Version.parse(this.resourceRoot(), loaderVersionId)
    await installDependencies(resolved, {
      assetsDownloadConcurrency: 16,
      librariesDownloadConcurrency: 16
    })

    const metadata: RuntimeMetadata = {
      minecraftVersion: project.minecraftVersion,
      loader: project.loader,
      loaderVersionId,
      fabricVersionId: project.loader === 'fabric' ? loaderVersionId : undefined,
      loaderVersion,
      javaPath,
      javaTarget: target,
      preparedAt: new Date().toISOString()
    }
    await fs.writeFile(this.metadataPath(project), JSON.stringify(metadata, null, 2), 'utf8')
    this.updateState({
      stage: 'idle',
      minecraftVersion: project.minecraftVersion,
      loader: project.loader,
      loaderVersionId,
      fabricVersionId: project.loader === 'fabric' ? loaderVersionId : undefined,
      loaderVersion,
      javaPath,
      instancePath: this.instanceRoot(project),
      installed: true,
      message: `Minecraft 与 ${project.loader} 已准备完成`,
      mods: await this.listMods()
    })
    this.emit('idle', '测试实例准备完成')
    return this.getState()
  }

  private requireProject(): ProjectInfo {
    const project = this.getProject()
    if (!project) throw new Error('请先创建或打开一个 Mod 项目')
    return project
  }

  private resourceRoot(): string {
    return path.join(app.getPath('userData'), 'minecraft-runtime', 'game')
  }

  private runtimeRoot(): string {
    return path.join(app.getPath('userData'), 'minecraft-runtime', 'java')
  }

  private async ensureJava(project: ProjectInfo): Promise<{ target: string; javaPath: string }> {
    const target = javaRuntimeTargetForMinecraft(project.minecraftVersion)
    const javaHome = path.join(this.runtimeRoot(), target)
    const javaPath = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (!(await exists(javaPath))) {
      this.emit('downloading-java', `正在下载托管 Java：${target}`)
      const manifest = await fetchCompatibleJavaRuntimeManifest(target)
      const task = installJavaRuntimeTask({ destination: javaHome, manifest })
      await task.startAndWait({
        onUpdate: () => this.emitProgress('downloading-java', '正在下载 Java Runtime', task.progress, task.total)
      })
    }
    return { target, javaPath }
  }

  private async ensureManagedLoaderApi(project: ProjectInfo): Promise<void> {
    const version = project.apiVersion ?? await readConfiguredLoaderApiVersion(project)
    const label = project.loader === 'quilt' ? 'Quilted Fabric API' : 'Fabric API'
    if (!version) {
      this.emit('installing-loader', `Minecraft ${project.minecraftVersion} 没有配置托管 ${label}`, 'warning')
      return
    }
    const modsDirectory = this.modsRoot(project)
    const target = path.join(modsDirectory, managedLoaderApiName(project))
    const marker = path.join(
      modsDirectory,
      projectDataDirectory(project) === '.modtool' ? `.modtool-${project.loader}-api-version` : `.modmind-${project.loader}-api-version`
    )
    await fs.mkdir(modsDirectory, { recursive: true })
    const installedVersion = await fs.readFile(marker, 'utf8').catch(() => '')
    if (installedVersion.trim() === version && (await exists(target))) return

    const encodedVersion = encodeURIComponent(version)
    const baseUrl = project.loader === 'quilt'
      ? `https://maven.quiltmc.org/repository/release/org/quiltmc/quilted-fabric-api/quilted-fabric-api/${encodedVersion}/quilted-fabric-api-${encodedVersion}.jar`
      : `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/${encodedVersion}/fabric-api-${encodedVersion}.jar`
    const temporary = `${target}.download`
    this.emit('installing-fabric', `正在准备 ${label} ${version}`)
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const [response, checksumResponse] = await Promise.all([fetch(baseUrl), fetch(`${baseUrl}.sha1`)])
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        if (!checksumResponse.ok) throw new Error(`SHA-1 HTTP ${checksumResponse.status}`)
        const expected = (await checksumResponse.text()).trim().split(/\s+/)[0]?.toLowerCase()
        if (!expected || !/^[a-f0-9]{40}$/.test(expected)) throw new Error(`${label} SHA-1 格式无效`)
        await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary))
        const hasher = createHash('sha1')
        await pipeline(createReadStream(temporary), hasher)
        if (hasher.digest('hex') !== expected) throw new Error(`${label} SHA-1 校验失败`)
        await fs.rm(target, { force: true })
        await fs.rename(temporary, target)
        await fs.writeFile(marker, version, 'utf8')
        this.emit('installing-fabric', `${label} ${version} 已就绪`)
        return
      } catch (error) {
        await fs.rm(temporary, { force: true })
        if (attempt === 3) throw error
        this.emit('installing-fabric', `${label} 下载中断，正在重试 ${attempt + 1}/3`, 'warning')
      }
    }
  }

  private async ensureGradle(
    gradleVersion: string,
    preference: GradleDownloadSourcePreference = 'auto'
  ): Promise<string> {
    const root = path.join(app.getPath('userData'), 'gradle-runtime')
    const home = path.join(root, `gradle-${gradleVersion}`)
    const executable = path.join(home, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')
    if (await exists(executable)) return executable

    await fs.mkdir(root, { recursive: true })
    const archive = path.join(root, `gradle-${gradleVersion}-bin.zip`)
    const temporary = `${archive}.${process.pid}.download`
    const staging = path.join(root, `.gradle-${gradleVersion}-${process.pid}.extracting`)
    let expectedChecksum = gradleChecksumForVersion(gradleVersion)
    if (!expectedChecksum) {
      const checksumResponse = await fetch(`https://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip.sha256`, {
        signal: AbortSignal.timeout(30_000)
      })
      if (!checksumResponse.ok) throw new Error(`Gradle 校验文件下载失败：HTTP ${checksumResponse.status}`)
      expectedChecksum = (await checksumResponse.text()).trim().split(/\s+/)[0]?.toLowerCase()
    }
    if (!expectedChecksum || !/^[a-f0-9]{64}$/.test(expectedChecksum)) throw new Error('Gradle 官方校验值格式无效')

    let sources = gradleDistributionSources(gradleVersion, preference)
    if (preference === 'auto') {
      this.emit('building-mod', '正在测速 Gradle 下载源')
      const probes = await Promise.all(sources.map(async (source) => ({
        source,
        throughput: await probeGradleDistributionSource(source)
      })))
      sources = probes.sort((left, right) => right.throughput - left.throughput).map((probe) => probe.source)
      const fastest = probes[0]
      if (fastest?.throughput) {
        this.emit('building-mod', `已选择${fastest.source.label}（测速 ${((fastest.throughput * 1000) / 1024 / 1024).toFixed(1)} MiB/s）`)
      }
    }
    const attempts: GradleDistributionSource[] = preference === 'official'
      ? [...sources, ...sources, ...sources]
      : sources
    const failures: string[] = []
    let downloadedGradle = false
    for (let index = 0; index < attempts.length && !downloadedGradle; index += 1) {
      const source = attempts[index]
      try {
        await fs.rm(temporary, { force: true })
        this.emit('building-mod', `正在从${source.label}下载 Gradle ${gradleVersion}`)
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(5 * 60_000)
        })
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        const total = Number(response.headers.get('content-length')) || 0
        let downloaded = 0
        const progress = new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            downloaded += chunk.length
            this.emitProgress('building-mod', `${source.label} · Gradle ${gradleVersion}`, downloaded, total)
            callback(null, chunk)
          }
        })
        await pipeline(Readable.fromWeb(response.body as never), progress, createWriteStream(temporary))
        const hasher = createHash('sha256')
        await pipeline(createReadStream(temporary), hasher)
        if (hasher.digest('hex') !== expectedChecksum) {
          throw new Error('SHA-256 与模板固定校验值不一致')
        }
        downloadedGradle = true
      } catch (error) {
        await fs.rm(temporary, { force: true })
        const reason = error instanceof Error ? error.message : String(error)
        failures.push(`${source.label}: ${reason}`)
        if (index + 1 < attempts.length) {
          this.emit('building-mod', `${source.label}不可用，正在自动切换下载源`, 'warning')
        }
      }
    }
    if (!downloadedGradle) throw new Error(`Gradle 下载失败：${failures.join('；')}`)
    await fs.rm(archive, { force: true })
    await fs.rename(temporary, archive)
    this.emit('building-mod', '正在解压 Gradle')
    try {
      await fs.rm(staging, { recursive: true, force: true })
      await fs.mkdir(staging, { recursive: true })
      await extractZip(archive, { dir: staging })
      const stagedHome = path.join(staging, `gradle-${gradleVersion}`)
      const stagedExecutable = path.join(stagedHome, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')
      if (!(await exists(stagedExecutable))) throw new Error('Gradle 解压完成，但未找到启动程序')
      if (!(await exists(home))) await fs.rename(stagedHome, home)
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
      await fs.rm(archive, { force: true }).catch(() => undefined)
    }
    if (!(await exists(executable))) throw new Error('Gradle 运行时安装未完成')
    return executable
  }

  private instanceRoot(project: ProjectInfo): string {
    return path.join(project.path, projectDataDirectory(project), 'minecraft')
  }

  private modsRoot(project: ProjectInfo): string {
    return path.join(this.instanceRoot(project), 'mods')
  }

  private metadataPath(project: ProjectInfo): string {
    return path.join(this.instanceRoot(project), 'runtime.json')
  }

  private async handleMinecraftExit(
    project: ProjectInfo,
    launchedAt: number,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    const crashed = code !== 0 && code !== null
    if (!crashed) {
      const message = `Minecraft 已退出${signal ? ` (${signal})` : ''}`
      await fs.writeFile(path.join(this.instanceRoot(project), 'last-clean-exit'), new Date().toISOString(), 'utf8').catch(() => undefined)
      this.updateState({ stage: 'stopped', running: false, pid: undefined, message, lastCrash: undefined })
      this.emit('stopped', message, 'info')
      return
    }

    const signedCode = code > 0x7fffffff ? code - 0x100000000 : code
    const parsedCrash = await this.readLatestCrash(project, launchedAt)
    const lastCrash: MinecraftCrashInfo = parsedCrash ?? {
      summary: `Minecraft 异常退出，代码 ${signedCode}`,
      exitCode: signedCode,
      time: new Date().toISOString()
    }
    lastCrash.exitCode = signedCode
    const { summary, reportPath } = lastCrash
    const message = summary.split('\n')[0] || `Minecraft 异常退出，代码 ${signedCode}`
    this.updateState({ stage: 'error', running: false, pid: undefined, message, lastCrash })
    this.emit('error', `${message}${reportPath ? `\n崩溃报告：${reportPath}` : ''}`, 'error')
  }

  private async readLatestCrash(project: ProjectInfo, launchedAt: number): Promise<MinecraftCrashInfo | undefined> {
    try {
      const instanceRoot = this.instanceRoot(project)
      const crashDirectory = path.join(instanceRoot, 'crash-reports')
      const entries = await fs.readdir(crashDirectory, { withFileTypes: true })
      const reports = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
          .map(async (entry) => {
            const filePath = path.join(crashDirectory, entry.name)
            return { filePath, stat: await fs.stat(filePath) }
          })
      )
      const latest = reports.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]
      if (!latest || latest.stat.mtimeMs < launchedAt - 2_000) return undefined
      if (launchedAt === 0) {
        const cleanExitTime = await fs.stat(path.join(instanceRoot, 'last-clean-exit')).then((stat) => stat.mtimeMs).catch(() => 0)
        if (latest.stat.mtimeMs <= cleanExitTime) return undefined
      }
      const summary = summarizeMinecraftCrash(await fs.readFile(latest.filePath, 'utf8'))
      if (!summary) return undefined
      return {
        summary,
        reportPath: latest.filePath,
        exitCode: null,
        time: latest.stat.mtime.toISOString()
      }
    } catch {
      return undefined
    }
  }

  private async readMetadata(project: ProjectInfo): Promise<RuntimeMetadata | null> {
    try {
      const metadata = JSON.parse(await fs.readFile(this.metadataPath(project), 'utf8')) as Partial<RuntimeMetadata>
      if (metadata.minecraftVersion !== project.minecraftVersion) return null
      const loader = metadata.loader ?? (metadata.fabricVersionId ? 'fabric' : undefined)
      const loaderVersionId = metadata.loaderVersionId ?? metadata.fabricVersionId
      if (loader !== project.loader || !loaderVersionId || !metadata.loaderVersion || !metadata.javaPath || !metadata.javaTarget || !metadata.preparedAt) return null
      return {
        minecraftVersion: project.minecraftVersion,
        loader,
        loaderVersionId,
        fabricVersionId: metadata.fabricVersionId,
        loaderVersion: metadata.loaderVersion,
        javaPath: metadata.javaPath,
        javaTarget: metadata.javaTarget,
        preparedAt: metadata.preparedAt
      }
    } catch {
      return null
    }
  }

  private updateState(changes: Partial<MinecraftRuntimeState>): void {
    this.state = { ...this.state, ...changes }
    this.onState(this.getState())
  }

  private emit(
    stage: MinecraftRuntimeStage,
    message: string,
    level: MinecraftRuntimeEvent['level'] = 'info',
    updateState = true
  ): void {
    if (!message) return
    const event: MinecraftRuntimeEvent = { stage, message, level, time: new Date().toISOString() }
    this.onEvent(event)
    if (updateState) this.updateState({ stage, message })
  }

  private emitProgress(stage: MinecraftRuntimeStage, message: string, progress: number, total: number): void {
    const now = Date.now()
    const finished = total > 0 && progress >= total
    if (this.lastProgressStage === stage && now - this.lastProgressAt < 150 && !finished) return
    this.lastProgressAt = now
    this.lastProgressStage = stage
    this.onEvent({ stage, message, progress, total, time: new Date().toISOString(), level: 'info' })
    this.updateState({ stage, message })
  }
}
