import type { LoaderKind, ProjectInfo } from './types'

export interface DependencyProject {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  downloads: number
  followers: number
  clientSide: 'required' | 'optional' | 'unsupported' | 'unknown'
  serverSide: 'required' | 'optional' | 'unsupported' | 'unknown'
  categories: string[]
}

export interface DependencySearchResult {
  query: string
  total: number
  offset: number
  hits: DependencyProject[]
}

export interface DependencyVersion {
  id: string
  projectId: string
  name: string
  versionNumber: string
  versionType: 'release' | 'beta' | 'alpha'
  datePublished: string
  gameVersions: string[]
  loaders: string[]
}

export interface ManagedDependency {
  projectId: string
  versionId: string
  slug: string
  name: string
  versionNumber: string
  fileName: string
  relativePath: string
  installedAt: string
  environment: 'client' | 'server' | 'both'
  source?: 'modrinth' | 'maven'
  coordinate?: string
  repository?: string
  configuration?: 'implementation' | 'modImplementation' | 'compileOnly' | 'runtimeOnly'
  sha512?: string
}

export interface DependencyInstallInput {
  projectId: string
  versionId?: string
  environment?: ManagedDependency['environment']
}

export interface MavenDependencyInput {
  coordinate: string
  repository?: string
  configuration?: ManagedDependency['configuration']
}

export interface DependencyAuditResult {
  success: boolean
  checked: number
  errors: string[]
  warnings: string[]
}

export interface GitChange {
  path: string
  index: string
  worktree: string
}

export interface GitStatus {
  available: boolean
  initialized: boolean
  branch: string
  ahead: number
  behind: number
  changes: GitChange[]
}

export interface GitCommitInput {
  message: string
  authorName?: string
  authorEmail?: string
}

export interface GitRemote {
  name: string
  url: string
}

export type ContentKind =
  | 'language'
  | 'recipe-shaped'
  | 'recipe-shapeless'
  | 'item-tag'
  | 'block-tag'
  | 'loot-block'
  | 'advancement'
  | 'data-json'
  | 'asset-json'

export interface ContentCreateInput {
  kind: ContentKind
  id: string
  locale?: string
  data: Record<string, unknown>
}

export interface ContentCreateResult {
  paths: string[]
  summary: string
  warnings: string[]
}

export interface AudioImportInput {
  eventId: string
  stream?: boolean
  volume?: number
  pitch?: number
}

export interface ContentValidationResult {
  success: boolean
  checkedFiles: number
  errors: string[]
  warnings: string[]
}

export type TestTarget = 'build' | 'client' | 'server' | 'gametest'

export interface TestTargetResult {
  target: TestTarget
  status: 'passed' | 'failed' | 'skipped'
  summary: string
  durationMs: number
  logPath?: string
}

export interface TestMatrixResult {
  success: boolean
  startedAt: string
  completedAt: string
  results: TestTargetResult[]
}

export interface ReleaseSettings {
  version: string
  displayName: string
  changelog: string
  channel: 'release' | 'beta' | 'alpha'
  modrinthProjectId: string
  curseForgeProjectId: string
  githubRepository: string
  hasModrinthToken?: boolean
  hasCurseForgeToken?: boolean
  hasGithubToken?: boolean
  modrinthToken?: string
  curseForgeToken?: string
  githubToken?: string
}

export interface ReleaseCheck {
  id: string
  label: string
  status: 'pass' | 'warning' | 'fail'
  detail: string
}

export interface ReleasePreflightResult {
  ready: boolean
  artifactPath?: string
  artifactSize?: number
  checks: ReleaseCheck[]
}

export interface ReleasePublishInput {
  targets: Array<'modrinth' | 'curseforge' | 'github'>
  confirmed: boolean
}

export interface ReleasePublishResult {
  target: 'modrinth' | 'curseforge' | 'github'
  success: boolean
  url?: string
  detail: string
}

export interface ProductionApi {
  dependencies: {
    search: (query: string, offset?: number) => Promise<DependencySearchResult>
    versions: (projectId: string) => Promise<DependencyVersion[]>
    list: () => Promise<ManagedDependency[]>
    install: (input: DependencyInstallInput) => Promise<ManagedDependency>
    installMaven: (input: MavenDependencyInput) => Promise<ManagedDependency>
    audit: () => Promise<DependencyAuditResult>
    remove: (projectId: string) => Promise<ManagedDependency[]>
  }
  git: {
    status: () => Promise<GitStatus>
    initialize: () => Promise<GitStatus>
    diff: (relativePath?: string) => Promise<string>
    commit: (input: GitCommitInput) => Promise<GitStatus>
    createBranch: (name: string) => Promise<GitStatus>
    listRemotes: () => Promise<GitRemote[]>
    addRemote: (name: string, url: string) => Promise<GitRemote[]>
    removeRemote: (name: string) => Promise<GitRemote[]>
    fetch: (remote?: string) => Promise<GitStatus>
    pull: (remote?: string, branch?: string) => Promise<GitStatus>
    push: (remote?: string, branch?: string) => Promise<GitStatus>
    merge: (branch: string) => Promise<GitStatus>
    rebase: (branch: string) => Promise<GitStatus>
    pullRequestUrl: (remote?: string) => Promise<string>
  }
  content: {
    create: (input: ContentCreateInput) => Promise<ContentCreateResult>
    importAudio: (input: AudioImportInput) => Promise<ContentCreateResult | null>
    validate: () => Promise<ContentValidationResult>
  }
  tests: {
    runMatrix: (targets: TestTarget[]) => Promise<TestMatrixResult>
    generateWorkflow: () => Promise<string>
  }
  release: {
    getSettings: () => Promise<ReleaseSettings>
    saveSettings: (settings: ReleaseSettings) => Promise<ReleaseSettings>
    preflight: () => Promise<ReleasePreflightResult>
    publish: (input: ReleasePublishInput) => Promise<ReleasePublishResult[]>
  }
}

export interface ProjectFileMutationResult {
  project: ProjectInfo
  path: string
}

export interface ProductionContext {
  project: ProjectInfo
  loader: LoaderKind
}
