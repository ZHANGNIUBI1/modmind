import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { parse as parseSnbt, stringify as stringifySnbt } from 'ftbq-nbt'
import type { FtbQuestBook, FtbQuestBookFormat, FtbQuestDiagnostic, FtbQuestDocumentChapter, FtbQuestDocumentQuest, FtbQuestRewardDocument, FtbQuestSaveResult, FtbQuestTaskDocument, ProjectInfo } from '../shared/types'

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {} }
function asList(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return fallback
}
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function textList(value: unknown): string[] {
  return asList(value).map((entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'bigint' ? String(entry) : text(asRecord(entry).id)).filter(Boolean)
}
function relative(project: ProjectInfo, target: string): string { return path.relative(project.path, target).replaceAll('\\', '/') }
function isInside(root: string, target: string): boolean { const next = path.resolve(target); return next === root || next.startsWith(`${root}${path.sep}`) }

function questRoot(project: ProjectInfo): string {
  if (project.kind !== 'modpack') throw new Error('an FTB Quests book requires a modpack project')
  const candidates = [
    path.join(project.path, 'overrides', 'config', 'ftbquests', 'quests'),
    path.join(project.path, 'config', 'ftbquests', 'quests')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function chapterSource(filename: string, format: FtbQuestBookFormat): string {
  const clean = filename.trim().replaceAll('\\', '/').replace(/^chapters\//, '').replace(/\.(snbt|json5)$/i, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(clean) || clean === '.' || clean === '..') throw new Error('chapter filename contains unsupported characters')
  return `chapters/${clean}.${format}`
}

function createId(): string { return randomUUID().replaceAll('-', '').toUpperCase() }

function readDescription(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean).join('\n')
  return text(value)
}

function collectFtbObjectIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((entry) => collectFtbObjectIds(entry, ids)); return }
  if (!value || typeof value !== 'object') return
  const record = value as RawRecord
  const id = text(record.id)
  // FTB Quests uses hexadecimal object IDs for chapters, quests, tasks, rewards and links.
  if (/^[0-9A-F]{16,32}$/i.test(id)) ids.add(id)
  Object.values(record).forEach((entry) => collectFtbObjectIds(entry, ids))
}

function taskFromRaw(value: unknown): FtbQuestTaskDocument {
  const raw = asRecord(value)
  return { id: text(raw.id, createId()), type: text(raw.type, 'checkmark'), title: text(raw.title), item: text(raw.item), raw }
}

function rewardFromRaw(value: unknown): FtbQuestRewardDocument {
  const raw = asRecord(value)
  return { id: text(raw.id, createId()), type: text(raw.type, 'item'), title: text(raw.title), item: text(raw.item), count: number(raw.count, 1), xp: number(raw.xp), command: text(raw.command), raw }
}

function questFromRaw(value: unknown): FtbQuestDocumentQuest {
  const raw = asRecord(value)
  const id = text(raw.id, createId())
  const tasks = asList(raw.tasks).map(taskFromRaw)
  const explicitTitle = text(raw.title)
  const fallbackTitle = tasks.map((task) => task.title?.trim()).find(Boolean) || text(raw.subtitle) || `任务 ${id.slice(0, 8)}`
  return {
    id, title: explicitTitle || fallbackTitle, titleIsFallback: !explicitTitle, subtitle: text(raw.subtitle), description: readDescription(raw.description), icon: text(raw.icon), shape: text(raw.shape, 'square'), x: number(raw.x), y: number(raw.y),
    dependencies: textList(raw.dependencies), tasks, rewards: asList(raw.rewards).map(rewardFromRaw), raw
  }
}

function chapterFromRaw(value: unknown, source: string): FtbQuestDocumentChapter {
  const raw = asRecord(value)
  const filename = text(raw.filename, path.basename(source).replace(/\.(snbt|json5)$/i, ''))
  return {
    id: text(raw.id, createId()), title: text(raw.title, 'Untitled chapter'), subtitle: text(raw.subtitle), icon: text(raw.icon), group: text(raw.group), filename, source,
    quests: asList(raw.quests).map(questFromRaw), raw
  }
}

function parseContent(content: string, format: FtbQuestBookFormat): RawRecord {
  const parsed = format === 'snbt' ? parseSnbt(content, { skipComma: true, useBoolean: true }) : JSON5.parse(content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('chapter root must be an object')
  return parsed as RawRecord
}

function stringifyContent(value: RawRecord, format: FtbQuestBookFormat): string {
  return format === 'snbt'
    ? `${stringifySnbt(value as Parameters<typeof stringifySnbt>[0], { pretty: true, skipComma: true, noTagListTab: true, tab: '  ', newline: '\n', quote: 'double' })}\n`
    : `${JSON.stringify(value, null, 2)}\n`
}

async function readChapterFiles(root: string): Promise<Array<{ source: string; content: string }>> {
  const chapters = path.join(root, 'chapters')
  const entries = await fs.readdir(chapters, { withFileTypes: true }).catch(() => [])
  return Promise.all(entries.filter((entry) => entry.isFile() && /\.(snbt|json5)$/i.test(entry.name)).sort((left, right) => left.name.localeCompare(right.name)).map(async (entry) => ({ source: `chapters/${entry.name}`, content: await fs.readFile(path.join(chapters, entry.name), 'utf8') })))
}

export function validateFtbQuestBook(book: FtbQuestBook): FtbQuestDiagnostic[] {
  const diagnostics: FtbQuestDiagnostic[] = []
  const chapterIds = new Set<string>()
  const quests = new Map<string, FtbQuestDocumentQuest>()
  const objectIds = new Set<string>()
  for (const chapter of book.chapters) {
    collectFtbObjectIds(chapter.raw, objectIds)
    objectIds.add(chapter.id)
    if (!chapter.id.trim()) diagnostics.push({ severity: 'error', code: 'chapter-id-empty', message: '章节缺少 ID', chapterId: chapter.id })
    else if (chapterIds.has(chapter.id)) diagnostics.push({ severity: 'error', code: 'chapter-id-duplicate', message: `重复的章节 ID：${chapter.id}`, chapterId: chapter.id })
    else chapterIds.add(chapter.id)
    if (!chapter.title.trim()) diagnostics.push({ severity: 'error', code: 'chapter-title-empty', message: '章节标题不能为空', chapterId: chapter.id })
    try { chapterSource(chapter.filename, book.format) } catch (error) { diagnostics.push({ severity: 'error', code: 'chapter-filename-invalid', message: error instanceof Error ? error.message : String(error), chapterId: chapter.id }) }
    for (const quest of chapter.quests) {
      if (!quest.id.trim()) diagnostics.push({ severity: 'error', code: 'quest-id-empty', message: '任务缺少 ID', chapterId: chapter.id })
      else if (quests.has(quest.id)) diagnostics.push({ severity: 'error', code: 'quest-id-duplicate', message: `重复的任务 ID：${quest.id}`, chapterId: chapter.id, questId: quest.id })
      else quests.set(quest.id, quest)
      objectIds.add(quest.id)
      quest.tasks.forEach((task) => objectIds.add(task.id))
      quest.rewards.forEach((reward) => objectIds.add(reward.id))
      if (!quest.title.trim()) diagnostics.push({ severity: 'error', code: 'quest-title-empty', message: '任务标题不能为空', chapterId: chapter.id, questId: quest.id })
      const childObjectIds = new Set<string>()
      for (const object of [...quest.tasks, ...quest.rewards]) {
        if (!object.id.trim()) diagnostics.push({ severity: 'error', code: 'object-id-empty', message: '任务条件或奖励缺少 ID', chapterId: chapter.id, questId: quest.id })
        else if (childObjectIds.has(object.id)) diagnostics.push({ severity: 'error', code: 'object-id-duplicate', message: `任务内存在重复 ID：${object.id}`, chapterId: chapter.id, questId: quest.id })
        else childObjectIds.add(object.id)
        if (!object.type.trim()) diagnostics.push({ severity: 'error', code: 'object-type-empty', message: '任务条件或奖励缺少类型', chapterId: chapter.id, questId: quest.id })
      }
    }
  }
  for (const chapter of book.chapters) for (const quest of chapter.quests) for (const dependency of quest.dependencies) {
    if (dependency === quest.id) diagnostics.push({ severity: 'error', code: 'dependency-self', message: '任务不能依赖自身', chapterId: chapter.id, questId: quest.id })
    else if (!objectIds.has(dependency)) diagnostics.push({ severity: 'error', code: 'dependency-missing', message: `前置任务不存在：${dependency}`, chapterId: chapter.id, questId: quest.id })
  }
  const visit = (id: string, seen: Set<string>, active: Set<string>): void => {
    if (active.has(id)) { diagnostics.push({ severity: 'error', code: 'dependency-cycle', message: `任务依赖形成循环：${id}`, questId: id }); return }
    if (seen.has(id)) return
    seen.add(id); active.add(id)
    for (const next of quests.get(id)?.dependencies ?? []) visit(next, seen, active)
    active.delete(id)
  }
  const seen = new Set<string>()
  for (const id of quests.keys()) visit(id, seen, new Set())
  return diagnostics
}

export async function readFtbQuestBook(project: ProjectInfo): Promise<FtbQuestBook> {
  const root = questRoot(project)
  const files = await readChapterFiles(root)
  const formats = new Set(files.map((file) => file.source.toLowerCase().endsWith('.json5') ? 'json5' : 'snbt' as FtbQuestBookFormat))
  const format: FtbQuestBookFormat = formats.has('json5') ? 'json5' : 'snbt'
  const diagnostics: FtbQuestDiagnostic[] = []
  if (formats.size > 1) diagnostics.push({ severity: 'warning', code: 'mixed-format', message: '检测到 SNBT 和 JSON5 章节混用；保存时请先统一格式' })
  const chapters: FtbQuestDocumentChapter[] = []
  for (const file of files) {
    const fileFormat: FtbQuestBookFormat = file.source.toLowerCase().endsWith('.json5') ? 'json5' : 'snbt'
    try { chapters.push(chapterFromRaw(parseContent(file.content, fileFormat), file.source)) }
    catch (error) { diagnostics.push({ severity: 'error', code: 'parse-failed', message: `${file.source} 无法解析：${error instanceof Error ? error.message : String(error)}` }) }
  }
  const book: FtbQuestBook = { format, root: relative(project, root), chapters, diagnostics }
  return { ...book, diagnostics: [...diagnostics, ...validateFtbQuestBook(book)] }
}

function compiledTask(task: FtbQuestTaskDocument): RawRecord {
  const { id: _id, type: _type, title: _title, item: _item, ...preserved } = task.raw
  return { ...preserved, id: task.id, type: task.type, ...(task.title ? { title: task.title } : {}), ...(task.item ? { item: task.item } : {}) }
}
function compiledReward(reward: FtbQuestRewardDocument): RawRecord {
  const { id: _id, type: _type, title: _title, item: _item, count: _count, xp: _xp, command: _command, ...preserved } = reward.raw
  return { ...preserved, id: reward.id, type: reward.type, ...(reward.title ? { title: reward.title } : {}), ...(reward.item ? { item: reward.item } : {}), ...(reward.count !== undefined ? { count: reward.count } : {}), ...(reward.xp !== undefined ? { xp: reward.xp } : {}), ...(reward.command ? { command: reward.command } : {}) }
}
function compiledQuest(quest: FtbQuestDocumentQuest): RawRecord {
  const { id: _id, title: _title, subtitle: _subtitle, icon: _icon, shape: _shape, x: _x, y: _y, description: originalDescription, dependencies: _dependencies, tasks: _tasks, rewards: _rewards, ...preserved } = quest.raw
  return {
    ...preserved, id: quest.id, ...(quest.titleIsFallback ? {} : { title: quest.title }), subtitle: quest.subtitle, icon: quest.icon, shape: quest.shape, x: Math.trunc(quest.x), y: Math.trunc(quest.y),
    ...(quest.description ? { description: Array.isArray(originalDescription) ? quest.description.split('\n') : quest.description } : {}),
    dependencies: quest.dependencies, tasks: quest.tasks.map(compiledTask), rewards: quest.rewards.map(compiledReward)
  }
}
function compiledChapter(chapter: FtbQuestDocumentChapter): RawRecord {
  const { id: _id, filename: _filename, title: _title, subtitle: _subtitle, icon: _icon, group: _group, quests: _quests, ...preserved } = chapter.raw
  return { ...preserved, id: chapter.id, filename: chapter.filename, title: chapter.title, subtitle: chapter.subtitle, icon: chapter.icon, ...(chapter.group ? { group: chapter.group } : {}), quests: chapter.quests.map(compiledQuest) }
}

async function restoreFiles(original: Map<string, string | null>): Promise<void> {
  await Promise.all([...original.entries()].map(async ([target, content]) => {
    if (content === null) await fs.rm(target, { force: true }).catch(() => undefined)
    else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content, 'utf8') }
  }))
}

