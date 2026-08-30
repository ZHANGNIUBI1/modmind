import { afterEach, describe, expect, it, vi } from 'vitest'

type FakeEvent = { data?: unknown; code?: number; reason?: string }
type FakeListener = (event: FakeEvent) => void

const fake = vi.hoisted(() => {
  const instances: Array<{
    readyState: number
    sent: string[]
    open: () => void
    emit: (type: string, event?: FakeEvent) => void
    close: (code?: number, reason?: string) => void
  }> = []

  class FakeWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = FakeWebSocket.CONNECTING
    readonly OPEN = FakeWebSocket.OPEN
    readonly CLOSING = FakeWebSocket.CLOSING
    readonly CLOSED = FakeWebSocket.CLOSED
    readyState = FakeWebSocket.CONNECTING
    sent: string[] = []
    private readonly listeners = new Map<string, Set<FakeListener>>()

    constructor(_endpoint: string) {
      instances.push(this)
    }

    addEventListener(type: string, listener: FakeListener): void {
      const listeners = this.listeners.get(type) ?? new Set<FakeListener>()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }

    send(data: string): void {
      if (this.readyState !== this.OPEN) throw new Error('socket is not open')
      this.sent.push(data)
    }

    open(): void {
      this.readyState = this.OPEN
      this.emit('open')
    }

    emit(type: string, event: FakeEvent = {}): void {
      for (const listener of this.listeners.get(type) ?? []) listener(event)
    }

    close(code = 1000, reason = ''): void {
      if (this.readyState >= this.CLOSING) return
      this.readyState = this.CLOSING
      this.readyState = this.CLOSED
      this.emit('close', { code, reason })
    }
  }

  return { FakeWebSocket, instances }
})

vi.mock('undici', () => ({ WebSocket: fake.FakeWebSocket }))

import { RemoteClientService, remoteEndpointFromSite } from './remoteClientService'

function lastSocket(): InstanceType<typeof fake.FakeWebSocket> {
  const socket = fake.instances.at(-1)
  if (!socket) throw new Error('expected a fake websocket')
  return socket as InstanceType<typeof fake.FakeWebSocket>
}

function sendMessage(socket: InstanceType<typeof fake.FakeWebSocket>, message: Record<string, unknown>): void {
  socket.emit('message', { data: JSON.stringify(message) })
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  fake.instances.splice(0)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Remote WebSocket endpoint', () => {
  it('derives production and local websocket URLs without changing the path contract', () => {
    expect(remoteEndpointFromSite('https://ether-studio.top')).toBe('wss://ether-studio.top/ws/remote')
    expect(remoteEndpointFromSite('http://127.0.0.1:4312/')).toBe('ws://127.0.0.1:4312/ws/remote')
  })
})

