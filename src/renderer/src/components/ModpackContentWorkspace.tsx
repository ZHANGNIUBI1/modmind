import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  FileCode2,
  FileCog,
  FileArchive,
  FileJson,
  FolderOpen,
  Image,
  ListChecks,
  LoaderCircle,
  MonitorCog,
  PackageOpen,
  Save,
  ServerCog,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles
} from 'lucide-react'
import type { ModpackContentInventory, ModpackContentItem, ModpackContentKind, ModpackContentScope, ModpackManifest, ProjectInfo, ServerPackManifest } from '../../../shared/types'
import { useConfirmDialog } from './InteractionDialogs'
import { cachedModpackContent, loadModpackContent } from '../modpackContentCache'

export type ModpackContentSection = Exclude<ModpackContentKind, 'quests'>

type TargetRequirement = { label: string; matches: string[] }
type TargetPreset = { label: string; path: string; scope?: ModpackContentScope; file?: boolean; requirement?: TargetRequirement }
type StarterFile = { label: string; path: string; content?: (project: ProjectInfo) => string }
type ContentTone = 'datapack' | 'resourcepack' | 'shaderpack' | 'world' | 'utility'
type SectionInfo = {
  label: string
  description: string
  icon: typeof FileJson
  path: string
  targets: TargetPreset[]
  starters: StarterFile[]
  mode: 'editor' | 'assets'
  scopeOptions: ModpackContentScope[]
  tone: ContentTone
  addLabel: string
  emptyTitle: string
  emptyDescription: string
  supportsExtract?: boolean
}

function dataPackFormat(minecraftVersion: string): number {
  if (minecraftVersion === '1.20.1') return 15
  if (minecraftVersion === '1.20.6') return 41
  return 48
}

function dataPackMetadata(project: ProjectInfo): string {
  return `${JSON.stringify({ pack: { pack_format: dataPackFormat(project.minecraftVersion), description: `${project.name} data pack` } }, null, 2)}\n`
}