export async function saveFtbQuestBook(project: ProjectInfo, input: FtbQuestBook): Promise<FtbQuestSaveResult> {
  const root = questRoot(project)
  const current = await readFtbQuestBook(project)
  if (current.diagnostics.some((diagnostic) => diagnostic.code === 'mixed-format')) throw new Error('任务书混用了 SNBT 和 JSON5，请先在文件工作台中统一格式后再保存')
  const format = current.chapters.length ? current.format : input.format
  if (current.chapters.length && input.format !== current.format) throw new Error('任务书格式已在磁盘上变化，请重新加载后保存')
  const book: FtbQuestBook = { ...input, format, root: relative(project, root), diagnostics: [] }
  const diagnostics = validateFtbQuestBook(book)
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length) throw new Error(errors.map((diagnostic) => diagnostic.message).join('；'))
  const rootResolved = path.resolve(root)
  const desired = new Map<string, string>()
  for (const chapter of book.chapters) {
    const source = chapterSource(chapter.filename, format)
    const target = path.resolve(root, source)
    if (!isInside(rootResolved, target)) throw new Error('unsafe chapter path')
    if (desired.has(target)) throw new Error(`chapter filename is duplicated: ${chapter.filename}`)
    desired.set(target, stringifyContent(compiledChapter({ ...chapter, source }), format))
  }
  const existingFiles = await readChapterFiles(root)
  const existing = new Set(existingFiles.map((file) => path.resolve(root, file.source)))
  const removed = [...existing].filter((file) => !desired.has(file))
  const original = new Map<string, string | null>()
  for (const target of new Set([...desired.keys(), ...removed])) original.set(target, await fs.readFile(target, 'utf8').catch(() => null))
  const temporary = new Map<string, string>()
  try {
    for (const [target, content] of desired) {
      if (original.get(target) === content) continue
      await fs.mkdir(path.dirname(target), { recursive: true })
      const pending = `${target}.modmind-${process.pid}-${randomUUID()}.pending`
      await fs.writeFile(pending, content, 'utf8')
      temporary.set(target, pending)
    }
    for (const [target, pending] of temporary) await fs.rename(pending, target)
    await Promise.all(removed.map((target) => fs.rm(target, { force: true })))
  } catch (error) {
    await restoreFiles(original)
    throw error
  } finally {
    await Promise.all([...temporary.values()].map((pending) => fs.rm(pending, { force: true }).catch(() => undefined)))
  }
  return { written: [...temporary.keys()].map((target) => relative(project, target)), removed: removed.map((target) => relative(project, target)), diagnostics }
}

export function newFtbQuestChapter(format: FtbQuestBookFormat, index: number): FtbQuestDocumentChapter {
  const filename = `chapter_${index + 1}`
  return { id: createId(), title: '新章节', subtitle: '', icon: 'minecraft:book', group: '', filename, source: chapterSource(filename, format), quests: [], raw: {} }
}

export function newFtbQuest(index: number): FtbQuestDocumentQuest {
  return { id: createId(), title: `新任务 ${index + 1}`, titleIsFallback: false, subtitle: '', description: '', icon: 'minecraft:book', shape: 'square', x: index * 2, y: 0, dependencies: [], tasks: [{ id: createId(), type: 'checkmark', raw: {} }], rewards: [], raw: {} }
}
