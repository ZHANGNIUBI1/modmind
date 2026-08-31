import { describe, expect, it } from 'vitest'
import { detectToolchainRequirements, mergeToolchainJavaHomes } from './toolchainDetection'

describe('toolchain requirement detection', () => {
  it('extracts JDK requests made by Forge Mavenizer and Gradle toolchains', () => {
    const result = detectToolchainRequirements([
      'Failed to provision JDK 8',
      'java.toolchain.languageVersion = JavaLanguageVersion.of(25)',
      'java.version = 17',
      'Downloading gradle-9.5.0-bin.zip'
    ].join('\n'))
    expect(result.javaMajors).toEqual([8, 17, 25])
    expect(result.gradleVersions).toEqual(['9.5.0'])
  })

  it('does not treat ordinary dependency versions as JDK requirements', () => {
    const result = detectToolchainRequirements('Could not download foo-21.1.jar (com.example:foo:21.1)')
    expect(result.javaMajors).toEqual([])
    expect(result.gradleVersions).toEqual([])
  })

  it('deduplicates Java homes for Gradle installation paths', () => {
    expect(mergeToolchainJavaHomes(['C:\\jdk-8', 'C:\\jdk-8', 'C:\\jdk-25'])).toContain('C:\\jdk-8')
  })
})
