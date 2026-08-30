import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addEdge, Background, BaseEdge, Controls, getSmoothStepPath, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type EdgeMouseHandler, type EdgeProps, type Node, type NodeChange, type NodeMouseHandler, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, BookOpen, ChevronRight, CirclePlus, ClipboardCheck, Diamond, FileCode2, FilePlus2, FolderTree, Gift, Link2, LoaderCircle, PackageOpen, Plus, Redo2, RotateCw, Save, Settings2, Trash2, Undo2, Unlink } from 'lucide-react'
import type { FtbQuestBook, FtbQuestDocumentChapter, FtbQuestDocumentQuest, FtbQuestRewardDocument, FtbQuestTaskDocument, ProjectInfo } from '../../../shared/types'
import { useConfirmDialog } from './InteractionDialogs'

type QuestNodeData = { title: string; subtitle: string; icon: string; tasks: number; rewards: number }
type QuestNode = Node<QuestNodeData>
type QuestEdge = Edge<{ lane?: number }>

// FTB quest coordinates frequently use half-grid increments. Keep enough visual room for the node itself.
const QUEST_GRID_X = 380
const QUEST_GRID_Y = 210

function newId(): string { return crypto.randomUUID().replaceAll('-', '').toUpperCase() }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function asList(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function asText(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : fallback }
function asNumber(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function formatRaw(value: unknown): string { return JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2) }

function hydrateQuest(rawInput: Record<string, unknown>): FtbQuestDocumentQuest {
  const raw = rawInput
  const dependencies = asList(raw.dependencies).map((entry) => typeof entry === 'object' ? asText(asRecord(entry).id) : asText(entry)).filter(Boolean)
  const tasks = asList(raw.tasks).map((entry): FtbQuestTaskDocument => { const item = asRecord(entry); return { id: asText(item.id, newId()), type: asText(item.type, 'checkmark'), title: asText(item.title), item: asText(item.item), raw: item } })
  const rewards = asList(raw.rewards).map((entry): FtbQuestRewardDocument => { const item = asRecord(entry); return { id: asText(item.id, newId()), type: asText(item.type, 'item'), title: asText(item.title), item: asText(item.item), count: asNumber(item.count, 1), xp: asNumber(item.xp), command: asText(item.command), raw: item } })
  const id = asText(raw.id, newId())
  const explicitTitle = asText(raw.title)
  const fallbackTitle = tasks.map((task) => task.title?.trim()).find(Boolean) || asText(raw.subtitle) || `任务 ${id.slice(0, 8)}`
  return { id, title: explicitTitle || fallbackTitle, titleIsFallback: !explicitTitle, subtitle: asText(raw.subtitle), description: Array.isArray(raw.description) ? raw.description.map((entry) => asText(entry)).join('\n') : asText(raw.description), icon: asText(raw.icon), shape: asText(raw.shape, 'square'), x: asNumber(raw.x), y: asNumber(raw.y), dependencies, tasks, rewards, raw }
}

function QuestFlowNode({ data }: { data: QuestNodeData }): React.JSX.Element {
  return <div className="ftb-quest-node">
    <Handle id="target-top" className="ftb-quest-handle target top" type="target" position={Position.Top} />
    <Handle id="source-top" className="ftb-quest-handle source top" type="source" position={Position.Top} />
    <Handle id="target-right" className="ftb-quest-handle target right" type="target" position={Position.Right} />
    <Handle id="source-right" className="ftb-quest-handle source right" type="source" position={Position.Right} />
    <Handle id="target-bottom" className="ftb-quest-handle target bottom" type="target" position={Position.Bottom} />
    <Handle id="source-bottom" className="ftb-quest-handle source bottom" type="source" position={Position.Bottom} />
    <Handle id="target-left" className="ftb-quest-handle target left" type="target" position={Position.Left} />
    <Handle id="source-left" className="ftb-quest-handle source left" type="source" position={Position.Left} />
    <div className="ftb-quest-node-icon"><Diamond size={15} /></div><div><strong>{data.title}</strong><small>{data.subtitle || data.icon || '任务节点'}</small><span><ClipboardCheck size={11} />{data.tasks}<Gift size={11} />{data.rewards}</span></div>
  </div>
}

function directionalHandles(source: { x: number; y: number }, target: { x: number; y: number }): Pick<Edge, 'sourceHandle' | 'targetHandle'> {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0
    ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
    : { sourceHandle: 'source-left', targetHandle: 'target-right' }
  return dy >= 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
}

function RoutedQuestEdge({ id, data, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, markerStart, style, interactionWidth }: EdgeProps<QuestEdge>): React.JSX.Element {
  const lane = data?.lane ?? 0
  const horizontal = sourcePosition === Position.Left || sourcePosition === Position.Right
  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    borderRadius: 10,
    offset: 22,
    ...(horizontal ? { centerX: (sourceX + targetX) / 2 + lane * 30 } : { centerY: (sourceY + targetY) / 2 + lane * 24 })
  })
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} interactionWidth={interactionWidth} />
}