describe('Remote WebSocket v2 client', () => {
  it('authenticates, dispatches commands, forwards activity, and tracks response ACKs', async () => {
    const onCommand = vi.fn(async (_command, context: { activity: (text: string, progress?: number) => void }) => {
      context.activity('正在执行', 0.4)
      return { status: 'COMPLETED' as const, text: '已完成', result: { changedFiles: ['src/Test.java'] } }
    })
    const service = new RemoteClientService('wss://example.test/ws/remote', 'desktop-1', 'Desktop', '1.3.4', {
      getCredential: async () => 'access-key',
      onCommand,
      onCancel: async () => '已取消'
    })

    await service.start()
    const socket = lastSocket()
    socket.open()
    await flush()
    expect(JSON.parse(socket.sent[0])).toMatchObject({ type: 'device.hello', credential: 'access-key', deviceId: 'desktop-1', deviceType: 'DESKTOP' })

    sendMessage(socket, { type: 'server.ready', protocolVersion: 2 })
    await flush()
    expect(service.getState()).toMatchObject({ status: 'ready', protocolVersion: 2 })

    sendMessage(socket, { type: 'server.command', requestId: 'req-1', text: '构建项目' })
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(socket.sent.some((value) => JSON.parse(value).type === 'device.response')).toBe(true))
    const activity = socket.sent.map((value) => JSON.parse(value)).find((value) => value.type === 'device.activity')
    expect(activity).toMatchObject({ requestId: 'req-1', state: 'RUNNING', progress: 0.4, text: '正在执行' })
    const response = socket.sent.map((value) => JSON.parse(value)).find((value) => value.type === 'device.response')
    expect(response).toMatchObject({ requestId: 'req-1', status: 'COMPLETED', text: '已完成', result: { changedFiles: ['src/Test.java'] } })

    sendMessage(socket, { type: 'response.ack', requestId: 'req-1' })
    sendMessage(socket, { type: 'server.command', requestId: 'req-1', text: '重复任务' })
    await flush()
    expect(onCommand).toHaveBeenCalledTimes(1)
    sendMessage(socket, { type: 'server.command', requestId: 'req-2', text: '第二个任务' })
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(2))
  })

  it('resends an unacknowledged response after reconnecting', async () => {
    vi.useFakeTimers()
    const service = new RemoteClientService('wss://example.test/ws/remote', 'desktop-1', 'Desktop', '1.3.4', {
      getCredential: async () => 'access-key',
      onCommand: async () => ({ status: 'COMPLETED' as const, text: '完成' }),
      onCancel: async () => '已取消'
    })

    await service.start()
    let socket = lastSocket()
    socket.open()
    sendMessage(socket, { type: 'server.ready', protocolVersion: 2 })
    sendMessage(socket, { type: 'server.command', requestId: 'req-1', text: '任务' })
    await vi.waitFor(() => expect(socket.sent.some((value) => JSON.parse(value).type === 'device.response')).toBe(true))
    const firstResponseCount = socket.sent.filter((value) => JSON.parse(value).type === 'device.response').length

    socket.close(1006, 'network lost')
    await vi.advanceTimersByTimeAsync(1_000)
    socket = lastSocket()
    expect(service.getState().status).toBe('connecting')
    socket.open()
    sendMessage(socket, { type: 'server.ready', protocolVersion: 2 })
    await flush()
    expect(socket.sent.filter((value) => JSON.parse(value).type === 'device.response').length).toBe(firstResponseCount)
    expect(service.getState().status).toBe('ready')
  })

  it('aborts the active command when the server cancels it', async () => {
    let aborted = false
    const onCancel = vi.fn(async () => '取消已处理')
    const service = new RemoteClientService('wss://example.test/ws/remote', 'desktop-1', 'Desktop', '1.3.4', {
      getCredential: async () => 'access-key',
      onCommand: async (_command, context) => {
        await new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => { aborted = true; resolve() }, { once: true })
        })
        return { status: 'FAILED' as const, error: '已取消' }
      },
      onCancel
    })

    await service.start()
    const socket = lastSocket()
    socket.open()
    sendMessage(socket, { type: 'server.ready', protocolVersion: 2 })
    sendMessage(socket, { type: 'server.command', requestId: 'req-1', text: '长任务' })
    await vi.waitFor(() => expect(service.getState().activeRequestId).toBe('req-1'))
    sendMessage(socket, { type: 'server.cancel', requestId: 'cancel-1', targetRequestId: 'req-1' })
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'cancel-1', targetRequestId: 'req-1' })))
    await vi.waitFor(() => expect(aborted).toBe(true))
    expect(socket.sent.map((value) => JSON.parse(value)).some((value) => value.type === 'device.response' && value.requestId === 'cancel-1' && value.status === 'COMPLETED')).toBe(true)

    sendMessage(socket, { type: 'server.cancel', requestId: 'cancel-2', targetRequestId: 'unknown-request' })
    await vi.waitFor(() => expect(socket.sent.map((value) => JSON.parse(value)).some((value) => value.type === 'device.response' && value.requestId === 'cancel-2')).toBe(true))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('stops retrying after the server permanently disables Remote', async () => {
    const service = new RemoteClientService('wss://example.test/ws/remote', 'desktop-1', 'Desktop', '1.3.4', {
      getCredential: async () => 'access-key',
      onCommand: async () => ({ status: 'COMPLETED' as const, text: '完成' }),
      onCancel: async () => '已取消'
    })
    await service.start()
    const socket = lastSocket()
    socket.open()
    sendMessage(socket, { type: 'server.ready', protocolVersion: 2 })
    sendMessage(socket, { type: 'server.error', code: 'REMOTE_DISABLED', message: 'Remote 已关闭' })
    expect(service.getState()).toMatchObject({ status: 'disabled', enabled: false, lastError: 'Remote 已关闭' })
    expect(fake.instances).toHaveLength(1)
  })
})
