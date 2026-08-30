import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, CircleAlert, Pencil, RotateCcw, Trash2, X } from 'lucide-react'

export type ConfirmDialogOptions = {
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  actionIcon?: 'continue' | 'restore' | 'delete'
}

export type PromptDialogOptions = {
  title: string
  message?: string
  value?: string
  placeholder?: string
  inputLabel?: string
  confirmLabel?: string
}

function useDialogEscape(onCancel: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])
}

function ConfirmDialog({ request, onResolve }: { request: ConfirmDialogOptions; onResolve: (value: boolean) => void }): React.JSX.Element {
  const id = useId().replaceAll(':', '')
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const resolveRef = useRef(onResolve)
  resolveRef.current = onResolve
  useDialogEscape(() => resolveRef.current(false))

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const danger = request.tone === 'danger'
  const ActionIcon = request.actionIcon === 'continue' ? ArrowRight : request.actionIcon === 'restore' ? RotateCcw : request.actionIcon === 'delete' || danger ? Trash2 : CircleAlert
  return <div className="modal-backdrop interaction-dialog-backdrop" role="presentation" onMouseDown={() => onResolve(false)}>
    <div className={`dialog interaction-dialog ${danger ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="interaction-dialog-heading">
        <span className="interaction-dialog-icon" aria-hidden="true"><ActionIcon size={18} /></span>
        <div><h2 id={`${id}-title`}>{request.title}</h2><p id={`${id}-message`}>{request.message}</p></div>
        <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={() => onResolve(false)}><X size={16} /></button>
      </div>
      {request.detail ? <p className="interaction-dialog-detail">{request.detail}</p> : null}
      <div className="dialog-footer interaction-dialog-footer">
        <button ref={cancelRef} className="secondary-button" type="button" onClick={() => onResolve(false)}>{request.cancelLabel ?? '取消'}</button>
        <button className={danger ? 'danger-button' : 'primary-button'} type="button" onClick={() => onResolve(true)}><ActionIcon size={15} />{request.confirmLabel ?? '确认'}</button>
      </div>
    </div>
  </div>
}

function PromptDialog({ request, onResolve }: { request: PromptDialogOptions; onResolve: (value: string | null) => void }): React.JSX.Element {
  const id = useId().replaceAll(':', '')
  const [value, setValue] = useState(request.value ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resolveRef = useRef(onResolve)
  resolveRef.current = onResolve
  useDialogEscape(() => resolveRef.current(null))

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const submit = (): void => onResolve(value.trim() || null)
  return <div className="modal-backdrop interaction-dialog-backdrop" role="presentation" onMouseDown={() => onResolve(null)}>
    <div className="dialog interaction-dialog prompt-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="interaction-dialog-heading">
        <span className="interaction-dialog-icon" aria-hidden="true"><Pencil size={18} /></span>
        <div><h2 id={`${id}-title`}>{request.title}</h2>{request.message ? <p>{request.message}</p> : null}</div>
        <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={() => onResolve(null)}><X size={16} /></button>
      </div>
      <label className="interaction-dialog-field"><span>{request.inputLabel ?? '内容'}</span><input ref={inputRef} value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} /></label>
      <div className="dialog-footer interaction-dialog-footer">
        <button className="secondary-button" type="button" onClick={() => onResolve(null)}>取消</button>
        <button className="primary-button" type="button" disabled={!value.trim()} onClick={submit}><Pencil size={15} />{request.confirmLabel ?? '确定'}</button>
      </div>
    </div>
  </div>
}

export function useConfirmDialog(): { confirm: (options: ConfirmDialogOptions) => Promise<boolean>; dialog: React.JSX.Element | null } {
  const [request, setRequest] = useState<ConfirmDialogOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setRequest(options)
  }), [])
  const resolve = useCallback((value: boolean): void => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setRequest(null)
    resolver?.(value)
  }, [])
  useEffect(() => () => {
    resolverRef.current?.(false)
    resolverRef.current = null
  }, [])
  return { confirm, dialog: request ? <ConfirmDialog request={request} onResolve={resolve} /> : null }
}

export function usePromptDialog(): { prompt: (options: PromptDialogOptions) => Promise<string | null>; dialog: React.JSX.Element | null } {
  const [request, setRequest] = useState<PromptDialogOptions | null>(null)
  const resolverRef = useRef<((value: string | null) => void) | null>(null)
  const prompt = useCallback((options: PromptDialogOptions) => new Promise<string | null>((resolve) => {
    resolverRef.current?.(null)
    resolverRef.current = resolve
    setRequest(options)
  }), [])
  const resolve = useCallback((value: string | null): void => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setRequest(null)
    resolver?.(value)
  }, [])
  useEffect(() => () => {
    resolverRef.current?.(null)
    resolverRef.current = null
  }, [])
  return { prompt, dialog: request ? <PromptDialog request={request} onResolve={resolve} /> : null }
}