function questNodes(chapter: FtbQuestDocumentChapter | undefined): QuestNode[] {
  return (chapter?.quests ?? []).map((quest) => ({ id: quest.id, type: 'quest', position: { x: quest.x * QUEST_GRID_X, y: quest.y * QUEST_GRID_Y }, data: { title: quest.title, subtitle: quest.subtitle, icon: quest.icon, tasks: quest.tasks.length, rewards: quest.rewards.length } }))
}

function questEdges(chapter: FtbQuestDocumentChapter | undefined): QuestEdge[] {
  const local = new Set((chapter?.quests ?? []).map((quest) => quest.id))
  const positions = new Map((chapter?.quests ?? []).map((quest) => [quest.id, { x: quest.x * QUEST_GRID_X, y: quest.y * QUEST_GRID_Y }]))
  const edges: QuestEdge[] = (chapter?.quests ?? []).flatMap((quest) => quest.dependencies.filter((dependency) => local.has(dependency)).map((dependency): QuestEdge => ({ id: `${dependency}:${quest.id}`, source: dependency, target: quest.id, animated: true, type: 'questRoute', markerEnd: { type: 'arrowclosed' }, ...directionalHandles(positions.get(dependency) ?? { x: 0, y: 0 }, positions.get(quest.id) ?? { x: 0, y: 0 }) })))
  const lanes = new Map<string, QuestEdge[]>()
  for (const edge of edges) {
    const key = `${edge.source}:${edge.sourceHandle ?? ''}`
    lanes.set(key, [...(lanes.get(key) ?? []), edge])
  }
  for (const group of lanes.values()) group.sort((left, right) => left.target.localeCompare(right.target)).forEach((edge, index) => { edge.data = { lane: index - (group.length - 1) / 2 } })
  return edges
}

