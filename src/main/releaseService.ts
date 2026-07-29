import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  ManagedDependency,
  ReleasePreflightResult,
  ReleasePublishInput,
  ReleasePublishResult,
  ReleaseSettings
} from '../shared/production'
import type { ProjectInfo } from '../shared/types'

export interface ReleaseSecrets {
  modrinthToken: string
  curseForgeToken: string
  githubToken: string
}

const defaults = (project: ProjectInfo): ReleaseSettings => ({
  version: '0.1.0',
  displayName: `${project.name} 0.1.0`,
  changelog: '',
  channel: 'release',
  modrinthProjectId: '',
  curseForgeProjectId: '',
  githubRepository: ''
})

function configPath(project: ProjectInfo): string {
  return path.join(project.path, 'modmind.release.json')
}

function cleanSettings(project: ProjectInfo, input: ReleaseSettings): ReleaseSettings {
  const version = input.version.trim()
  if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) throw new Error('发布版本号无效')
  const repository = input.githubRepository.trim()
  if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GitHub 仓库需要使用 owner/repository 格式')
  return {
    ...defaults(project),
    version,
    displayName: input.displayName.trim().slice(0, 120) || `${project.name} ${version}`,
    changelog: input.changelog.slice(0, 100_000),
    channel: input.channel === 'alpha' || input.channel === 'beta' ? input.channel : 'release',
    modrinthProjectId: input.modrinthProjectId.trim().slice(0, 160),
    curseForgeProjectId: input.curseForgeProjectId.trim().slice(0, 40),
    githubRepository: repository
  }
}

async function readDependencies(project: ProjectInfo): Promise<ManagedDependency[]> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(project.path, 'modmind.dependencies.json'), 'utf8')) as { dependencies?: ManagedDependency[] }
    return Array.isArray(manifest.dependencies) ? manifest.dependencies : []
  } catch {
    return []
  }
}

async function findArtifact(project: ProjectInfo): Promise<{ path: string; size: number } | null> {
  const directory = path.join(project.path, 'build', 'libs')
  const candidates = await Promise.all((await fs.readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jar') && !/(?:sources|javadoc|dev|shadow)/i.test(entry.name))
    .map(async (entry) => ({ path: path.join(directory, entry.name), stat: await fs.stat(path.join(directory, entry.name)) })))
  const latest = candidates.filter((entry) => entry.stat.size >= 1024).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]
  return latest ? { path: latest.path, size: latest.stat.size } : null
}

