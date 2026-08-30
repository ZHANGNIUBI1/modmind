import path from 'node:path'

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function isSafeModJarFileName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 5 || value.length > 240 || value.trim() !== value || !/\.jar$/i.test(value)) return false
  if (value !== path.basename(value) || /[\\/:*?"<>|\u0000-\u001f]/.test(value)) return false
  const stem = value.slice(0, -4)
  return Boolean(stem) && !WINDOWS_RESERVED_NAME.test(stem)
}

export function safeModJarFileName(value: unknown): string {
  if (!isSafeModJarFileName(value)) throw new Error(`invalid mod JAR filename: ${String(value)}`)
  return value
}
