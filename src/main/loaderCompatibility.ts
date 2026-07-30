import type { LoaderKind, ProjectInfo } from '../shared/types'

export interface LoaderBuildCompatibility {
  javaVersion: number
  gradleVersion: string
  gradleChecksum: string
  pluginVersion: string
}

const gradleChecksums: Record<string, string> = {
  '8.9': 'd725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab',
  '8.12.1': '8d97a97984f6cbd2b85fe4c60a743440a347544bf18818048e611f5288d46c94',
  '9.2.1': '72f44c9f8ebcb1af43838f45ee5c4aa9c5444898b3468ab3f4af7b6076c5bc3f',
  '9.5.0': '553c78f50dafcd54d65b9a444649057857469edf836431389695608536d6b746',
  '9.5.1': 'bafc141b619ad6350fd975fc903156dd5c151998cc8b058e8c1044ab5f7b031f'
}

export function gradleChecksumForVersion(version: string): string | undefined {
  return gradleChecksums[version]
}

export function compareMinecraftVersions(left: string, right: string): number {
  const normalize = (value: string): number[] => (value.startsWith('1.') ? value.slice(2) : value)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  const a = normalize(left)
  const b = normalize(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

function between(version: string, minimum: string, maximum: string): boolean {
  return compareMinecraftVersions(version, minimum) >= 0 && compareMinecraftVersions(version, maximum) <= 0
}

export function supportsProjectCreation(loader: LoaderKind, minecraftVersion: string): boolean {
  if (loader === 'fabric') return between(minecraftVersion, '1.20.1', '26.2')
  if (loader === 'quilt') return between(minecraftVersion, '1.18.2', '1.21')
  if (loader === 'forge') return between(minecraftVersion, '1.20.1', '26.2')
  return between(minecraftVersion, '1.20.4', '26.2')
}

export function assertProjectCreationSupported(loader: LoaderKind, minecraftVersion: string): void {
  if (!supportsProjectCreation(loader, minecraftVersion)) {
    throw new Error(`${loader} / Minecraft ${minecraftVersion} is not supported by the bundled official template`)
  }
}

export function javaVersionForMinecraft(version: string): number {
  if (compareMinecraftVersions(version, '26.2') >= 0) return 25
  if (!version.startsWith('1.')) return 21
  const normalized = version.slice(2)
  const [major = 0, minor = 0] = normalized.split('.').map((part) => Number.parseInt(part, 10) || 0)
  if (major <= 16) return 8
  if (major === 17) return 16
  if (major < 20 || (major === 20 && minor <= 4)) return 17
  return 21
}

export function javaRuntimeTargetForMinecraft(version: string): string {
  if (compareMinecraftVersions(version, '26.2') >= 0) return 'java-runtime-epsilon'
  if (compareMinecraftVersions(version, '1.20.5') >= 0) return 'java-runtime-delta'
  if (compareMinecraftVersions(version, '1.18') >= 0) return 'java-runtime-gamma'
  if (compareMinecraftVersions(version, '1.17') >= 0) return 'java-runtime-alpha'
  return 'jre-legacy'
}

export function loaderBuildCompatibility(loader: LoaderKind, minecraftVersion: string): LoaderBuildCompatibility {
  const javaVersion = javaVersionForMinecraft(minecraftVersion)
  let gradleVersion: string
  let pluginVersion: string

  if (loader === 'fabric') {
    gradleVersion = '9.5.1'
    pluginVersion = '1.17.17'
  } else if (loader === 'quilt') {
    gradleVersion = '8.9'
    pluginVersion = '1.7.4'
  } else if (loader === 'forge') {
    const modernPlugin = compareMinecraftVersions(minecraftVersion, '1.21.3') >= 0
      || minecraftVersion.startsWith('26.')
    gradleVersion = modernPlugin ? '9.5.0' : '8.12.1'
    pluginVersion = modernPlugin ? '7.0.31' : '6.0.54'
  } else {
    gradleVersion = '9.2.1'
    pluginVersion = '2.0.143'
  }

  return {
    javaVersion,
    gradleVersion,
    gradleChecksum: gradleChecksums[gradleVersion],
    pluginVersion
  }
}

export function gradleVersionForProject(project: Pick<ProjectInfo, 'loader' | 'minecraftVersion'>): string {
  if (supportsProjectCreation(project.loader, project.minecraftVersion)) {
    return loaderBuildCompatibility(project.loader, project.minecraftVersion).gradleVersion
  }
  if (project.loader === 'fabric' && compareMinecraftVersions(project.minecraftVersion, '1.18') < 0) return '7.6.4'
  if (project.loader === 'forge') {
    if (compareMinecraftVersions(project.minecraftVersion, '1.8') < 0) return '2.14.1'
    if (compareMinecraftVersions(project.minecraftVersion, '1.13') < 0) return '4.10.3'
    if (compareMinecraftVersions(project.minecraftVersion, '1.17') < 0) return '6.9.4'
    if (compareMinecraftVersions(project.minecraftVersion, '1.18') < 0) return '7.3.3'
  }
  return '8.12.1'
}

export function gradleWrapperProperties(project: Pick<ProjectInfo, 'loader' | 'minecraftVersion'>): string {
  const compatibility = loaderBuildCompatibility(project.loader, project.minecraftVersion)
  return [
    'distributionBase=GRADLE_USER_HOME',
    'distributionPath=wrapper/dists',
    `distributionUrl=https\\://services.gradle.org/distributions/gradle-${compatibility.gradleVersion}-bin.zip`,
    `distributionSha256Sum=${compatibility.gradleChecksum}`,
    'networkTimeout=30000',
    'validateDistributionUrl=true',
    'zipStoreBase=GRADLE_USER_HOME',
    'zipStorePath=wrapper/dists',
    ''
  ].join('\n')
}

export const officialTemplateSources: Record<LoaderKind, string> = {
  fabric: 'https://github.com/FabricMC/fabric-example-mod',
  quilt: 'https://github.com/QuiltMC/quilt-template-mod',
  forge: 'https://github.com/MinecraftForge/MinecraftForge/tree/1.21.11/mdk',
  neoforge: 'https://github.com/NeoForgeMDKs/MDK-1.21.11-ModDevGradle'
}
