import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagnosticJournal, redactDiagnosticText } from './diagnosticLog'
import { isExpectedCancellation } from '../shared/diagnostics'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('DiagnosticJournal', () => {
  it('distinguishes expected cancellation from operational failures', () => {
    expect(isExpectedCancellation(Object.assign(new Error('request aborted'), { name: 'AbortError' }))).toBe(true)
    expect(isExpectedCancellation(new Error('外部代理任务已停止；已保留当前修改'))).toBe(true)
    expect(isExpectedCancellation(new Error('Gradle build daemon disappeared unexpectedly'))).toBe(false)
  })

  it('persists structured events with recursive secret redaction and error causes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-diagnostic-log-'))
    temporaryRoots.push(root)
    const journal = new DiagnosticJournal()
    journal.configure(root, () => ({ name: 'Test Project', loader: 'fabric', minecraftVersion: '1.21.1' }))
    const cause = new Error('request failed for https://example.test/file?token=very-secret-token')
    const error = new AggregateError([cause, new Error('mirror returned HTTP 502')], 'download failed', { cause })

    journal.record({
      subsystem: 'download',
      operation: 'test',
      phase: 'error',
      message: 'Authorization: Bearer hidden-bearer-value',
      data: { apiKey: 'hidden-api-key', nested: { password: 'hidden-password', safe: 'visible' } },
      error
    })
    await journal.flush()

    const content = await fs.readFile(path.join(root, 'diagnostic-events.jsonl'), 'utf8')
    expect(content).not.toContain('hidden-bearer-value')
    expect(content).not.toContain('hidden-api-key')
    expect(content).not.toContain('hidden-password')
    expect(content).not.toContain('very-secret-token')
    const event = JSON.parse(content.trim()) as Record<string, unknown>
    expect(event).toMatchObject({ subsystem: 'download', operation: 'test', phase: 'error' })
    expect(event.project).toMatchObject({ name: 'Test Project', loader: 'fabric' })
    expect(event.data).toMatchObject({ apiKey: '[REDACTED]', nested: { password: '[REDACTED]', safe: 'visible' } })
    expect(event.error).toMatchObject({ message: 'download failed', cause: { name: 'Error' }, errors: [{ name: 'Error' }, { message: 'mirror returned HTTP 502' }] })
    expect(journal.snapshot()).toHaveLength(1)
  })

  it('redacts credentials in headers, assignments, and URL queries', () => {
    const input = [
      'authorization=Basic abc',
      'cookie=session-secret',
      'token=xyz',
      'https://user:pass@x.test/a?api_key=123&code=456',
      'password="pw"',
      'sk-abcdefghijklmnop',
      'ghp_abcdefghijklmnopqrstuvwxyz123456'
    ].join('\n')
    const output = redactDiagnosticText(input)
    expect(output).not.toContain('abc')
    expect(output).not.toContain('xyz')
    expect(output).not.toContain('123')
    expect(output).not.toContain('456')
    expect(output).not.toContain('"pw"')
    expect(output).not.toContain('sk-abcdefghijklmnop')
    expect(output).not.toContain('session-secret')
    expect(output).not.toContain('user:pass')
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456')
  })

  it('writes critical events synchronously before process shutdown', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-diagnostic-critical-'))
    temporaryRoots.push(root)
    const journal = new DiagnosticJournal()
    journal.configure(root)

    journal.recordCritical({ subsystem: 'process', operation: 'fatal', phase: 'error', message: 'fatal marker', error: new Error('boom') })

    const content = await fs.readFile(path.join(root, 'diagnostic-events.jsonl'), 'utf8')
    expect(content).toContain('fatal marker')
    expect(content).toContain('boom')
  })
})
