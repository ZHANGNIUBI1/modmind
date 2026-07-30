import { describe, expect, it } from 'vitest'
import { gradleDistributionSources } from './gradleDownload'

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
})
