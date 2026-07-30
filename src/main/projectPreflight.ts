import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProjectInfo } from '../shared/types'
import { descriptorPath } from './projectTemplates'

async function exists(target: string): Promise<boolean> {
  return await fs.access(target).then(() => true).catch(() => false)
}

export async function inspectProjectPreflight(project: ProjectInfo, manifestName = 'modmind.project.json'): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = []
  const descriptor = descriptorPath(project.loader, project.minecraftVersion)
  const required: Array<{ label: string; alternatives: string[] }> = [
    { label: manifestName, alternatives: [manifestName] },
    { label: 'build.gradle or build.gradle.kts', alternatives: ['build.gradle', 'build.gradle.kts'] },
    { label: 'settings.gradle or settings.gradle.kts', alternatives: ['settings.gradle', 'settings.gradle.kts'] },
    { label: descriptor, alternatives: [descriptor] }
  ]
  for (const requirement of required) {
    const present = (await Promise.all(requirement.alternatives.map((file) => exists(path.join(project.path, ...file.split('/')))))).some(Boolean)
    logs.push(`${present ? 'PASS' : 'FAIL'}  ${requirement.label}`)
  }
  const wrapperFiles = ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties']
  const wrapperComplete = (await Promise.all(wrapperFiles.map((file) => exists(path.join(project.path, ...file.split('/')))))).every(Boolean)
  logs.push(`${wrapperComplete ? 'PASS' : 'INFO'}  Gradle Wrapper ${wrapperComplete ? 'complete' : 'missing; managed Gradle will be used'}`)
  try {
    const descriptorContent = await fs.readFile(path.join(project.path, ...descriptor.split('/')), 'utf8')
    let modId = ''
    if (project.loader === 'fabric') {
      const parsed = JSON.parse(descriptorContent) as { id?: unknown }
      modId = typeof parsed.id === 'string' ? parsed.id : ''
    } else if (project.loader === 'quilt') {
      const parsed = JSON.parse(descriptorContent) as { quilt_loader?: { id?: unknown } }
      modId = typeof parsed.quilt_loader?.id === 'string' ? parsed.quilt_loader.id : ''
    } else if (descriptor.endsWith('mcmod.info')) {
      const parsed = JSON.parse(descriptorContent) as Array<{ modid?: unknown }>
      modId = typeof parsed[0]?.modid === 'string' ? parsed[0].modid : ''
    } else {
      modId = descriptorContent.match(/modId\s*=\s*["']([a-z0-9_]{2,64})["']/i)?.[1] ?? ''
    }
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(modId)) throw new Error('missing or invalid mod id')
    logs.push(`PASS  ${path.basename(descriptor)} syntax`)
  } catch (error) {
    logs.push(`FAIL  ${path.basename(descriptor)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { success: !logs.some((line) => line.startsWith('FAIL')), logs }
}
