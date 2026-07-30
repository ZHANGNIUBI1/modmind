import type { LoaderKind } from './types'

export type MinecraftRuntimeStage =
  | 'idle'
  | 'preparing'
  | 'downloading-java'
  | 'downloading-game'
  | 'installing-loader'
  | 'installing-fabric'
  | 'building-mod'
  | 'testing-server'
  | 'syncing-mod'
  | 'launching'
  | 'running'
  | 'stopped'
  | 'error'

export interface MinecraftRuntimeEvent {
  stage: MinecraftRuntimeStage
  message: string
  time: string
  progress?: number
  total?: number
  level?: 'info' | 'warning' | 'error'
}

export function appendMinecraftRuntimeEvent(
  events: MinecraftRuntimeEvent[],
  event: MinecraftRuntimeEvent,
  limit: number
): MinecraftRuntimeEvent[] {
  const last = events.at(-1)
  if (
    event.progress !== undefined
    && last?.progress !== undefined
    && last.stage === event.stage
    && last.message === event.message
  ) {
    return [...events.slice(0, -1), event].slice(-limit)
  }
  return [...events, event].slice(-limit)
}

export interface MinecraftManagedMod {
  name: string
  path: string
  size: number
  modifiedAt: string
  projectArtifact: boolean
}

export interface MinecraftCrashInfo {
  summary: string
  reportPath?: string
  exitCode: number | null
  time: string
}

export interface MinecraftRuntimeState {
  stage: MinecraftRuntimeStage
  minecraftVersion: string
  loader?: LoaderKind
  loaderVersionId?: string
  fabricVersionId?: string
  loaderVersion?: string
  javaPath?: string
  instancePath?: string
  installed: boolean
  running: boolean
  pid?: number
  message: string
  mods: MinecraftManagedMod[]
  lastCrash?: MinecraftCrashInfo
}

export interface MinecraftLaunchOptions {
  username: string
  maxMemoryMb: number
  width?: number
  height?: number
}

export interface MinecraftLaunchTestResult {
  success: boolean
  state: MinecraftRuntimeState
  crash?: MinecraftCrashInfo
}

export interface GradleVerificationResult {
  task?: string
  skipped: boolean
  success: boolean
  summary: string
  logPath?: string
}

export interface MinecraftApi {
  getState: () => Promise<MinecraftRuntimeState>
  prepare: () => Promise<MinecraftRuntimeState>
  buildProject: () => Promise<MinecraftManagedMod>
  launch: (options: MinecraftLaunchOptions) => Promise<MinecraftRuntimeState>
  testLaunch: (options: MinecraftLaunchOptions) => Promise<MinecraftLaunchTestResult>
  stop: () => Promise<MinecraftRuntimeState>
  syncProjectMod: () => Promise<MinecraftManagedMod | null>
  importMods: () => Promise<MinecraftManagedMod[]>
  removeMod: (name: string) => Promise<MinecraftManagedMod[]>
  listMods: () => Promise<MinecraftManagedMod[]>
  onState: (listener: (state: MinecraftRuntimeState) => void) => () => void
  onEvent: (listener: (event: MinecraftRuntimeEvent) => void) => () => void
}
