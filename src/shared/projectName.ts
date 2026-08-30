/**
 * Project names are display data. Keep printable Unicode and neutralize
 * characters that can alter terminals, logs, or line-oriented file formats.
 */
export function normalizeProjectName(value: unknown): string {
  let raw = ''
  try {
    raw = typeof value === 'string' ? value : value == null ? '' : String(value)
  } catch {
    raw = ''
  }

  const normalized = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim()

  // Limit by Unicode code points so surrogate pairs (emoji, some CJK) stay intact.
  const limited = Array.from(normalized).slice(0, 100).join('')
  return limited || '未命名项目'
}

/** Validate user-entered names while keeping the normalization policy shared. */
export function validateProjectNameInput(value: unknown): string {
  let raw = ''
  try {
    raw = typeof value === 'string' ? value : value == null ? '' : String(value)
  } catch {
    raw = ''
  }
  const visible = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim()
  if (!visible) throw new Error('项目名称不能为空')
  return normalizeProjectName(raw)
}

/** Escape a project name for a Java .properties value. */
export function projectPropertiesValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('=', '\\=')
    .replaceAll(':', '\\:')
}

/** Escape a project name for Minecraft .lang key/value files. */
export function projectLangValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
}
