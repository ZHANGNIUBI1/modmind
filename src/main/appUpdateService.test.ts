import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdater, UpdateCheckResult } from 'electron-updater'
import { AppUpdateService, normalizeAppUpdateUrl } from './appUpdateService'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  autoRunAppAfterInstall = false
  allowPrerelease = false
  allowDowngrade = false
  channel: string | null = null
  feed: unknown
  quitAndInstall = vi.fn()

  constructor(private readonly result: UpdateCheckResult, private readonly installerPath: string) {
    super()
  }

  setFeedURL(value: unknown): void {
    this.feed = value
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    return this.result
  }

  async downloadUpdate(): Promise<string[]> {
    const stat = await fs.stat(this.installerPath)
    this.emit('download-progress', { total: stat.size, delta: stat.size, transferred: stat.size, percent: 100, bytesPerSecond: 4 * 1024 * 1024 })
    return [this.installerPath]
  }
}

const temporaryRoots: string[] = []
const originalLocalAppData = process.env.LOCALAPPDATA

afterEach(async () => {
  process.env.LOCALAPPDATA = originalLocalAppData
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(version: string): Promise<{ root: string; userData: string; installer: string; sha512: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-update-'))
  temporaryRoots.push(root)
  process.env.LOCALAPPDATA = root
  const userData = path.join(root, 'user-data')
  const installer = path.join(root, 'modmind-updater', 'pending', `ModMind-Setup-${version}.exe`)
  const bytes = Buffer.alloc(10 * 1024 * 1024 + 1, 7)
  await fs.mkdir(path.dirname(installer), { recursive: true })
  await fs.writeFile(installer, bytes)
  return { root, userData, installer, sha512: createHash('sha512').update(bytes).digest('base64') }
}

describe('AppUpdateService', () => {
  it('normalizes only trusted HTTPS update bases', () => {
    expect(normalizeAppUpdateUrl('https://updates.example.com/modmind')).toBe('https://updates.example.com/modmind/')
    expect(() => normalizeAppUpdateUrl('http://updates.example.com/')).toThrow(/HTTPS/)
    expect(() => normalizeAppUpdateUrl('https://user:secret@updates.example.com/')).toThrow(/HTTPS/)
  })

  it('downloads a stable release, reports progress, and persists the verified metadata', async () => {
    const files = await fixture('1.3.12')
    const updateInfo = {
      version: '1.3.12',
      files: [{ url: 'ModMind-Setup-1.3.12.exe', sha512: files.sha512, size: 10 * 1024 * 1024 + 1 }],
      path: 'ModMind-Setup-1.3.12.exe',
      sha512: files.sha512,
      releaseDate: '2026-08-25T00:00:00.000Z'
    }
    const updater = new FakeUpdater({ isUpdateAvailable: true, updateInfo, versionInfo: updateInfo }, files.installer)
    const notifyDownloaded = vi.fn()
    const service = new AppUpdateService({
      currentVersion: '2.0.0-beta.5',
      updateUrl: 'https://updates.example.com/',
      userDataPath: files.userData,
      isPackaged: true,
      platform: 'win32',
      updater: updater as unknown as AppUpdater,
      beforeInstall: vi.fn(),
      quit: vi.fn(),
      notifyDownloaded
    })
    service.setAvailableUpdate({
      currentVersion: '2.0.0-beta.5',
      latestVersion: '1.3.12',
      currentChannel: 'beta',
      targetChannel: 'stable',
      updateAvailable: true
    })

    await expect(service.downloadUpdate()).resolves.toMatchObject({
      phase: 'downloaded', latestVersion: '1.3.12', downloadedBytes: 10 * 1024 * 1024 + 1
    })
    expect(updater.feed).toMatchObject({ provider: 'generic', channel: 'latest', url: 'https://updates.example.com/' })
    expect(updater.allowPrerelease).toBe(false)
    expect(updater.allowDowngrade).toBe(true)
    expect(notifyDownloaded).toHaveBeenCalledWith('1.3.12')
    await expect(fs.readFile(path.join(files.userData, 'pending-app-update.json'), 'utf8')).resolves.toContain('ModMind-Setup-1.3.12.exe')

    const beforeImmediateInstall = vi.fn()
    const immediateService = new AppUpdateService({
      currentVersion: '2.0.0-beta.5',
      updateUrl: 'https://updates.example.com/',
      userDataPath: files.userData,
      isPackaged: true,
      platform: 'win32',
      updater: updater as unknown as AppUpdater,
      beforeInstall: beforeImmediateInstall,
      quit: vi.fn(),
      notifyDownloaded: vi.fn()
    })
    immediateService.setAvailableUpdate({
      currentVersion: '2.0.0-beta.5', latestVersion: '1.3.12', currentChannel: 'beta', targetChannel: 'stable', updateAvailable: true
    })
    await immediateService.downloadUpdate()
    await expect(immediateService.installDownloadedUpdate()).resolves.toBe(true)
    expect(beforeImmediateInstall).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)

    const launchInstaller = vi.fn(async () => undefined)
    const beforeRestartInstall = vi.fn()
    const quit = vi.fn()
    const restartedService = new AppUpdateService({
      currentVersion: '2.0.0-beta.5',
      updateUrl: 'https://updates.example.com/',
      userDataPath: files.userData,
      isPackaged: true,
      platform: 'win32',
      updater: new FakeUpdater({ isUpdateAvailable: true, updateInfo, versionInfo: updateInfo }, files.installer) as unknown as AppUpdater,
      beforeInstall: beforeRestartInstall,
      quit,
      notifyDownloaded: vi.fn(),
      launchInstaller
    })
    await expect(restartedService.installPendingUpdateOnStartup()).resolves.toBe(true)
    expect(launchInstaller).toHaveBeenCalledWith(files.installer)
    expect(beforeRestartInstall).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('refuses downloads that were not offered by the version policy', async () => {
    const files = await fixture('1.4.0-beta.2')
    const updateInfo = { version: '1.4.0-beta.2', files: [], path: '', sha512: files.sha512, releaseDate: '' }
    const updater = new FakeUpdater({ isUpdateAvailable: true, updateInfo, versionInfo: updateInfo }, files.installer)
    const service = new AppUpdateService({
      currentVersion: '1.3.12',
      updateUrl: 'https://updates.example.com/',
      userDataPath: files.userData,
      isPackaged: true,
      platform: 'win32',
      updater: updater as unknown as AppUpdater,
      beforeInstall: vi.fn(),
      quit: vi.fn(),
      notifyDownloaded: vi.fn()
    })
    service.setAvailableUpdate({
      currentVersion: '1.3.12',
      latestVersion: '1.4.0-beta.2',
      currentChannel: 'stable',
      targetChannel: 'beta',
      updateAvailable: false
    })
    await expect(service.downloadUpdate()).rejects.toThrow(/没有可下载/)
  })
})
