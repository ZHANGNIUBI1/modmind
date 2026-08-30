import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { RemoteClientService, type RemoteServerCommand } from './remoteClientService'

interface Peer {
  socket: Duplex
  buffer: Buffer
  onMessage: (message: Record<string, unknown>) => void
}

function serverFrame(value: Record<string, unknown>): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
  if (payload.length < 65_536) {
    const header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
    return Buffer.concat([header, payload])
  }
  throw new Error('test payload too large')
}

function attachPeer(socket: Duplex, request: IncomingMessage, onMessage: Peer['onMessage']): Peer {
  const key = String(request.headers['sec-websocket-key'] ?? '')
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const peer: Peer = { socket, buffer: Buffer.alloc(0), onMessage }
  socket.on('data', (chunk) => {
    peer.buffer = Buffer.concat([peer.buffer, Buffer.from(chunk)])
    // Client frames are masked. Decode one frame at a time while preserving the
    // buffer layout required for the mask key.
    while (peer.buffer.length >= 2) {
      const opcode = peer.buffer[0] & 0x0f
      const second = peer.buffer[1]
      if ((second & 0x80) === 0) throw new Error('client websocket frame was not masked')
      let offset = 2
      let length = second & 0x7f
      if (length === 126) {
        if (peer.buffer.length < 4) return
        length = peer.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        throw new Error('test does not support 64-bit frames')
      }
      if (peer.buffer.length < offset + 4 + length) return
      const mask = peer.buffer.subarray(offset, offset + 4)
      offset += 4
      const payload = Buffer.from(peer.buffer.subarray(offset, offset + length))
      peer.buffer = peer.buffer.subarray(offset + length)
      if (opcode === 0x8) {
        peer.socket.end()
        return
      }
      if (opcode !== 0x1) continue
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
      peer.onMessage(JSON.parse(payload.toString('utf8')) as Record<string, unknown>)
    }
  })
  return peer
}

describe('Remote WebSocket local integration', () => {
  let server: ReturnType<typeof createServer> | undefined
  let service: RemoteClientService | undefined

  afterEach(async () => {
    await service?.stop()
    service = undefined
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = undefined
  })

  it('completes the real WebSocket handshake and v2 command round trip', async () => {
    let peer: Peer | undefined
    const messages: Record<string, unknown>[] = []
    const waiters: Array<(message: Record<string, unknown>) => void> = []
    const nextMessage = (): Promise<Record<string, unknown>> => new Promise((resolve) => {
      const existing = messages.shift()
      if (existing) resolve(existing)
      else waiters.push(resolve)
    })
    const pushMessage = (message: Record<string, unknown>): void => {
      const resolve = waiters.shift()
      if (resolve) resolve(message)
      else messages.push(message)
    }

    server = createServer()
    server.on('upgrade', (request, socket) => {
      peer = attachPeer(socket, request, (message) => {
        pushMessage(message)
        if (message.type === 'device.hello') peer?.socket.write(serverFrame({ type: 'server.ready', protocolVersion: 2 }))
      })
    })
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('local test server did not bind')

    const command = '  原样交给工作台：修复构建并运行测试。\n'
    const seenCommands: RemoteServerCommand[] = []
    service = new RemoteClientService(`ws://127.0.0.1:${address.port}/ws/remote`, 'desktop-integration', 'Integration', 'test', {
      getCredential: async () => 'integration-key',
      onCommand: async (received, context) => {
        seenCommands.push(received)
        context.activity('工作台运行中', 0.5)
        return { status: 'COMPLETED', text: '工作台已完成' }
      },
      onCancel: async () => '已取消'
    })
    await service.start()
    await expect(nextMessage()).resolves.toMatchObject({ type: 'device.hello', credential: 'integration-key', deviceId: 'desktop-integration' })
    await expect(new Promise<void>((resolve) => {
      const check = (): void => {
        if (service?.getState().status === 'ready') resolve()
        else setTimeout(check, 0)
      }
      check()
    })).resolves.toBeUndefined()

    peer?.socket.write(serverFrame({ type: 'server.command', requestId: 'integration-1', text: command, metadata: { source: 'web' } }))
    await expect(nextMessage()).resolves.toMatchObject({ type: 'device.activity', requestId: 'integration-1', state: 'RUNNING' })
    await expect(nextMessage()).resolves.toMatchObject({ type: 'device.activity', requestId: 'integration-1', state: 'COMPLETED' })
    await expect(nextMessage()).resolves.toMatchObject({ type: 'device.response', requestId: 'integration-1', status: 'COMPLETED', text: '工作台已完成' })
    expect(seenCommands[0]).toMatchObject({ type: 'server.command', requestId: 'integration-1', text: command, metadata: { source: 'web' } })
    peer?.socket.write(serverFrame({ type: 'response.ack', requestId: 'integration-1' }))
  }, 10_000)
})
