export type GradleDownloadSourcePreference = 'auto' | 'china' | 'official'

export interface GradleDistributionSource {
  id: 'huawei' | 'tencent' | 'official'
  label: string
  url: string
}

export function gradleDistributionSources(
  version: string,
  preference: GradleDownloadSourcePreference
): GradleDistributionSource[] {
  const file = `gradle-${encodeURIComponent(version)}-bin.zip`
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
