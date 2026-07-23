import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  CheckCircle2,
  CircleAlert,
  FolderOpen,
  Grid3X3,
  LoaderCircle,
  Maximize,
  Paintbrush,
  Play,
  Redo2,
  Save,
  Sparkles,
  Undo2
} from 'lucide-react'
import '../blockbench.css'

type BlockbenchBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BlockbenchStatePayload = {
  status?: string
  connected?: boolean
  dirty?: boolean
  projectName?: string
  fileName?: string
  message?: string
  aiActive?: boolean
  aiAction?: string
  ai?: {
    active?: boolean
    action?: string
    message?: string
  }
}

type BlockbenchBridge = {
  show: (bounds: BlockbenchBounds) => Promise<void> | void
  hide: () => Promise<void> | void
  openProject: () => Promise<unknown>
  saveProject: () => Promise<unknown>
  runAction: (action: string) => Promise<unknown>
  onState: (listener: (state: BlockbenchStatePayload) => void) => () => void
}

type WorkspaceState = {
  status: string
  connected: boolean
  dirty: boolean
  projectName: string
  message: string
  aiActive: boolean
  aiAction: string
}

export type BlockbenchWorkspaceProps = {
  visible?: boolean
}

const initialState: WorkspaceState = {
  status: 'loading',
  connected: false,
  dirty: false,
  projectName: '未命名模型',
  message: '正在启动 Blockbench',
  aiActive: false,
  aiAction: ''
}

function getBridge(): BlockbenchBridge | undefined {
  return (window.modmind as unknown as { blockbench?: BlockbenchBridge }).blockbench
}

function mergeState(current: WorkspaceState, payload: BlockbenchStatePayload): WorkspaceState {
  const status = payload.status ?? current.status
  const aiActive = payload.ai?.active ?? payload.aiActive ?? status === 'ai-running'

  return {
    status,
    connected: payload.connected ?? (status === 'ready' || status === 'busy' || status === 'ai-running'),
    dirty: payload.dirty ?? current.dirty,
    projectName: payload.projectName ?? payload.fileName ?? current.projectName,
    message: payload.ai?.message ?? payload.message ?? current.message,
    aiActive,
    aiAction: payload.ai?.action ?? payload.aiAction ?? current.aiAction
  }
}