const sectionInfo: Record<ModpackContentSection, SectionInfo> = {
  config: { label: '配置与默认项', description: 'config · defaultconfigs · serverconfig', icon: FileCog, path: 'config/', targets: [{ label: '通用配置', path: 'config' }, { label: '默认配置', path: 'defaultconfigs' }, { label: '服务端配置', path: 'serverconfig', scope: 'server' }], starters: [{ label: '通用配置', path: 'config/pack.toml' }, { label: '默认配置', path: 'defaultconfigs/pack.toml' }], mode: 'editor', scopeOptions: ['common', 'client', 'server'], tone: 'utility', addLabel: '添加配置', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' },
  scripts: { label: '脚本与 KubeJS', description: 'KubeJS 与启动脚本', icon: Braces, path: 'kubejs/', targets: [{ label: 'KubeJS', path: 'kubejs' }, { label: '启动脚本', path: 'scripts' }], starters: [{ label: '服务端脚本', path: 'kubejs/server_scripts/pack.js' }, { label: '客户端脚本', path: 'kubejs/client_scripts/pack.js' }], mode: 'editor', scopeOptions: ['common', 'client', 'server'], tone: 'utility', addLabel: '添加脚本', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' },
  datapacks: { label: '数据包', description: 'datapacks · OpenLoader · Paxi', icon: FileJson, path: 'datapacks/', targets: [{ label: '数据包', path: 'datapacks' }, { label: 'OpenLoader', path: 'openloader/data', requirement: { label: 'OpenLoader', matches: ['openloader'] } }, { label: 'Paxi', path: 'paxi/datapacks', requirement: { label: 'Paxi', matches: ['paxi'] } }], starters: [{ label: '数据包描述', path: 'datapacks/pack.mcmeta', content: dataPackMetadata }, { label: '函数文件', path: 'datapacks/data/example/functions/start.mcfunction', content: () => '# Runs from your data pack.\n' }], mode: 'editor', scopeOptions: ['common', 'client', 'server'], tone: 'utility', addLabel: '添加数据包', emptyTitle: '暂无数据包内容', emptyDescription: '从描述文件或函数入口开始，完成后可在代码编辑器中继续编辑' },
  resourcepacks: { label: '资源包', description: '客户端视觉资源', icon: Image, path: 'resourcepacks/', targets: [{ label: '资源包', path: 'resourcepacks', scope: 'client' }], starters: [], mode: 'assets', scopeOptions: ['client'], tone: 'utility', addLabel: '添加资源包', emptyTitle: '暂无资源包', emptyDescription: '导入或下载 ZIP 资源包后，它会以客户端内容随整合包分发' },
  shaderpacks: { label: '光影包', description: 'shaderpacks · 客户端内容', icon: Sparkles, path: 'shaderpacks/', targets: [{ label: '光影包', path: 'shaderpacks', scope: 'client' }], starters: [], mode: 'assets', scopeOptions: ['client'], tone: 'utility', addLabel: '添加光影包', emptyTitle: '暂无光影包', emptyDescription: '导入或下载 ZIP 光影包后，它会以客户端内容随整合包分发' },
  ui: { label: '界面资源', description: 'FancyMenu 与默认界面资源', icon: MonitorCog, path: 'fancymenu_data/', targets: [{ label: 'FancyMenu', path: 'fancymenu_data', scope: 'client' }, { label: '资源包', path: 'resourcepacks', scope: 'client' }], starters: [{ label: '界面布局', path: 'fancymenu_data/layouts/pack.txt' }, { label: '默认选项', path: 'defaultoptions/options.txt' }], mode: 'editor', scopeOptions: ['client'], tone: 'utility', addLabel: '添加界面资源', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' },
  worlds: { label: '存档与世界', description: '初始世界与可导入存档', icon: Save, path: 'saves/', targets: [{ label: '初始世界', path: 'saves' }], starters: [], mode: 'assets', scopeOptions: ['common'], tone: 'utility', addLabel: '添加世界', emptyTitle: '暂无初始世界', emptyDescription: '导入包含 level.dat 的世界目录，或下载并解压 ZIP 世界', supportsExtract: true },
  client: { label: '玩家预设', description: '键位、选项与客户端默认项', icon: SlidersHorizontal, path: 'options.txt', targets: [{ label: '游戏选项', path: 'options.txt', scope: 'client', file: true }, { label: '按键预设', path: 'options.txt', scope: 'client', file: true }, { label: '光影选项', path: 'optionsshaders.txt', scope: 'client', file: true }], starters: [{ label: '游戏选项', path: 'options.txt' }], mode: 'editor', scopeOptions: ['client'], tone: 'utility', addLabel: '添加玩家预设', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' },
  server: { label: '服务端配置', description: 'serverconfig 与服务端默认项', icon: ServerCog, path: 'serverconfig/', targets: [{ label: '服务端配置', path: 'serverconfig', scope: 'server' }, { label: '默认配置', path: 'defaultconfigs', scope: 'server' }], starters: [{ label: '服务端配置', path: 'serverconfig/pack.toml' }, { label: '默认配置', path: 'defaultconfigs/pack.toml' }], mode: 'editor', scopeOptions: ['server'], tone: 'utility', addLabel: '添加服务端配置', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' },
  other: { label: '文件工作台', description: '未归类的 MRPack 覆盖文件', icon: Boxes, path: '', targets: [{ label: '自定义位置', path: '' }, { label: '全局资源', path: 'global_packs' }], starters: [{ label: '说明文件', path: 'README.txt' }], mode: 'editor', scopeOptions: ['common', 'client', 'server'], tone: 'utility', addLabel: '添加内容', emptyTitle: '暂无工作文件', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' }
}

const editableExtensions = new Set(['cfg', 'conf', 'ini', 'js', 'json', 'json5', 'kts', 'lang', 'mcfunction', 'properties', 'snbt', 'toml', 'ts', 'txt', 'xml', 'yaml', 'yml', 'zs'])
const CONTENT_ROW_HEIGHT = 56
const CONTENT_ROW_OVERSCAN = 8

function formatBytes(value?: number): string {
  if (!value) return '大小未知'
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`
}

function defaultScope(kind: ModpackContentSection): ModpackContentScope {
  return ['resourcepacks', 'shaderpacks', 'ui', 'client'].includes(kind) ? 'client' : kind === 'server' ? 'server' : 'common'
}

function targetHint(target: TargetPreset, sourceUrl: string, extractWorld = false): string {
  if (target.file) return target.path
  if (!sourceUrl.trim()) return ''
  try {
    const rawName = decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1) ?? '')
    const name = extractWorld ? rawName.replace(/\.(?:zip|mcworld)$/i, '') || rawName : rawName
    return target.path && name ? `${target.path}/${name}` : name
  } catch {
    return ''
  }
}

function isEditableContent(item: ModpackContentItem): boolean {
  if (item.directory) return false
  const extension = item.path.split('.').at(-1)?.toLowerCase()
  return Boolean(extension && editableExtensions.has(extension))
}

export default function ModpackContentWorkspace({ project, section, onOpenEditor, onCreateFile, inventoryMode = false }: { project: ProjectInfo; section: ModpackContentSection; onOpenEditor: (contentPath?: string) => void; onCreateFile: (contentPath: string, content?: string) => void; inventoryMode?: boolean }): React.JSX.Element {
  const info = inventoryMode ? { label: '文件清单', description: 'MRPack 远程来源与本地覆盖内容', icon: PackageOpen, path: '', targets: [{ label: '自定义位置', path: '' }, { label: '全局资源', path: 'global_packs' }], starters: [{ label: '说明文件', path: 'README.txt' }], mode: 'editor', scopeOptions: ['common', 'client', 'server'], tone: 'utility', addLabel: '添加内容', emptyTitle: '暂无内容', emptyDescription: '新建或导入文件后，可直接在代码编辑器中继续编辑' } satisfies SectionInfo : sectionInfo[section]
  const Icon = info.icon
  const [inventory, setInventory] = useState<ModpackContentInventory>({ version: 1, items: [] })
  const [manifest, setManifest] = useState<ModpackManifest | null>(null)
  const [serverPackManifest, setServerPackManifest] = useState<ServerPackManifest | null>(null)
  const [serverPackModsExpanded, setServerPackModsExpanded] = useState(false)
  const [selectedServerPackMod, setSelectedServerPackMod] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [url, setUrl] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [targetIndex, setTargetIndex] = useState(0)
  const [targetIsSuggested, setTargetIsSuggested] = useState(false)
  const [scope, setScope] = useState<ModpackContentScope>(() => defaultScope(section))
  const [extract, setExtract] = useState(section === 'worlds')
  const downloadInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listViewportHeight, setListViewportHeight] = useState(336)
  const { confirm: requestConfirm, dialog: confirmDialog } = useConfirmDialog()

  const load = async (isCurrent: () => boolean = () => true, refresh = false): Promise<void> => {
    const [nextInventory, nextManifest, nextServerPack] = await Promise.all([
      loadModpackContent(project.path, refresh),
      window.modmind.modpack.get(),
      section === 'server' ? window.modmind.modpack.getServerPackManifest() : Promise.resolve(null)
    ])
    if (!isCurrent()) return
    setInventory(nextInventory)
    setManifest(nextManifest)
    setServerPackManifest(nextServerPack)
  }

  useEffect(() => {
    let current = true
    setScope(info.scopeOptions[0] ?? defaultScope(section))
    setTargetPath('')
    setTargetIndex(0)
    setTargetIsSuggested(false)
    setExtract(section === 'worlds')
    setServerPackModsExpanded(false)
    const cached = cachedModpackContent(project.path)
    if (cached) {
      setInventory(cached)
      setInitialLoading(false)
      void Promise.all([
        window.modmind.modpack.get(),
        section === 'server' ? window.modmind.modpack.getServerPackManifest() : Promise.resolve(null)
      ])
        .then(([nextManifest, nextServerPack]) => {
          if (!current) return
          setManifest(nextManifest)
          setServerPackManifest(nextServerPack)
        })
        .catch((error) => { if (current) setNotice(error instanceof Error ? error.message : String(error)) })
    } else {
      setInitialLoading(true)
      void load(() => current)
        .catch((error) => { if (current) setNotice(error instanceof Error ? error.message : String(error)) })
        .finally(() => { if (current) setInitialLoading(false) })
    }
    return () => { current = false }
  }, [project.path, section])

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    const measure = (): void => setListViewportHeight(element.clientHeight || 336)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setListScrollTop(0)
  }, [project.path, section])

  const items = useMemo(() => inventoryMode ? inventory.items : inventory.items.filter((item) => item.kind === section), [inventory.items, inventoryMode, section])
  const { remote, total, firstEditable } = useMemo(() => ({
    remote: items.filter((item) => item.delivery === 'remote').length,
    total: items.reduce((sum, item) => sum + (item.size ?? 0), 0),
    firstEditable: items.find(isEditableContent)
  }), [items])
  const virtualRange = useMemo(() => {
    const visibleRows = Math.ceil(listViewportHeight / CONTENT_ROW_HEIGHT)
    const start = Math.max(0, Math.floor(listScrollTop / CONTENT_ROW_HEIGHT) - CONTENT_ROW_OVERSCAN)
    return { start, end: Math.min(items.length, start + visibleRows + CONTENT_ROW_OVERSCAN * 2) }
  }, [items.length, listScrollTop, listViewportHeight])
  const visibleItems = items.slice(virtualRange.start, virtualRange.end)
  const editorFirst = info.mode === 'editor'
  const selectedTarget = info.targets[targetIndex]
  const targetRequirement = selectedTarget?.requirement
  const targetDependencyMissing = Boolean(targetRequirement && manifest && !manifest.mods.some((mod) => targetRequirement.matches.some((match) => mod.fileName.toLowerCase().includes(match))))

  const run = (key: string, action: () => Promise<void>): void => {
    if (busy) return
    setBusy(key)
    setNotice('')
    void action().catch((error) => setNotice(error instanceof Error ? error.message : String(error))).finally(() => setBusy(''))
  }

  useEffect(() => {
    const mods = serverPackManifest?.mods ?? []
    setSelectedServerPackMod((current) => mods.includes(current) ? current : mods[0] ?? '')
  }, [serverPackManifest])

  const addServerPackMods = (): void => run('server-mod-add', async () => {
    const updated = await window.modmind.modpack.addServerPackMods()
    if (!updated) return
    setServerPackManifest(updated)
    setNotice(`服务端 Mod 已更新：${updated.mods.length} 个`)
  })

  const removeServerPackMod = async (): Promise<void> => {
    const fileName = selectedServerPackMod
    if (!fileName || busy || !await requestConfirm({ title: `移除“${fileName}”`, message: '该 Mod 将从当前服务端包删除', confirmLabel: '移除 Mod', tone: 'danger' })) return
    run('server-mod-remove', async () => {
      const updated = await window.modmind.modpack.removeServerPackMod(fileName)
      setServerPackManifest(updated)
      setNotice(`服务端 Mod 已更新：${updated.mods.length} 个`)
    })
  }

  const exportServerPack = (): void => run('server-export', async () => {
    const target = await window.modmind.modpack.exportServerPack()
    if (target) setNotice(`服务端包已导出：${target}`)
  })

  const removeServerPackModFile = async (fileName: string): Promise<void> => {
    if (busy || !await requestConfirm({ title: `移除“${fileName}”`, message: '该 Mod 将从当前服务端包删除', confirmLabel: '移除 Mod', tone: 'danger' })) return
    run(`server-mod-remove:${fileName}`, async () => {
      const updated = await window.modmind.modpack.removeServerPackMod(fileName)
      setServerPackManifest(updated)
      setNotice(`服务端 Mod 已更新：${updated.mods.length} 个`)
    })
  }

  const importLocal = (): void => run('import', async () => {
    const result = await window.modmind.modpack.importContent(section, scope)
    if (result) {
      await load(() => true, true)
      setNotice(`已导入 ${result.copiedFiles} 个文件`)
    }
  })

  const download = (): void => run('download', async () => {
    if (!url.trim()) throw new Error('请输入 HTTPS 下载地址')
    if (targetDependencyMissing) throw new Error(`当前整合包未安装 ${targetRequirement?.label}，不能使用该目标位置`)
    const suggestedPath = targetHint(selectedTarget, url, section === 'worlds' && extract)
    const destination = (targetPath.trim() || suggestedPath).replaceAll('\\', '/')
    const existing = destination ? inventory.items.find((item) => item.path === destination) : undefined
    if (existing && !await requestConfirm({ title: '替换已管理内容？', message: '下载会替换现有内容，替换后无法自动恢复', detail: existing.path, confirmLabel: '替换内容', cancelLabel: '保留现有内容', tone: 'danger' })) return
    const result = await window.modmind.modpack.downloadContent({ kind: section, scope, url: url.trim(), ...(targetPath.trim() ? { targetPath: targetPath.trim() } : {}), ...(extract ? { extract: true } : {}) })
    await load(() => true, true)
    setTargetPath('')
    setTargetIsSuggested(false)
    setNotice(`已下载 ${result.item.path}${result.extractedFiles ? `，已解压 ${result.extractedFiles} 个文件` : ''}`)
  })

  const remove = async (item: ModpackContentItem): Promise<void> => {
    if (busy || !await requestConfirm({ title: '移除已管理内容？', message: '这会从整合包中删除文件或目录，且无法自动恢复', detail: item.path, confirmLabel: '移除内容', cancelLabel: '保留内容', tone: 'danger' })) return
    run(`remove:${item.id}`, async () => {
    await window.modmind.modpack.removeContent(item.id)
    await load(() => true, true)
    })
  }

  const selectTarget = (index: number): void => {
    const target = info.targets[index]
    setTargetIndex(index)
    setTargetPath(targetHint(target, url, section === 'worlds' && extract))
    setTargetIsSuggested(true)
    setScope(target.scope ?? info.scopeOptions[0] ?? defaultScope(section))
  }

  const focusDownload = (): void => downloadInputRef.current?.focus()

  const renderServerModList = section === 'server' ? (() => {
    const rows = serverPackManifest?.mods ?? []
    return <section className="pack-server-mod-list">
      <div className="pack-server-mod-list-heading"><div><span className="pack-server-mod-list-icon"><ListChecks size={18} /></span><div><h2>服务端 Mod 清单</h2><p>这里只显示已经同步到服务端包目录的实际结果</p></div></div><span>{serverPackManifest ? `${rows.length} 个已同步` : '尚未同步'}</span></div>
      <div className="pack-server-mod-list-table" role="table" aria-label="服务端 Mod 清单">
        {rows.map((fileName) => {
          const directlyMerged = serverPackManifest?.directMods?.some((entry) => entry.toLowerCase() === fileName.toLowerCase())
          return <div className="pack-server-mod-row" role="row" key={fileName}><span className="pack-server-mod-side server">服务端</span><strong>{fileName}</strong><small>{directlyMerged ? 'ModMind 直接合并' : 'ServerPackCreator 已复制'}</small></div>
        })}
        {!rows.length ? <div className="pack-server-mod-empty">{serverPackManifest ? '同步结果中没有服务端 Mod' : '尚未同步服务端包，完成同步后这里才会显示实际 Mod'}</div> : null}
      </div>
    </section>
  })() : null

  const renderServerPackActions = section === 'server' ? <section className="pack-server-mod-actions">
    <button className="secondary-button" type="button" disabled={Boolean(busy) || !serverPackManifest} onClick={addServerPackMods}>{busy === 'server-mod-add' ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}添加服务端 Mod</button>
    <label><select value={selectedServerPackMod} disabled={Boolean(busy) || !serverPackManifest?.mods.length} onChange={(event) => setSelectedServerPackMod(event.target.value)}>{serverPackManifest?.mods.map((fileName) => <option key={fileName} value={fileName}>{fileName}</option>)}</select></label>
    <button className="icon-button danger" type="button" title="移除选中的服务端 Mod" aria-label="移除选中的服务端 Mod" disabled={Boolean(busy) || !selectedServerPackMod} onClick={() => void removeServerPackMod()}>{busy === 'server-mod-remove' ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
    <button className="primary-button" type="button" disabled={Boolean(busy) || !serverPackManifest} onClick={exportServerPack}>{busy === 'server-export' ? <LoaderCircle className="spin" size={15} /> : <Archive size={15} />}导出服务端包</button>
  </section> : null

  const renderServerPackManager = section === 'server' ? (() => {
    const rows = serverPackManifest?.mods ?? []
    return <section className={`server-pack-config-panel${serverPackModsExpanded ? ' expanded' : ''}`}>
      <div className="server-pack-config-heading">
        <div className="server-pack-config-title"><span><ServerCog size={18} /></span><div><h2>服务端 Mod</h2><p>{serverPackManifest ? `${rows.length} 个已同步 Mod` : '尚未同步服务端包'}</p></div></div>
        <div className="server-pack-config-actions"><button className="secondary-button compact" type="button" disabled={Boolean(busy) || !serverPackManifest} onClick={addServerPackMods}>{busy === 'server-mod-add' ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}添加 Mod</button><button className="primary-button compact" type="button" disabled={Boolean(busy) || !serverPackManifest} onClick={exportServerPack}>{busy === 'server-export' ? <LoaderCircle className="spin" size={14} /> : <Archive size={14} />}导出 ZIP</button><button className={`icon-button server-pack-config-toggle${serverPackModsExpanded ? ' expanded' : ''}`} type="button" title={serverPackModsExpanded ? '收起服务端 Mod 清单' : '展开服务端 Mod 清单'} aria-label={serverPackModsExpanded ? '收起服务端 Mod 清单' : '展开服务端 Mod 清单'} aria-expanded={serverPackModsExpanded} disabled={!serverPackManifest} onClick={() => setServerPackModsExpanded((expanded) => !expanded)}><ChevronDown size={16} /></button></div>
      </div>
      {serverPackModsExpanded ? <div className="server-pack-config-list">{rows.length ? rows.map((fileName) => <div className="server-pack-config-row" key={fileName}><span className="server-pack-config-mod-icon"><PackageOpen size={16} /></span><div><strong title={fileName}>{fileName}</strong><small>服务端 Mod</small></div><button className="icon-button danger" type="button" title={`移除 ${fileName}`} aria-label={`移除 ${fileName}`} disabled={Boolean(busy)} onClick={() => void removeServerPackModFile(fileName)}>{busy === `server-mod-remove:${fileName}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button></div>) : <div className="server-pack-config-empty">当前服务端包没有 Mod</div>}</div> : null}
    </section>
  })() : null

  const downloadControls = <>
    <div className="pack-content-download-row">
      <label>下载地址<input ref={downloadInputRef} value={url} inputMode="url" placeholder="https://..." onChange={(event) => { setUrl(event.target.value); if (!targetPath || targetIsSuggested) { setTargetPath(targetHint(info.targets[targetIndex], event.target.value, section === 'worlds' && extract)); setTargetIsSuggested(true) } }} /></label>
      <label>目标路径<input value={targetPath} placeholder={info.targets[targetIndex]?.file ? info.targets[targetIndex].path : info.path || '相对路径'} onChange={(event) => { setTargetPath(event.target.value); setTargetIsSuggested(false) }} /></label>
      {info.scopeOptions.length > 1 ? <label>分发环境<select value={scope} onChange={(event) => setScope(event.target.value as ModpackContentScope)}>{info.scopeOptions.map((option) => <option key={option} value={option}>{option === 'common' ? '通用' : option === 'client' ? '客户端' : '服务端'}</option>)}</select></label> : <span className="pack-content-scope-lock"><CheckCircle2 size={14} />{scope === 'client' ? '仅客户端' : scope === 'server' ? '仅服务端' : '通用内容'}</span>}
      {info.supportsExtract ? <label className="check-row"><input type="checkbox" checked={extract} onChange={(event) => { const next = event.target.checked; setExtract(next); if (targetIsSuggested) setTargetPath(targetHint(info.targets[targetIndex], url, next)) }} />解压 ZIP 世界</label> : null}
      <button className="primary-button" disabled={Boolean(busy) || !url.trim() || targetDependencyMissing} onClick={download}>{busy === 'download' ? <LoaderCircle className="spin" size={15} /> : <CloudDownload size={15} />}下载</button>
    </div>
    <div className="pack-content-targets" aria-label="常用目标路径"><span>目标位置</span>{info.targets.map((target, index) => <button type="button" className={targetIndex === index ? 'active' : ''} key={`${target.label}:${target.path}`} onClick={() => selectTarget(index)} title={target.path || '下载后填写相对路径'}>{target.label}</button>)}</div>
    {targetDependencyMissing ? <div className="pack-content-requirement" role="status"><Archive size={14} />“{selectedTarget.label}”需要已安装 {targetRequirement?.label}</div> : null}
  </>

  return <div className="pack-content-page">
    <header className="content-toolbar pack-content-toolbar">
      <div><span className={`pack-content-eyebrow ${info.tone}`}>PACK CONTENT</span><h1>{info.label}</h1><p>{info.description}</p></div>
      <div className="pack-content-summary" aria-label="内容统计">{initialLoading ? <span><LoaderCircle className="spin" size={13} />正在加载内容</span> : <><span>{items.length} 项内容</span><span>{remote} 个远程来源</span><span>{formatBytes(total)}</span></>}</div>
    </header>

    {renderServerPackManager}

    <section className="pack-content-editor-start">
      <div className="pack-content-editor-copy"><span>{editorFirst ? <FileCode2 size={18} /> : <Icon size={18} />}</span><div><h2>{editorFirst ? firstEditable ? '继续编辑文件' : '从代码编辑器开始' : info.addLabel}</h2><p>{editorFirst ? firstEditable?.path || info.path || '新建或选择一个项目文件' : info.path}</p></div></div>
      <div className="pack-content-editor-actions">{editorFirst ? <button className="primary-button" type="button" onClick={() => onOpenEditor(firstEditable?.path)}><FileCode2 size={15} />{firstEditable ? '打开文件' : '代码编辑器'}</button> : <button className="secondary-button" type="button" onClick={() => onOpenEditor()}><FolderOpen size={15} />文件工作台</button>}<button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={importLocal}>{busy === 'import' ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{section === 'worlds' ? '导入世界目录' : '导入文件'}</button></div>
      {info.starters.length ? <div className="pack-content-editor-starters"><span>新建文件</span>{info.starters.map((starter) => <button className="secondary-button compact" type="button" key={starter.path} onClick={() => onCreateFile(starter.path, starter.content?.(project))}><FileCode2 size={14} />{starter.label}</button>)}</div> : null}
      <details className="pack-content-download-disclosure"><summary><CloudDownload size={14} />从链接添加</summary>{downloadControls}</details>
    </section>

    <section className="pack-content-list-section">
      <div className="pack-content-list-heading"><div><h2>已管理内容</h2></div><button className="icon-button" title="刷新内容列表" aria-label="刷新内容列表" disabled={Boolean(busy) || initialLoading} onClick={() => void run('refresh', () => load(() => true, true))}>{busy === 'refresh' ? <LoaderCircle className="spin" size={15} /> : <PackageOpen size={15} />}</button></div>
      <div className="pack-content-list" ref={listRef} onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
        {initialLoading ? <div className="pack-content-loading" role="status"><LoaderCircle className="spin" size={22} /><div><strong>正在加载内容</strong><small>正在读取配置、资源与脚本文件</small></div></div> : null}
        {!initialLoading && items.length ? <div className="pack-content-virtual" style={{ height: items.length * CONTENT_ROW_HEIGHT }}><div className="pack-content-virtual-window" style={{ transform: `translateY(${virtualRange.start * CONTENT_ROW_HEIGHT}px)` }}>{visibleItems.map((item) => <ContentRow item={item} busy={busy} projectPath={project.path} onRemove={(entry) => void remove(entry)} onOpenEditor={onOpenEditor} showKind={inventoryMode} key={item.id} />)}</div></div> : null}
        {!initialLoading && !items.length ? <div className="pack-content-empty"><span className="pack-content-empty-icon"><Icon size={22} /></span><div className="pack-content-empty-copy"><strong>{info.emptyTitle}</strong><small>{info.emptyDescription}</small></div><div className="pack-content-empty-actions">{editorFirst ? <button type="button" className="secondary-button compact" onClick={() => onOpenEditor()}><FileCode2 size={14} />代码编辑器</button> : null}<button type="button" className="secondary-button compact" disabled={Boolean(busy)} onClick={importLocal}><Upload size={14} />{section === 'worlds' ? '导入世界目录' : '导入本地文件'}</button>{!editorFirst ? <button type="button" className="secondary-button compact" disabled={Boolean(busy)} onClick={focusDownload}><CloudDownload size={14} />添加下载</button> : null}</div></div> : null}
      </div>
    </section>
    {notice ? <div className="pack-content-notice" role="status">{notice}</div> : null}
    {confirmDialog}
  </div>
}

function ContentRow({ item, busy, projectPath, onRemove, onOpenEditor, showKind }: { item: ModpackContentItem; busy: string; projectPath: string; onRemove: (item: ModpackContentItem) => void; onOpenEditor: (contentPath?: string) => void; showKind: boolean }): React.JSX.Element {
  const visual = item.kind === 'resourcepacks' ? { Icon: Image, tone: 'utility', label: '资源包' }
    : item.kind === 'shaderpacks' ? { Icon: Sparkles, tone: 'utility', label: '光影包' }
      : item.kind === 'worlds' ? { Icon: Save, tone: 'utility', label: '世界' }
        : item.kind === 'datapacks' ? { Icon: FileArchive, tone: 'utility', label: '数据包' }
          : { Icon: FileJson, tone: 'utility', label: sectionInfo[item.kind as ModpackContentSection]?.label ?? item.kind }
  const extension = item.directory ? '目录' : item.path.split('.').at(-1)?.toUpperCase() ?? '文件'
  const scopeLabel = item.scope === 'common' ? '通用' : item.scope === 'client' ? '客户端' : '服务端'
  return <div className="pack-content-row">
    <span className={`pack-content-row-icon ${visual.tone} ${item.delivery}`}><visual.Icon size={16} /></span>
    <span><strong>{item.path}</strong><small className="pack-content-row-meta">{showKind ? <b>{visual.label}</b> : null}<b>{extension}</b><b>{item.delivery === 'remote' ? '远程已校验' : item.directory ? '目录内容' : '本地覆盖'}</b><b>{scopeLabel}</b><b>{formatBytes(item.size)}</b></small></span>
    {item.sourceUrl ? <button className="icon-button" type="button" title="在浏览器中打开来源" aria-label="打开来源" onClick={() => void window.open(item.sourceUrl, '_blank')}><WandSparkles size={15} /></button> : null}
    {isEditableContent(item) ? <button className="icon-button" type="button" title="在代码编辑器中打开" aria-label={`编辑 ${item.path}`} onClick={() => onOpenEditor(item.path)}><FileCode2 size={15} /></button> : null}
    <button className="icon-button" type="button" title="在文件管理器中显示" aria-label="显示内容" onClick={() => void window.modmind.modpack.contentProjectPath(item.path).then((relativePath) => window.modmind.project.reveal(relativePath, projectPath))}><FolderOpen size={15} /></button>
    <button className="icon-button danger" type="button" title="移除内容" aria-label="移除内容" disabled={Boolean(busy)} onClick={() => onRemove(item)}>{busy === `remove:${item.id}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
  </div>
}
