import { describe, expect, it } from 'vitest'
import { ensureGradleMavenFallback, gradleDistributionSources, GRADLE_MAVEN_FALLBACK_URL } from './gradleDownload'

describe('Gradle distribution sources', () => {
  it('uses domestic mirrors with an official fallback in automatic mode', () => {
    const sources = gradleDistributionSources('9.5.1', 'auto')

    expect(sources.map((source) => source.id)).toEqual(['huawei', 'tencent', 'official'])
    expect(sources.every((source) => source.url.endsWith('/gradle-9.5.1-bin.zip'))).toBe(true)
  })

  it('can be restricted to the official distribution service', () => {
    expect(gradleDistributionSources('8.12.1', 'official')).toEqual([
      {
        id: 'official',
        label: 'Gradle 官方源',
        url: 'https://services.gradle.org/distributions/gradle-8.12.1-bin.zip'
      }
    ])
  })

  it('adds the managed Maven mirror idempotently', () => {
    const source = 'repositories {\n    mavenCentral()\n}\n'
    const next = ensureGradleMavenFallback(source)
    expect(next).toContain(GRADLE_MAVEN_FALLBACK_URL)
    expect(next.indexOf('mavenCentral()')).toBeLessThan(next.indexOf(GRADLE_MAVEN_FALLBACK_URL))
    expect(ensureGradleMavenFallback(next)).toBe(next)
  })

  it('moves the old managed line behind existing Fabric repositories', () => {
    const source = `pluginManagement {\n    repositories {\n        maven { url = '${GRADLE_MAVEN_FALLBACK_URL}' }\n        maven { url = 'https://maven.fabricmc.net/' }\n        gradlePluginPortal()\n    }\n}\n`
    const next = ensureGradleMavenFallback(source)
    expect(next.indexOf('https://maven.fabricmc.net/')).toBeLessThan(next.indexOf(GRADLE_MAVEN_FALLBACK_URL))
    expect(next.indexOf('gradlePluginPortal()')).toBeLessThan(next.indexOf(GRADLE_MAVEN_FALLBACK_URL))
    expect(next.match(new RegExp(GRADLE_MAVEN_FALLBACK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1)
    expect(ensureGradleMavenFallback(next)).toBe(next)
  })
})