export default function FtbQuestEditor({ project }: { project: ProjectInfo }): React.JSX.Element {
  const { confirm, dialog } = useConfirmDialog()
  const [book, setBook] = useState<FtbQuestBook | null>(null)
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const selectedChapterIdRef = useRef('')
  const [selectedQuestId, setSelectedQuestId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [message, setMessage] = useState('正在读取任务书…')
  const [busy, setBusy] = useState<'load' | 'save' | ''>('load')
  const [rawValue, setRawValue] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState<QuestNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<QuestEdge>([])
  const flowRef = useRef<ReactFlowInstance<QuestNode, QuestEdge> | null>(null)
  const undoStack = useRef<FtbQuestBook[]>([])
  const redoStack = useRef<FtbQuestBook[]>([])
  const [, setHistoryVersion] = useState(0)

  const chapter = book?.chapters.find((item) => item.id === selectedChapterId) ?? book?.chapters[0]
  const selectedQuest = chapter?.quests.find((item) => item.id === selectedQuestId) ?? chapter?.quests[0]
  const diagnostics = book?.diagnostics ?? []
  const errors = diagnostics.filter((item) => item.severity === 'error')
  const onQuestNodesChange = useCallback((changes: NodeChange<QuestNode>[]): void => onNodesChange(changes.filter((change) => change.type !== 'remove')), [onNodesChange])

  const syncCanvas = useCallback((nextChapter: FtbQuestDocumentChapter | undefined): void => {
    setNodes(questNodes(nextChapter)); setEdges(questEdges(nextChapter)); setSelectedEdgeId('')
    window.requestAnimationFrame(() => flowRef.current?.fitView({ duration: 180, padding: 0.18, maxZoom: 1.15 }))
  }, [setEdges, setNodes])

  const load = useCallback(async (): Promise<void> => {
    setBusy('load')
    try {
      const next = await window.modmind.modpack.readFtbQuestBook()
      setBook(next)
      undoStack.current = []; redoStack.current = []; setHistoryVersion((current) => current + 1)
      const nextChapter = next.chapters.find((item) => item.id === selectedChapterIdRef.current) ?? next.chapters[0]
      selectedChapterIdRef.current = nextChapter?.id ?? ''
      setSelectedChapterId(selectedChapterIdRef.current)
      setSelectedQuestId(nextChapter?.quests[0]?.id ?? '')
      syncCanvas(nextChapter)
      setMessage(next.chapters.length ? `已载入 ${next.chapters.length} 个章节` : '未发现任务章节，可以从这里创建第一章')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy('') }
  }, [syncCanvas])

  useEffect(() => { void load() }, [load, project.path])
  useEffect(() => { if (selectedQuest) setRawValue(formatRaw(selectedQuest.raw)) }, [selectedQuest?.id])
  useEffect(() => { setNodes(questNodes(chapter)); setEdges(questEdges(chapter)) }, [chapter, setEdges, setNodes])

  const updateBook = (recipe: (current: FtbQuestBook) => FtbQuestBook): void => {
    if (!book) return
    const next = recipe(book)
    undoStack.current = [...undoStack.current, book].slice(-80)
    redoStack.current = []
    setHistoryVersion((current) => current + 1)
    setBook(next)
  }
  const undo = (): void => {
    if (!book) return
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(book); setBook(previous); setHistoryVersion((current) => current + 1); setMessage('已撤销上一步编辑')
  }
  const redo = (): void => {
    if (!book) return
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(book); setBook(next); setHistoryVersion((current) => current + 1); setMessage('已重做编辑')
  }
  const updateChapter = (id: string, patch: Partial<FtbQuestDocumentChapter>): void => updateBook((current) => ({ ...current, chapters: current.chapters.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const updateQuest = (questId: string, patch: Partial<FtbQuestDocumentQuest>): void => updateBook((current) => ({ ...current, chapters: current.chapters.map((item) => item.id !== chapter?.id ? item : { ...item, quests: item.quests.map((quest) => quest.id === questId ? { ...quest, ...patch } : quest) }) }))

  const chooseChapter = (id: string): void => {
    const next = book?.chapters.find((item) => item.id === id)
    selectedChapterIdRef.current = id
    setSelectedChapterId(id); setSelectedQuestId(next?.quests[0]?.id ?? ''); syncCanvas(next)
  }
  const chooseQuest = (id: string): void => { setSelectedQuestId(id); setSelectedEdgeId('') }

  const createChapter = (): void => {
    if (!book) return
    const usedFilenames = new Set(book.chapters.map((item) => item.filename.toLowerCase()))
    let filenameIndex = book.chapters.length + 1
    while (usedFilenames.has(`chapter_${filenameIndex}`)) filenameIndex += 1
    const id = newId(); const filename = `chapter_${filenameIndex}`
    const next: FtbQuestDocumentChapter = { id, title: '新章节', subtitle: '', icon: 'minecraft:book', group: '', filename, source: `chapters/${filename}.${book.format}`, quests: [], raw: {} }
    updateBook((current) => ({ ...current, chapters: [...current.chapters, next] }))
    selectedChapterIdRef.current = id
    setSelectedChapterId(id); setSelectedQuestId(''); syncCanvas(next); setMessage('已创建新章节')
  }
  const deleteChapter = async (): Promise<void> => {
    if (!book || !chapter) return
    if (!await confirm({ title: `删除章节“${chapter.title}”？`, message: `其中的 ${chapter.quests.length} 个任务也会从任务书移除。更改将在保存任务书时写入文件。`, confirmLabel: '删除章节', cancelLabel: '保留章节', tone: 'danger', actionIcon: 'delete' })) return
    const remaining = book.chapters.filter((item) => item.id !== chapter.id)
    updateBook((current) => ({ ...current, chapters: remaining })); chooseChapter(remaining[0]?.id ?? ''); setMessage('章节将在保存时从任务书移除')
  }
  const createQuest = (): void => {
    if (!chapter) return
    const quest: FtbQuestDocumentQuest = { id: newId(), title: `新任务 ${chapter.quests.length + 1}`, titleIsFallback: false, subtitle: '', description: '', icon: 'minecraft:book', shape: 'square', x: chapter.quests.length * 2, y: 0, dependencies: [], tasks: [{ id: newId(), type: 'checkmark', raw: {} }], rewards: [], raw: {} }
    updateChapter(chapter.id, { quests: [...chapter.quests, quest] }); setSelectedQuestId(quest.id); syncCanvas({ ...chapter, quests: [...chapter.quests, quest] }); setMessage('已添加任务')
  }
  const duplicateQuest = (): void => {
    if (!chapter || !selectedQuest) return
    const clone: FtbQuestDocumentQuest = { ...selectedQuest, id: newId(), title: `${selectedQuest.title} 副本`, x: selectedQuest.x + 1, y: selectedQuest.y + 1, dependencies: [], tasks: selectedQuest.tasks.map((task) => ({ ...task, id: newId(), raw: { ...task.raw } })), rewards: selectedQuest.rewards.map((reward) => ({ ...reward, id: newId(), raw: { ...reward.raw } })), raw: { ...selectedQuest.raw } }
    updateChapter(chapter.id, { quests: [...chapter.quests, clone] }); setSelectedQuestId(clone.id); syncCanvas({ ...chapter, quests: [...chapter.quests, clone] })
  }
  const deleteQuest = async (): Promise<void> => {
    if (!chapter || !selectedQuest || !await confirm({ title: `删除任务“${selectedQuest.title}”？`, message: '引用该任务的前置关系也会一并移除。更改将在保存任务书时写入文件。', confirmLabel: '删除任务', cancelLabel: '保留任务', tone: 'danger', actionIcon: 'delete' })) return
    const quests = chapter.quests.filter((item) => item.id !== selectedQuest.id).map((item) => ({ ...item, dependencies: item.dependencies.filter((dependency) => dependency !== selectedQuest.id) }))
    updateChapter(chapter.id, { quests }); setSelectedQuestId(quests[0]?.id ?? ''); syncCanvas({ ...chapter, quests })
  }
  const onConnect = useCallback((connection: Connection): void => {
    if (!chapter || !connection.source || !connection.target || connection.source === connection.target) return
    const target = chapter.quests.find((item) => item.id === connection.target)
    const source = chapter.quests.find((item) => item.id === connection.source)
    if (!target || !source || target.dependencies.includes(connection.source)) return
    const next = { ...target, dependencies: [...target.dependencies, connection.source] }
    updateQuest(target.id, { dependencies: next.dependencies }); setEdges((current) => addEdge({ ...connection, id: `${connection.source}:${connection.target}`, animated: true, type: 'smoothstep', markerEnd: { type: 'arrowclosed' }, ...directionalHandles({ x: source.x * QUEST_GRID_X, y: source.y * QUEST_GRID_Y }, { x: target.x * QUEST_GRID_X, y: target.y * QUEST_GRID_Y }) }, current)); setMessage('已添加前置任务')
  }, [chapter, setEdges])
  const onEdgesDelete = useCallback((deleted: QuestEdge[]): void => {
    for (const edge of deleted) if (edge.source && edge.target) {
      const target = chapter?.quests.find((item) => item.id === edge.target)
      if (target) updateQuest(target.id, { dependencies: target.dependencies.filter((dependency) => dependency !== edge.source) })
    }
  }, [chapter])
  const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: QuestNode): void => updateQuest(node.id, { x: Math.round((node.position.x / QUEST_GRID_X) * 10) / 10, y: Math.round((node.position.y / QUEST_GRID_Y) * 10) / 10 }), [])
  const onNodeClick: NodeMouseHandler<QuestNode> = useCallback((_event, node) => chooseQuest(node.id), [])
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => { setSelectedQuestId(''); setSelectedEdgeId(edge.id); setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id }))) }, [setEdges])
  const removeSelectedEdge = (): void => {
    const edge = edges.find((item) => item.id === selectedEdgeId)
    if (!edge) return
    onEdgesDelete([edge]); setEdges((current) => current.filter((item) => item.id !== edge.id)); setSelectedEdgeId('')
  }
  const addTask = (type: string): void => selectedQuest && updateQuest(selectedQuest.id, { tasks: [...selectedQuest.tasks, { id: newId(), type, item: type === 'item' ? 'minecraft:stone' : '', raw: {} }] })
  const updateTask = (id: string, patch: Partial<FtbQuestTaskDocument>): void => selectedQuest && updateQuest(selectedQuest.id, { tasks: selectedQuest.tasks.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const addReward = (type: string): void => selectedQuest && updateQuest(selectedQuest.id, { rewards: [...selectedQuest.rewards, { id: newId(), type, item: type === 'item' ? 'minecraft:stone' : '', count: type === 'item' ? 1 : undefined, xp: type === 'xp' ? 5 : undefined, command: type === 'command' ? 'give @s minecraft:stone' : '', raw: {} }] })
  const updateReward = (id: string, patch: Partial<FtbQuestRewardDocument>): void => selectedQuest && updateQuest(selectedQuest.id, { rewards: selectedQuest.rewards.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const applyRaw = (): void => {
    if (!selectedQuest) return
    try { const next = hydrateQuest(asRecord(JSON.parse(rawValue))); updateQuest(selectedQuest.id, next); setMessage('已应用高级字段') } catch (error) { setMessage(`高级字段无效：${error instanceof Error ? error.message : String(error)}`) }
  }
  const save = async (): Promise<void> => {
    if (!book) return
    setBusy('save')
    try {
      const result = await window.modmind.modpack.saveFtbQuestBook(book)
      setMessage(`已保存 ${result.written.length} 个文件${result.removed.length ? `，移除 ${result.removed.length} 个章节文件` : ''}`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy('') }
  }

  const sourceOptions = useMemo(() => chapter?.quests.filter((item) => item.id !== selectedQuest?.id) ?? [], [chapter?.quests, selectedQuest?.id])
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId)

  return <div className="ftb-quest-editor">
    <header className="ftb-quest-toolbar content-toolbar"><div><h1>FTB 任务书</h1><p>章节、前置依赖、任务条件和奖励在同一张画布中编辑</p></div><div className="ftb-quest-toolbar-actions"><span className={`ftb-quest-health ${errors.length ? 'error' : ''}`}>{errors.length ? <AlertTriangle size={14} /> : <PackageOpen size={14} />}{errors.length ? `${errors.length} 个问题` : `${book?.chapters.length ?? 0} 个章节`}</span><button className="icon-button" title="撤销" aria-label="撤销" disabled={!undoStack.current.length || Boolean(busy)} onClick={undo}><Undo2 size={15} /></button><button className="icon-button" title="重做" aria-label="重做" disabled={!redoStack.current.length || Boolean(busy)} onClick={redo}><Redo2 size={15} /></button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void load()}>{busy === 'load' ? <LoaderCircle className="spin" size={15} /> : <RotateCw size={15} />}重新加载</button><button className="primary-button" disabled={!book || Boolean(busy) || errors.length > 0} onClick={() => void save()}>{busy === 'save' ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}保存任务书</button></div></header>
    <div className="ftb-quest-layout">
      <aside className="ftb-quest-chapters"><div className="ftb-quest-panel-title"><span><FolderTree size={16} />章节</span><button className="icon-button" title="新建章节" onClick={createChapter} disabled={!book || Boolean(busy)}><FilePlus2 size={15} /></button></div><div className="ftb-quest-book-meta"><BookOpen size={14} /><span>{book?.format === 'json5' ? 'JSON5 任务书' : 'SNBT 任务书'}</span></div><div className="ftb-quest-chapter-list">{book?.chapters.map((item) => <button key={item.id} className={chapter?.id === item.id ? 'selected' : ''} onClick={() => chooseChapter(item.id)}><BookOpen size={15} /><span><strong>{item.title}</strong><small>{item.quests.length} 个任务</small></span><ChevronRight size={14} /></button>)}</div><button className="secondary-button compact ftb-quest-add-chapter" onClick={createChapter} disabled={!book}><Plus size={14} />新建章节</button></aside>
      <section className="ftb-quest-canvas-panel"><div className="ftb-quest-canvas-heading"><div>{chapter ? <><input aria-label="章节标题" value={chapter.title} onChange={(event) => updateChapter(chapter.id, { title: event.target.value })} /><span>{chapter.quests.length} 个任务</span></> : <span>选择或创建章节</span>}</div><div><button className="icon-button" title="添加任务" disabled={!chapter} onClick={createQuest}><CirclePlus size={16} /></button><button className="icon-button" title="删除当前章节" disabled={!chapter} onClick={deleteChapter}><Trash2 size={15} /></button></div></div><div className="ftb-quest-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={{ quest: QuestFlowNode }} edgeTypes={{ questRoute: RoutedQuestEdge }} onNodesChange={onQuestNodesChange} onEdgesChange={onEdgesChange} onEdgesDelete={onEdgesDelete} onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onConnect={onConnect} onPaneClick={() => { setSelectedEdgeId(''); setEdges((current) => current.map((item) => ({ ...item, selected: false }))) }} onInit={(instance) => { flowRef.current = instance; syncCanvas(chapter) }} deleteKeyCode={['Backspace', 'Delete']} fitView><MiniMap pannable zoomable /><Controls /><Background gap={18} size={1} /></ReactFlow>{!chapter?.quests.length ? <div className="ftb-quest-empty"><ClipboardCheck size={20} /><strong>此章节还没有任务</strong><button className="primary-button compact" onClick={createQuest}><Plus size={14} />添加第一个任务</button></div> : null}</div></section>
      <aside className="ftb-quest-inspector">{selectedEdge ? <><div className="ftb-quest-panel-title"><span><Link2 size={16} />前置关系</span><button className="icon-button" title="删除前置关系" onClick={removeSelectedEdge}><Unlink size={15} /></button></div><p className="ftb-quest-inline-copy">这条连线表示目标任务必须在来源任务完成后才能解锁</p></> : selectedQuest ? <><div className="ftb-quest-panel-title"><span><ClipboardCheck size={16} />任务属性</span><div><button className="icon-button" title="复制任务" onClick={duplicateQuest}><FileCode2 size={15} /></button><button className="icon-button" title="删除任务" onClick={deleteQuest}><Trash2 size={15} /></button></div></div><label className="field-label">标题{selectedQuest.titleIsFallback ? <small>显示首个任务条件标题；编辑后会写入任务标题</small> : null}<input value={selectedQuest.title} onChange={(event) => updateQuest(selectedQuest.id, { title: event.target.value, titleIsFallback: false })} /></label><label className="field-label">副标题<input value={selectedQuest.subtitle} onChange={(event) => updateQuest(selectedQuest.id, { subtitle: event.target.value })} /></label><label className="field-label">图标<input value={selectedQuest.icon} placeholder="minecraft:book" onChange={(event) => updateQuest(selectedQuest.id, { icon: event.target.value })} /></label><label className="field-label">形状<select value={selectedQuest.shape} onChange={(event) => updateQuest(selectedQuest.id, { shape: event.target.value })}><option value="square">方形</option><option value="circle">圆形</option><option value="diamond">菱形</option></select></label><label className="field-label">描述<textarea value={selectedQuest.description} onChange={(event) => updateQuest(selectedQuest.id, { description: event.target.value })} /></label><div className="ftb-quest-section-title"><span>前置任务</span></div><div className="ftb-quest-dependencies">{selectedQuest.dependencies.map((dependency) => <button key={dependency} title="移除前置任务" onClick={() => updateQuest(selectedQuest.id, { dependencies: selectedQuest.dependencies.filter((item) => item !== dependency) })}>{chapter?.quests.find((item) => item.id === dependency)?.title ?? dependency}<Unlink size={12} /></button>)}<select value="" aria-label="添加前置任务" onChange={(event) => { if (event.target.value) updateQuest(selectedQuest.id, { dependencies: [...selectedQuest.dependencies, event.target.value] }); event.target.value = '' }}><option value="">添加前置任务…</option>{sourceOptions.filter((item) => !selectedQuest.dependencies.includes(item.id)).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><div className="ftb-quest-section-title"><span>任务条件</span><select value="" aria-label="添加任务条件" onChange={(event) => { if (event.target.value) addTask(event.target.value); event.target.value = '' }}><option value="">添加</option><option value="checkmark">手动确认</option><option value="item">提交物品</option><option value="location">到达位置</option></select></div>{selectedQuest.tasks.map((task) => <div className="ftb-quest-rule" key={task.id}><select value={task.type} onChange={(event) => updateTask(task.id, { type: event.target.value })}><option value="checkmark">确认</option><option value="item">物品</option><option value="location">位置</option></select>{task.type === 'item' ? <input value={task.item ?? ''} placeholder="minecraft:stone" onChange={(event) => updateTask(task.id, { item: event.target.value })} /> : null}<button className="icon-button" title="删除条件" onClick={() => updateQuest(selectedQuest.id, { tasks: selectedQuest.tasks.filter((item) => item.id !== task.id) })}><Trash2 size={13} /></button></div>)}<div className="ftb-quest-section-title"><span>奖励</span><select value="" aria-label="添加奖励" onChange={(event) => { if (event.target.value) addReward(event.target.value); event.target.value = '' }}><option value="">添加</option><option value="item">物品</option><option value="xp">经验</option><option value="command">命令</option></select></div>{selectedQuest.rewards.map((reward) => <div className="ftb-quest-rule reward" key={reward.id}><select value={reward.type} onChange={(event) => updateReward(reward.id, { type: event.target.value })}><option value="item">物品</option><option value="xp">经验</option><option value="command">命令</option></select>{reward.type === 'item' ? <><input value={reward.item ?? ''} placeholder="minecraft:stone" onChange={(event) => updateReward(reward.id, { item: event.target.value })} /><input type="number" min={1} value={reward.count ?? 1} onChange={(event) => updateReward(reward.id, { count: Math.max(1, Number(event.target.value) || 1) })} /></> : reward.type === 'xp' ? <input type="number" min={0} value={reward.xp ?? 0} onChange={(event) => updateReward(reward.id, { xp: Math.max(0, Number(event.target.value) || 0) })} /> : <input value={reward.command ?? ''} onChange={(event) => updateReward(reward.id, { command: event.target.value })} />}<button className="icon-button" title="删除奖励" onClick={() => updateQuest(selectedQuest.id, { rewards: selectedQuest.rewards.filter((item) => item.id !== reward.id) })}><Trash2 size={13} /></button></div>)}<details className="ftb-quest-advanced"><summary><Settings2 size={14} />高级字段</summary><textarea value={rawValue} onChange={(event) => setRawValue(event.target.value)} /><button className="secondary-button compact" onClick={applyRaw}>应用 JSON 字段</button></details></> : <div className="ftb-quest-inspector-empty"><ClipboardCheck size={22} /><p>选择任务节点以编辑条件、奖励和前置关系</p></div>}</aside>
    </div>
    <footer className={`ftb-quest-message ${errors.length ? 'error' : ''}`}>{errors.length ? <AlertTriangle size={14} /> : <PackageOpen size={14} />}<span>{errors.length ? errors.map((item) => item.message).join('；') : message}</span></footer>
    {dialog}
  </div>
}