async function checkedFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${label}失败：HTTP ${response.status}${body ? ` - ${body.slice(0, 1_000)}` : ''}`)
  }
  return response
}

export class ReleaseService {
  constructor(
    private readonly getProject: () => ProjectInfo,
    private readonly readSecrets: () => Promise<ReleaseSecrets>,
    private readonly writeSecrets: (secrets: ReleaseSecrets) => Promise<void>,
    private readonly productVersion = 'development'
  ) {}

  async getSettings(): Promise<ReleaseSettings> {
    const project = this.getProject()
    const secrets = await this.readSecrets()
    const stored = await fs.readFile(configPath(project), 'utf8').then((value) => JSON.parse(value) as ReleaseSettings).catch(() => defaults(project))
    return {
      ...defaults(project),
      ...stored,
      hasModrinthToken: Boolean(secrets.modrinthToken),
      hasCurseForgeToken: Boolean(secrets.curseForgeToken),
      hasGithubToken: Boolean(secrets.githubToken)
    }
  }

  async saveSettings(input: ReleaseSettings): Promise<ReleaseSettings> {
    const project = this.getProject()
    const settings = cleanSettings(project, input)
    const previous = await this.readSecrets()
    await this.writeSecrets({
      modrinthToken: input.modrinthToken?.trim() || previous.modrinthToken,
      curseForgeToken: input.curseForgeToken?.trim() || previous.curseForgeToken,
      githubToken: input.githubToken?.trim() || previous.githubToken
    })
    await fs.writeFile(configPath(project), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    return this.getSettings()
  }

  async preflight(): Promise<ReleasePreflightResult> {
    const project = this.getProject()
    const settings = await this.getSettings()
    const artifact = await findArtifact(project)
    const checks: ReleasePreflightResult['checks'] = []
    checks.push({ id: 'artifact', label: '发布 JAR', status: artifact ? 'pass' : 'fail', detail: artifact ? `${path.basename(artifact.path)} · ${(artifact.size / 1024).toFixed(1)} KB` : 'build/libs 中没有有效发布 JAR' })
    const license = await Promise.any(['LICENSE', 'LICENSE.txt', 'COPYING'].map((name) => fs.access(path.join(project.path, name)).then(() => name))).catch(() => '')
    checks.push({ id: 'license', label: '许可证', status: license ? 'pass' : 'warning', detail: license || '建议在项目根目录添加 LICENSE' })
    checks.push({ id: 'version', label: '版本号', status: /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(settings.version) ? 'pass' : 'fail', detail: settings.version || '未配置' })
    checks.push({ id: 'changelog', label: '更新日志', status: settings.changelog.trim() ? 'pass' : 'warning', detail: settings.changelog.trim() ? `${settings.changelog.trim().length} 个字符` : '尚未填写更新日志' })
    const descriptor = project.loader === 'fabric'
      ? 'src/main/resources/fabric.mod.json'
      : project.loader === 'quilt' ? 'src/main/resources/quilt.mod.json'
        : project.loader === 'neoforge' ? 'src/main/resources/META-INF/neoforge.mods.toml' : 'src/main/resources/META-INF/mods.toml'
    const descriptorExists = await fs.access(path.join(project.path, descriptor)).then(() => true).catch(() => false)
    checks.push({ id: 'descriptor', label: '模组元数据', status: descriptorExists ? 'pass' : 'fail', detail: descriptor })
    return {
      ready: checks.every((check) => check.status !== 'fail'),
      ...(artifact ? { artifactPath: artifact.path, artifactSize: artifact.size } : {}),
      checks
    }
  }

  private async publishModrinth(settings: ReleaseSettings, secrets: ReleaseSecrets, artifactPath: string): Promise<ReleasePublishResult> {
    if (!settings.modrinthProjectId || !secrets.modrinthToken) throw new Error('Modrinth 项目 ID 或令牌未配置')
    const project = this.getProject()
    const dependencies = await readDependencies(project)
    const bytes = await fs.readFile(artifactPath)
    const form = new FormData()
    form.append('data', JSON.stringify({
      name: settings.displayName,
      version_number: settings.version,
      changelog: settings.changelog,
      dependencies: dependencies.map((entry) => ({ project_id: entry.projectId, dependency_type: 'required' })),
      game_versions: [project.minecraftVersion],
      version_type: settings.channel,
      loaders: [project.loader],
      featured: false,
      project_id: settings.modrinthProjectId,
      file_parts: ['file'],
      primary_file: 'file'
    }))
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/java-archive' }), path.basename(artifactPath))
    const response = await checkedFetch('https://api.modrinth.com/v2/version', {
      method: 'POST', headers: { Authorization: secrets.modrinthToken, 'User-Agent': `ModMind/${this.productVersion} (publisher)` }, body: form
    }, 'Modrinth 发布')
    const value = await response.json() as { id?: string }
    return { target: 'modrinth', success: true, url: `https://modrinth.com/mod/${settings.modrinthProjectId}/version/${value.id ?? ''}`, detail: `已发布 ${settings.version}` }
  }

  private async publishCurseForge(settings: ReleaseSettings, secrets: ReleaseSecrets, artifactPath: string): Promise<ReleasePublishResult> {
    if (!/^\d+$/.test(settings.curseForgeProjectId) || !secrets.curseForgeToken) throw new Error('CurseForge 项目 ID 或令牌未配置')
    const project = this.getProject()
    const bytes = await fs.readFile(artifactPath)
    const releaseType = settings.channel === 'release' ? 'release' : settings.channel === 'beta' ? 'beta' : 'alpha'
    const form = new FormData()
    form.append('metadata', JSON.stringify({ changelog: settings.changelog, changelogType: 'markdown', displayName: settings.displayName, releaseType, gameVersions: [project.minecraftVersion] }))
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/java-archive' }), path.basename(artifactPath))
    const response = await checkedFetch(`https://minecraft.curseforge.com/api/projects/${settings.curseForgeProjectId}/upload-file`, {
      method: 'POST', headers: { 'X-Api-Token': secrets.curseForgeToken }, body: form
    }, 'CurseForge 发布')
    const value = await response.json().catch(() => ({})) as { id?: number }
    return { target: 'curseforge', success: true, url: `https://www.curseforge.com/minecraft/mc-mods/${settings.curseForgeProjectId}/files/${value.id ?? ''}`, detail: `已上传 ${settings.version}` }
  }

  private async publishGithub(settings: ReleaseSettings, secrets: ReleaseSecrets, artifactPath: string): Promise<ReleasePublishResult> {
    if (!settings.githubRepository || !secrets.githubToken) throw new Error('GitHub 仓库或令牌未配置')
    const headers = { Authorization: `Bearer ${secrets.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    const response = await checkedFetch(`https://api.github.com/repos/${settings.githubRepository}/releases`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: `v${settings.version}`, name: settings.displayName, body: settings.changelog, prerelease: settings.channel !== 'release' })
    }, 'GitHub Release 创建')
    const release = await response.json() as { upload_url?: string; html_url?: string }
    if (!release.upload_url) throw new Error('GitHub 没有返回资源上传地址')
    const bytes = await fs.readFile(artifactPath)
    const uploadUrl = `${release.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(path.basename(artifactPath))}`
    await checkedFetch(uploadUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/java-archive' }, body: new Uint8Array(bytes) }, 'GitHub 资源上传')
    return { target: 'github', success: true, url: release.html_url, detail: `已创建 v${settings.version}` }
  }

  async publish(input: ReleasePublishInput): Promise<ReleasePublishResult[]> {
    if (!input.confirmed) throw new Error('发布操作需要明确确认')
    const targets = [...new Set(input.targets)].filter((target) => target === 'modrinth' || target === 'curseforge' || target === 'github')
    if (!targets.length) throw new Error('请选择至少一个发布平台')
    const preflight = await this.preflight()
    if (!preflight.ready || !preflight.artifactPath) throw new Error('发布预检未通过')
    const settings = await this.getSettings()
    const secrets = await this.readSecrets()
    const results: ReleasePublishResult[] = []
    for (const target of targets) {
      try {
        const result = target === 'modrinth'
          ? await this.publishModrinth(settings, secrets, preflight.artifactPath)
          : target === 'curseforge'
            ? await this.publishCurseForge(settings, secrets, preflight.artifactPath)
            : await this.publishGithub(settings, secrets, preflight.artifactPath)
        results.push(result)
      } catch (error) {
        results.push({ target, success: false, detail: error instanceof Error ? error.message : String(error) })
      }
    }
    return results
  }
}
