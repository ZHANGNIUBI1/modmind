import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle, Puzzle } from 'lucide-react'
import type { PluginRecord } from '../../../shared/plugins'

interface PluginPanelHostProps {
  plugin: PluginRecord
  theme: 'light' | 'dark'
}

/**
 * 插件面板宿主：把插件 panel 入口加载进沙箱 iframe（唯一源、无同源权限），
 * 通过 postMessage 与受控 IPC 中转面板请求。
 */
export function PluginPanelHost({ plugin, theme }: PluginPanelHostProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(plugin.error ?? null)

  const panelSrc = useMemo(() => {
    const entry = plugin.manifest.panel?.entry ?? ''
    return `modmind-plugin://${plugin.manifest.id}/${entry}?revision=${plugin.revision ?? 0}`
  }, [plugin.manifest.id, plugin.manifest.panel?.entry, plugin.revision])

  useEffect(() => {
    setReady(false)
    setError(plugin.error ?? null)
  }, [plugin.manifest.id, plugin.error, plugin.revision])

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as Record<string, unknown> | null
      if (!data || typeof data !== 'object') return

      switch (data.type) {
        case 'ready': {
          setReady(true)
          void window.modmind.plugins.getProjectInfo(plugin.manifest.id).then((projectInfo) => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'hostInfo',
              hostInfo: {
                pluginId: plugin.manifest.id,
                panelVersion: 1,
                theme,
                project: projectInfo
              }
            }, '*')
          }).catch(() => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'hostInfo',
              hostInfo: { pluginId: plugin.manifest.id, panelVersion: 1, theme, project: null }
            }, '*')
          })
          break
        }
        case 'hostInfoAck':
          // 面板确认收到 hostInfo；预留
          break
        case 'invokeTool': {
          const requestId = String(data.requestId ?? '')
          void window.modmind.plugins.invokeTool(plugin.manifest.id, String(data.toolName ?? ''), data.input).then((result) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: true, result }, '*')
          }).catch((cause: unknown) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: false, error: cause instanceof Error ? cause.message : String(cause) }, '*')
          })
          break
        }
        case 'getProjectInfo': {
          const requestId = String(data.requestId ?? '')
          void window.modmind.plugins.getProjectInfo(plugin.manifest.id).then((result) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: true, result }, '*')
          }).catch((cause: unknown) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: false, error: cause instanceof Error ? cause.message : String(cause) }, '*')
          })
          break
        }
        case 'netFetch': {
          const requestId = String(data.requestId ?? '')
          void window.modmind.plugins.handleContextOp(plugin.manifest.id, 'netFetch', {
            url: String(data.url ?? ''),
            init: data.init && typeof data.init === 'object' ? data.init : {}
          }).then((result) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: true, result }, '*')
          }).catch((cause: unknown) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: false, error: cause instanceof Error ? cause.message : String(cause) }, '*')
          })
          break
        }
        case 'copyToClipboard': {
          const requestId = String(data.requestId ?? '')
          void window.modmind.plugins.copyToClipboard(plugin.manifest.id, String(data.text ?? '')).then(() => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: true, result: null }, '*')
          }).catch((cause: unknown) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'result', requestId, ok: false, error: cause instanceof Error ? cause.message : String(cause) }, '*')
          })
          break
        }
        case 'log':
          console.info(`[plugin:${plugin.manifest.id}] ${String(data.level)}: ${String(data.message)}`)
          break
        default:
          break
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [plugin.manifest.id, theme])

  const reload = useCallback(() => {
    setReady(false)
    setError(null)
    if (iframeRef.current) {
      iframeRef.current.src = panelSrc
    }
  }, [panelSrc])

  return (
    <div className="plugin-panel-host" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="content-toolbar" style={{ flexShrink: 0 }}>
        <div>
          <h1><Puzzle size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />{plugin.manifest.name}</h1>
          <p>{plugin.manifest.description} · v{plugin.manifest.version} · {plugin.scope === 'project' ? '项目级' : '全局'}</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={reload}>重新加载</button>
      </div>
      {error ? (
        <div className="large-empty" style={{ flex: 1 }}>
          <AlertTriangle size={26} />
          <h3>插件无法加载</h3>
          <p>{error}</p>
        </div>
      ) : (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {!ready ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <LoaderCircle className="spin" size={22} />
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            src={panelSrc}
            title={`${plugin.manifest.name} 面板`}
            sandbox="allow-scripts allow-downloads"
            onLoad={() => setReady(true)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: 10,
              background: 'var(--surface, rgba(128,128,128,.05))',
              colorScheme: theme
            }}
          />
        </div>
      )}
    </div>
  )
}