export function BlockbenchWorkspace({ visible = true }: BlockbenchWorkspaceProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const bridge = useMemo(getBridge, [])
  const [state, setState] = useState<WorkspaceState>(() =>
    bridge ? initialState : { ...initialState, status: 'error', message: 'Blockbench 桥接服务不可用' }
  )
  const [pendingAction, setPendingAction] = useState('')
  const [notice, setNotice] = useState('')

  const syncBounds = useCallback((): void => {
    if (!bridge || !visible || !viewportRef.current) return
    const rect = viewportRef.current.getBoundingClientRect()
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    }
    if (bounds.width > 1 && bounds.height > 1) void bridge.show(bounds)
  }, [bridge, visible])

  useEffect(() => {
    if (!bridge) return
    const removeStateListener = bridge.onState((payload) => setState((current) => mergeState(current, payload)))
    return removeStateListener
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    if (!visible) {
      void bridge.hide()
      return
    }

    let frame = 0
    const scheduleSync = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(syncBounds)
    }
    const observer = new ResizeObserver(scheduleSync)
    if (viewportRef.current) observer.observe(viewportRef.current)
    window.addEventListener('resize', scheduleSync)
    window.addEventListener('scroll', scheduleSync, true)
    scheduleSync()

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('scroll', scheduleSync, true)
      void bridge.hide()
    }
  }, [bridge, syncBounds, visible])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  const execute = async (name: string, action: () => Promise<unknown>): Promise<void> => {
    if (!bridge || pendingAction) return
    setPendingAction(name)
    setNotice('')
    try {
      await action()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingAction('')
      window.requestAnimationFrame(syncBounds)
    }
  }

  const runAction = (action: string): void => {
    if (!bridge) return
    void execute(action, () => bridge.runAction(action))
  }

  const isLoading = state.status === 'loading' || state.status === 'starting'
  const isError = state.status === 'error'
  const statusText = state.aiActive
    ? state.aiAction || state.message || '正在调整模型'
    : isError
      ? state.message
      : state.connected
        ? state.dirty
          ? '有未保存的修改'
          : '已保存'
        : state.message

  return (
    <section className="bb-workspace" aria-label="Blockbench 模型工作台">
      <header className="bb-toolbar">
        <div className="bb-toolbar-group">
          <button
            className="bb-tool-button"
            type="button"
            title="打开 Blockbench 项目"
            aria-label="打开 Blockbench 项目"
            disabled={!bridge || Boolean(pendingAction)}
            onClick={() => bridge && void execute('open', () => bridge.openProject())}
          >
            {pendingAction === 'open' ? <LoaderCircle className="bb-spin" size={16} /> : <FolderOpen size={16} />}
          </button>
          <button
            className="bb-tool-button"
            type="button"
            title="保存模型"
            aria-label="保存模型"
            disabled={!bridge || Boolean(pendingAction)}
            onClick={() => bridge && void execute('save', () => bridge.saveProject())}
          >
            {pendingAction === 'save' ? <LoaderCircle className="bb-spin" size={16} /> : <Save size={16} />}
          </button>
          <span className="bb-toolbar-divider" />
          <button className="bb-tool-button" type="button" title="撤销" aria-label="撤销" disabled={!bridge} onClick={() => runAction('undo')}>
            <Undo2 size={16} />
          </button>
          <button className="bb-tool-button" type="button" title="重做" aria-label="重做" disabled={!bridge} onClick={() => runAction('redo')}>
            <Redo2 size={16} />
          </button>
        </div>

        <div className="bb-mode-control" aria-label="Blockbench 编辑模式">
          <button type="button" title="模型模式" onClick={() => runAction('mode_edit')}><Box size={14} />模型</button>
          <button type="button" title="绘制模式" onClick={() => runAction('mode_paint')}><Paintbrush size={14} />贴图</button>
          <button type="button" title="动画模式" onClick={() => runAction('mode_animate')}><Play size={14} />动画</button>
        </div>

        <div className="bb-toolbar-group bb-toolbar-end">
          <button className="bb-tool-button" type="button" title="切换网格" aria-label="切换网格" disabled={!bridge} onClick={() => runAction('toggle_grid')}>
            <Grid3X3 size={16} />
          </button>
          <button className="bb-tool-button" type="button" title="适合视图" aria-label="适合视图" disabled={!bridge} onClick={() => runAction('frame_all')}>
            <Maximize size={16} />
          </button>
          <span className="bb-toolbar-divider" />
          <div className={`bb-ai-state ${state.aiActive ? 'active' : ''}`} title={statusText}>
            {state.aiActive ? <LoaderCircle className="bb-spin" size={14} /> : <Sparkles size={14} />}
            <span>{state.aiActive ? 'AI 正在操作' : '手动编辑'}</span>
          </div>
        </div>
      </header>

      <div className="bb-document-bar">
        <div className="bb-document-name">
          <span className={`bb-document-dot ${state.dirty ? 'dirty' : ''}`} />
          <strong>{state.projectName}</strong>
        </div>
        <div className={`bb-runtime-state ${isError ? 'error' : state.aiActive ? 'ai' : ''}`}>
          {isError ? <CircleAlert size={13} /> : isLoading ? <LoaderCircle className="bb-spin" size={13} /> : <CheckCircle2 size={13} />}
          <span>{statusText}</span>
        </div>
      </div>

      <div className="bb-viewport-shell">
        <div ref={viewportRef} className="bb-native-viewport">
          <div className={`bb-viewport-placeholder ${isError ? 'error' : ''}`}>
            {isError ? <CircleAlert size={24} /> : <LoaderCircle className="bb-spin" size={24} />}
            <strong>{isError ? '无法载入 Blockbench' : '正在载入 Blockbench'}</strong>
            <span>{state.message}</span>
          </div>
        </div>
      </div>

      <footer className="bb-statusbar">
        <span className={`bb-connection ${state.connected ? 'connected' : ''}`}><i />Blockbench {state.connected ? '已连接' : '未连接'}</span>
        <span className="bb-status-message">{state.aiActive ? `AI · ${statusText}` : '手动操作已启用'}</span>
      </footer>

      {notice ? <div className="bb-notice" role="status">{notice}</div> : null}
    </section>
  )
}

export default BlockbenchWorkspace
