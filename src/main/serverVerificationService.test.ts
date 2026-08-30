import { promises as fs } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ServerProcess, serverModRetryAdvice } from './serverVerificationService'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))) })

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}

describe('server process orchestration', () => {
  it('suggests removing a mod only when the log identifies it as the load failure', () => {
    expect(serverModRetryAdvice('Failed to load mod file C:\\pack\\mods\\broken-addon-1.2.0.jar', ['broken-addon-1.2.0.jar'])).toBe('试试删除《broken-addon-1.2.0.jar》再重试')
    expect(serverModRetryAdvice("Mod 'client_tweaks' (client_tweaks) requires version 2.0.0", [])).toBe('试试删除《client_tweaks》再重试')
    expect(serverModRetryAdvice('Could not download the server runtime from https://example.invalid', ['unrelated.jar'])).toBeUndefined()
  })

  it('waits for both the server ready line and the TCP port before returning', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-server-process-'))
    roots.push(root)
    await fs.writeFile(path.join(root, 'eula.txt'), 'eula=false\n', 'utf8')
    const port = await freePort()
    const script = "const net=require('net');net.createServer().listen(Number(process.argv[1]),'127.0.0.1');console.log('Done (1s)!');setInterval(()=>{},1000)"
    const serverProcess = new ServerProcess()
    const result = await serverProcess.start({ pack: { root, copiedMods: [], skippedClientMods: [], warnings: [], manifestPath: path.join(root, 'modmind.server.json') }, runtime: { launchCommand: [process.execPath, '-e', script, String(port)], loader: 'fabric', loaderVersion: '0.16.0' }, port })
    expect(result.address).toBe(`127.0.0.1:${port}`)
    expect(await fs.stat(result.logPath).then((stat) => stat.isFile())).toBe(true)
    await expect(fs.readFile(path.join(root, 'eula.txt'), 'utf8')).resolves.toBe('eula=true\n')
    await serverProcess.stop()
    expect(serverProcess.isRunning()).toBe(false)
  })

  it('executes bounded scenario commands and requires log evidence', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-server-scenario-'))
    roots.push(root)
    const port = await freePort()
    const script = "const net=require('net');const readline=require('readline');net.createServer().listen(Number(process.argv[1]),'127.0.0.1');console.log('Done (1s)!');readline.createInterface({input:process.stdin}).on('line',line=>console.log('COMMAND '+line));setInterval(()=>{},1000)"
    const serverProcess = new ServerProcess()
    await serverProcess.start({ pack: { root, copiedMods: [], skippedClientMods: [], warnings: [], manifestPath: path.join(root, 'modmind.server.json') }, runtime: { launchCommand: [process.execPath, '-e', script, String(port)], loader: 'fabric', loaderVersion: '0.16.0' }, port })
    await expect(serverProcess.runScenario([{ command: 'say smoke', expect: ['COMMAND say smoke'] }])).resolves.toMatchObject({ success: true, completed: 1 })
    await serverProcess.stop()
  })

  it('turns a Windows batch pause prompt into a server pack error', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-server-pause-'))
    roots.push(root)
    const port = await freePort()
    const script = "console.log('�밴���������. . .');setInterval(()=>{},1000)"
    const serverProcess = new ServerProcess()
    await expect(serverProcess.start({ pack: { root, copiedMods: [], skippedClientMods: [], warnings: [], manifestPath: path.join(root, 'modmind.server.json') }, runtime: { launchCommand: [process.execPath, '-e', script], loader: 'fabric', loaderVersion: '0.16.0' }, port, readyTimeoutMs: 10_000 })).rejects.toThrow('请检查您的服务端包')
    expect(serverProcess.isRunning()).toBe(false)
  })

  it('adds a mod removal suggestion to a failed server start', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-server-mod-failure-'))
    roots.push(root)
    const port = await freePort()
    const script = "console.error('Failed to load mod file C:\\\\pack\\\\mods\\\\broken-addon.jar')"
    const serverProcess = new ServerProcess()
    await expect(serverProcess.start({ pack: { root, copiedMods: ['broken-addon.jar'], skippedClientMods: [], warnings: [], manifestPath: path.join(root, 'modmind.server.json') }, runtime: { launchCommand: [process.execPath, '-e', script], loader: 'fabric', loaderVersion: '0.16.0' }, port, readyTimeoutMs: 10_000 })).rejects.toThrow('试试删除《broken-addon.jar》再重试')
  })
})
