export type GradleDownloadSourcePreference = 'auto' | 'china' | 'official'

export const GRADLE_MAVEN_FALLBACK_URL = 'https://repo.spongepowered.org/maven/'

export function ensureGradleMavenFallback(source: string, kotlin = false): string {
  const escapedUrl = GRADLE_MAVEN_FALLBACK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const managedLine = new RegExp(`^[\\t ]*maven\\s*(?:\\{\\s*url\\s*=\\s*['"]${escapedUrl}['"]\\s*\\}|\\(\\s*['"]${escapedUrl}['"]\\s*\\))\\s*\\r?\\n?`, 'gm')
  const cleaned = source.replace(managedLine, '')
  if (cleaned.includes(GRADLE_MAVEN_FALLBACK_URL)) return source
  const match = /\brepositories\s*\{/.exec(cleaned)
  if (!match) return source
  const opening = cleaned.indexOf('{', match.index)
  let depth = 0
  let closing = -1
  for (let index = opening; index < cleaned.length; index += 1) {
    if (cleaned[index] === '{') depth += 1
    else if (cleaned[index] === '}' && --depth === 0) {
      closing = index
      break
    }
  }
  if (closing < 0) return source
  const newline = cleaned.includes('\r\n') ? '\r\n' : '\n'
  const lineStart = cleaned.lastIndexOf('\n', match.index) + 1
  const blockIndent = cleaned.slice(lineStart, match.index).match(/^[\t ]*/)?.[0] ?? ''
  const repositoryIndent = `${blockIndent}    `
  const line = kotlin
    ? `${repositoryIndent}maven(${JSON.stringify(GRADLE_MAVEN_FALLBACK_URL)})`
    : `${repositoryIndent}maven { url = '${GRADLE_MAVEN_FALLBACK_URL}' }`
  const before = cleaned.slice(0, closing).replace(/[\t ]+$/, '')
  const separator = before.endsWith(newline) ? '' : newline
  return `${before}${separator}${line}${newline}${cleaned.slice(closing)}`
}

export interface GradleDistributionSource {
  id: 'huawei' | 'tencent' | 'official'
  label: string
  url: string
}

export function gradleDistributionSources(
  version: string,
  preference: GradleDownloadSourcePreference,
  distributionType: 'bin' | 'all' = 'bin'
): GradleDistributionSource[] {
  const file = `gradle-${encodeURIComponent(version)}-${distributionType}.zip`
  const official: GradleDistributionSource = {
    id: 'official',
    label: 'Gradle 官方源',
    url: `https://services.gradle.org/distributions/${file}`
  }
  const domestic: GradleDistributionSource[] = [
    { id: 'huawei', label: '华为云镜像', url: `https://mirrors.huaweicloud.com/gradle/${file}` },
    { id: 'tencent', label: '腾讯云镜像', url: `https://mirrors.cloud.tencent.com/gradle/${file}` }
  ]
  if (preference === 'official') return [official]
  if (preference === 'china') return [...domestic, official]
  return [...domestic, official]
}
