import path from 'node:path'

export interface DetectedToolchainRequirements {
  javaMajors: number[]
  gradleVersions: string[]
}

const JAVA_MAJOR_PATTERN = /(?:jdk|java)\s*(?:version\s*)?(?:1\.)?(\d{1,2})\b/gi
const GRADLE_VERSION_PATTERN = /(?:gradle[-\s])((?:\d+\.){1,2}\d+)(?:[-\w.]*)?/gi

function normalizeJavaMajor(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return undefined
  return parsed === 1 ? undefined : parsed
}

function addJavaMajor(target: Set<number>, value: string): void {
  const major = normalizeJavaMajor(value)
  if (major !== undefined) target.add(major)
}

function addGradleVersion(target: Set<string>, value: string): void {
  const normalized = value.trim()
  if (/^(?:\d+\.){1,2}\d+$/.test(normalized)) target.add(normalized)
}

/**
 * Extracts toolchain requests from a Gradle/Forge log. The parser deliberately
 * only accepts versions next to toolchain/provisioning markers so ordinary
 * dependency versions do not cause unrelated JDK downloads.
 */
export function detectToolchainRequirements(logText: string): DetectedToolchainRequirements {
  const javaMajors = new Set<number>()
  const gradleVersions = new Set<string>()
  const lines = logText.split(/\r?\n/)

  for (const line of lines) {
    const lower = line.toLowerCase()
    const javaContext = /(?:provision|toolchain|languageversion|java(?:[.\s]|language)?version|sourcecompatibility|targetcompatibility|jdk cache|missing executable|java installation|java home|java_home)/i.test(line)
    if (javaContext) {
      let match: RegExpExecArray | null
      while ((match = JAVA_MAJOR_PATTERN.exec(line)) !== null) addJavaMajor(javaMajors, match[1])
      JAVA_MAJOR_PATTERN.lastIndex = 0
      const languageVersion = line.match(/(?:languageversion|java(?:[.\s]|language)?version|(?:source|target)compatibility)[^\d]{0,24}(?:of\s*\()?\s*(?:1\.)?(\d{1,2})\b/i)?.[1]
      if (languageVersion) addJavaMajor(javaMajors, languageVersion)
    }

    if (lower.includes('failed to provision jdk')) {
      const provisioned = line.match(/failed to provision jdk\s*(?:1\.)?(\d{1,2})\b/i)?.[1]
      if (provisioned) addJavaMajor(javaMajors, provisioned)
    }
    if (lower.includes('release version')) {
      const release = line.match(/release version\s*(?:1\.)?(\d{1,2})\b/i)?.[1]
      if (release) addJavaMajor(javaMajors, release)
    }

    let gradleMatch: RegExpExecArray | null
    while ((gradleMatch = GRADLE_VERSION_PATTERN.exec(line)) !== null) addGradleVersion(gradleVersions, gradleMatch[1])
    GRADLE_VERSION_PATTERN.lastIndex = 0
  }

  return {
    javaMajors: [...javaMajors].sort((left, right) => left - right),
    gradleVersions: [...gradleVersions].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  }
}

export function mergeToolchainJavaHomes(homes: Iterable<string>): string {
  return [...new Set([...homes].map((home) => home.trim()).filter(Boolean))].join(path.delimiter)
}
