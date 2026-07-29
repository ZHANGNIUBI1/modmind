import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  CircleAlert,
  Cpu,
  Download,
  Gamepad2,
  Hammer,
  HardDrive,
  LoaderCircle,
  PackagePlus,
  Play,
  RefreshCw,
  Square,
  Sparkles,
  TerminalSquare,
  Trash2
} from 'lucide-react'
import type {
  MinecraftManagedMod,
  MinecraftRuntimeEvent,
  MinecraftRuntimeState
} from '../../../shared/minecraft'
import '../minecraft-test.css'

const initialState: MinecraftRuntimeState = {
  stage: 'idle',
  minecraftVersion: '',
  installed: false,
  running: false,
  message: '正在读取测试实例',
  mods: []
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

export default function MinecraftTestWorkspace(): React.JSX.Element {
  const [state, setState] = useState<MinecraftRuntimeState>(initialState)
  const [events, setEvents] = useState<MinecraftRuntimeEvent[]>([])
  const [username, setUsername] = useState(() => localStorage.getItem('modmind.minecraft.username') || localStorage.getItem('modtool.minecraft.username') || 'ModMindDev')
  const [memory, setMemory] = useState(() => Number(localStorage.getItem('modmind.minecraft.memory') || localStorage.getItem('modtool.minecraft.memory')) || 4096)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [repairOutput, setRepairOutput] = useState('')

  useEffect(() => {
    void window.modmind.minecraft.getState().then(setState).catch((error: unknown) => setNotice(String(error)))
    const removeState = window.modmind.minecraft.onState(setState)
    const removeEvent = window.modmind.minecraft.onEvent((event) => {
      setEvents((current) => [...current, event].slice(-250))
    })
    const removeAiOutput = window.modmind.ai.onOutput((event) => {
      if (event.kind === 'start') {
        setRepairOutput(event.content)
      } else if (event.kind === 'stream-start') {
        setRepairOutput((current) => `${current}\n\n[${event.content}]\n`)
      } else if (event.kind === 'delta') {
        setRepairOutput((current) => current + event.content)
      } else if (event.kind === 'error') {
        setRepairOutput((current) => `${current}\n\n[错误]\n${event.content}`)
      }
    })
    return () => {
      removeState()
      removeEvent()
      removeAiOutput()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('modmind.minecraft.username', username)
  }, [username])

  useEffect(() => {
    localStorage.setItem('modmind.minecraft.memory', String(memory))
  }, [memory])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const run = async (name: string, action: () => Promise<unknown>): Promise<void> => {
    if (busy) return
    setBusy(name)
    setNotice('')
    try {
      await action()
      setState(await window.modmind.minecraft.getState())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }

  const launchGame = (): void => {
    void run('launch', () => window.modmind.minecraft.launch({ username, maxMemoryMb: memory, width: 1280, height: 720 }))
  }

  const repairCrash = (): void => {
    const crash = state.lastCrash
    if (!crash) return
    void run('repair-crash', async () => {
      let failure = crash.summary
      const sessionId = `runtime-repair-${Date.now()}`
      for (let round = 1; round <= 3; round += 1) {
        setRepairOutput(`正在进行运行期修复 ${round}/3…`)
        await window.modmind.ai.createCode(
          `Minecraft launched successfully but the current mod crashed during runtime initialization. Fix the runtime crash while preserving the requested behavior. Use APIs valid for this exact Minecraft version. This is an iterative agent session: inspect the previous applied-change memory and do not repeat an approach that already produced the same crash.\n\nCRASH SUMMARY\n${failure}`,
          sessionId
        )
        try {
          await window.modmind.minecraft.buildProject()
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error)
          if (round === 3) throw error
          setRepairOutput((current) => `${current}\n\n构建仍失败，错误已转交下一轮 AI 修复。`)
          continue
        }
        setRepairOutput((current) => `${current}\n\n构建通过，正在启动 Minecraft 并观察 20 秒…`)
        const test = await window.modmind.minecraft.testLaunch({ username, maxMemoryMb: memory, width: 1280, height: 720 })
        setState(test.state)
        if (test.success) {
          setRepairOutput((current) => `${current}\n\nMinecraft 已稳定运行 20 秒，运行期修复通过。`)
          return
        }
        failure = test.crash?.summary ?? test.state.message
        setRepairOutput((current) => `${current}\n\nMinecraft 再次崩溃，新的根因已转交下一轮 AI 修复。\n${failure}`)
      }
      throw new Error('已完成 3 轮运行期修复，但 Minecraft 仍未通过 20 秒启动验证。最后一次崩溃已保留。')
    })
  }

  const dependencies = useMemo(() => state.mods.filter((mod) => !mod.projectArtifact), [state.mods])
  const projectMod = state.mods.find((mod) => mod.projectArtifact)
  const activeDownload = [...events].reverse().find((event) => event.total && event.progress !== undefined)
  const progress = activeDownload?.total
    ? Math.max(0, Math.min(100, (activeDownload.progress! / activeDownload.total) * 100))
    : undefined
  const preparing = ['preparing', 'downloading-java', 'downloading-game', 'installing-loader', 'installing-fabric', 'building-mod'].includes(state.stage)

  const removeMod = (mod: MinecraftManagedMod): void => {
    void run(`remove:${mod.name}`, async () => {
      const mods = await window.modmind.minecraft.removeMod(mod.name)
      setState((current) => ({ ...current, mods }))
    })
  }

  return (
    <div className="mc-test-page">
      <header className="mc-test-header">
        <div className="mc-test-title">
          <span className={`mc-test-icon ${state.running ? 'running' : ''}`}><Gamepad2 size={20} /></span>
          <div><h1>Minecraft 测试</h1><p>{state.minecraftVersion || '项目版本'} · {state.loader ? state.loader === 'fabric' ? 'Fabric' : state.loader === 'quilt' ? 'Quilt' : state.loader === 'forge' ? 'Forge' : 'NeoForge' : 'Loader'} {state.loaderVersion || '待安装'}</p></div>
        </div>
        <div className="mc-test-actions">
          <button className="secondary-button" disabled={Boolean(busy) || state.running} onClick={() => void run('prepare', () => window.modmind.minecraft.prepare())}>
            {busy === 'prepare' || preparing ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            准备实例
          </button>
          <button className="secondary-button" disabled={Boolean(busy) || state.running} onClick={() => void run('build', () => window.modmind.minecraft.buildProject())}>
            {busy === 'build' ? <LoaderCircle className="spin" size={16} /> : <Hammer size={16} />}构建并同步
          </button>
          {state.running ? (
            <button className="danger-button" disabled={Boolean(busy)} onClick={() => void run('stop', () => window.modmind.minecraft.stop())}><Square size={15} />停止游戏</button>
          ) : (
            <button className="primary-button" disabled={Boolean(busy) || !username.trim()} onClick={launchGame}>
              {busy === 'launch' ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}启动测试
            </button>
          )}
        </div>
      </header>

      {progress !== undefined && preparing ? (
        <div className="mc-download-strip"><span style={{ width: `${progress}%` }} /><p>{activeDownload?.message}<strong>{progress.toFixed(0)}%</strong></p></div>
      ) : null}

      <div className="mc-test-layout">
        <aside className="mc-instance-panel">
          <section>
            <h2>离线身份</h2>
            <label>用户名<input value={username} maxLength={16} onChange={(event) => setUsername(event.target.value)} disabled={state.running} /></label>
            <label>最大内存<select value={memory} onChange={(event) => setMemory(Number(event.target.value))} disabled={state.running}>
              <option value={2048}>2 GB</option><option value={4096}>4 GB</option><option value={6144}>6 GB</option><option value={8192}>8 GB</option><option value={12288}>12 GB</option>
            </select></label>
          </section>
          <section className="mc-instance-facts">
            <h2>实例</h2>
            <dl>
              <div><dt><HardDrive size={13} />游戏文件</dt><dd>{state.installed ? '已就绪' : '按需下载'}</dd></div>
              <div><dt><Cpu size={13} />Java</dt><dd>{state.javaPath ? '托管运行时' : '待准备'}</dd></div>
              <div><dt><Box size={13} />项目 Mod</dt><dd>{projectMod ? formatBytes(projectMod.size) : '未同步'}</dd></div>
            </dl>
          </section>
          <div className={`mc-runtime-message ${state.stage === 'error' ? 'error' : ''}`}><i />{state.message}</div>
        </aside>

        <main className="mc-test-main">
          {state.lastCrash ? (
            <section className="mc-crash-panel">
              <div className="mc-crash-heading">
                <span><CircleAlert size={17} /></span>
                <div><h2>检测到 Mod 运行期崩溃</h2><p>退出代码 {state.lastCrash.exitCode ?? '-'} · {state.lastCrash.reportPath || '未生成崩溃报告'}</p></div>
                <button className="primary-button" disabled={Boolean(busy)} onClick={repairCrash}>
                  {busy === 'repair-crash' ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}AI 修复并重启
                </button>
              </div>
              <pre>{repairOutput || state.lastCrash.summary}</pre>
            </section>
          ) : null}
          <section className="mc-mods-section">
            <div className="mc-section-heading">
              <div><h2>测试模组</h2><p>{state.mods.length} 个 JAR · {dependencies.length} 个前置</p></div>
              <div>
                <button className="icon-button" title="同步项目构建" disabled={Boolean(busy) || state.running} onClick={() => void run('sync', () => window.modmind.minecraft.syncProjectMod())}><RefreshCw size={15} /></button>
                <button className="secondary-button compact" disabled={Boolean(busy) || state.running} onClick={() => void run('import', () => window.modmind.minecraft.importMods())}><PackagePlus size={14} />添加前置 Mod</button>
              </div>
            </div>
            <div className="mc-mod-list">
              {projectMod ? <ModRow mod={projectMod} busy={busy} onRemove={removeMod} /> : (
                <div className="mc-project-missing"><Box size={17} /><span><strong>项目构建产物</strong><small>在 build/libs 生成 JAR 后自动同步</small></span></div>
              )}
              {dependencies.map((mod) => <ModRow key={mod.name} mod={mod} busy={busy} onRemove={removeMod} />)}
              {!dependencies.length ? <div className="mc-mod-empty">没有额外前置模组</div> : null}
            </div>
          </section>

          <section className="mc-console-section">
            <div className="mc-section-heading"><div><h2><TerminalSquare size={15} />运行日志</h2><p>{events.length} 条事件</p></div><button onClick={() => setEvents([])}>清空</button></div>
            <div className="mc-console">
              {events.length ? events.map((event, index) => (
                <div className={`mc-console-line ${event.level ?? 'info'}`} key={`${event.time}-${index}`}><time>{formatTime(event.time)}</time><span>{event.message}</span></div>
              )) : <div className="mc-console-empty">等待下载或启动任务</div>}
            </div>
          </section>
        </main>
      </div>
      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  )
}

function ModRow({ mod, busy, onRemove }: { mod: MinecraftManagedMod; busy: string; onRemove: (mod: MinecraftManagedMod) => void }): React.JSX.Element {
  return (
    <div className="mc-mod-row">
      <span className={`mc-mod-icon ${mod.projectArtifact ? 'project' : ''}`}><Box size={15} /></span>
      <span><strong>{mod.name}</strong><small>{formatBytes(mod.size)} · {mod.projectArtifact ? '当前项目' : '前置模组'}</small></span>
      {mod.projectArtifact ? <em>自动更新</em> : <button className="icon-button" title="移除模组" disabled={Boolean(busy)} onClick={() => onRemove(mod)}><Trash2 size={14} /></button>}
    </div>
  )
}
