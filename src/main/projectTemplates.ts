import type { LoaderKind, ProjectInfo } from '../shared/types'
import { javaVersionForMinecraft } from './loaderCatalog'

function slugPackage(project: ProjectInfo): { name: string; path: string } {
  const name = `dev.modmind.${project.namespace}`
  return { name, path: name.replaceAll('.', '/') }
}

function compareMinecraft(left: string, right: string): number {
  const normalize = (value: string): number[] => (value.startsWith('1.') ? value.slice(2) : value).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = normalize(left)
  const b = normalize(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

export function descriptorPath(loader: LoaderKind, minecraftVersion: string): string {
  if (loader === 'fabric') return 'src/main/resources/fabric.mod.json'
  if (loader === 'quilt') return 'src/main/resources/quilt.mod.json'
  if (loader === 'forge' && compareMinecraft(minecraftVersion, '1.13') < 0) return 'src/main/resources/mcmod.info'
  if (loader === 'neoforge' && compareMinecraft(minecraftVersion, '1.20.5') >= 0) {
    return 'src/main/resources/META-INF/neoforge.mods.toml'
  }
  return 'src/main/resources/META-INF/mods.toml'
}

function quiltFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const javaVersion = project.javaVersion ?? javaVersionForMinecraft(project.minecraftVersion)
  const packageInfo = slugPackage(project)
  const loomVersion = compareMinecraft(project.minecraftVersion, '1.20.2') < 0 ? '1.4.1' : '1.7.4'
  const properties = [...commonProperties(project, javaVersion), `qfapi_version=${project.apiVersion ?? ''}`]
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {\n    repositories {\n        maven { url = 'https://maven.quiltmc.org/repository/release/' }\n        maven { url = 'https://maven.fabricmc.net/' }\n        gradlePluginPortal()\n    }\n}\n\nrootProject.name = '${project.namespace}'\n`,
    'gradle.properties': `${properties.join('\n')}\n`,
    'build.gradle': `plugins {\n    id 'org.quiltmc.loom' version '${loomVersion}'\n    id 'maven-publish'\n}\n\nversion = project.mod_version\ngroup = project.maven_group\nbase.archivesName = project.archives_base_name\n\nrepositories {\n    maven { url = 'https://maven.quiltmc.org/repository/release/' }\n    maven { url = 'https://maven.fabricmc.net/' }\n    mavenCentral()\n}\n\ndependencies {\n    minecraft "com.mojang:minecraft:\${project.minecraft_version}"\n    mappings loom.officialMojangMappings()\n    modImplementation "org.quiltmc:quilt-loader:\${project.loader_version}"\n    modImplementation "org.quiltmc.quilted-fabric-api:quilted-fabric-api:\${project.qfapi_version}"\n}\n\njava {\n    toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})\n}\n\nprocessResources {\n    inputs.property 'version', project.version\n    filesMatching('quilt.mod.json') { expand version: project.version }\n}\n`,
    [descriptorPath('quilt', project.minecraftVersion)]: JSON.stringify({
      schema_version: 1,
      quilt_loader: {
        group: `dev.modmind.${project.namespace}`,
        id: project.namespace,
        version: '${version}',
        metadata: {
          name: project.name,
          description: 'Created with ModMind',
          license: 'MIT'
        },
        intermediate_mappings: 'net.fabricmc:intermediary',
        entrypoints: { init: [`${packageInfo.name}.ModMindEntry`] },
        depends: [
          { id: 'quilt_loader', versions: `>=${project.loaderVersion ?? '0.26.0'}` },
          { id: 'minecraft', versions: project.minecraftVersion },
          { id: 'java', versions: `>=${javaVersion}` },
          { id: 'quilted_fabric_api', versions: '*' }
        ]
      }
    }, null, 2)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};\n\nimport org.quiltmc.loader.api.ModContainer;\nimport org.quiltmc.qsl.base.api.entrypoint.ModInitializer;\n\npublic final class ModMindEntry implements ModInitializer {\n    public static final String MOD_ID = "${project.namespace}";\n\n    @Override\n    public void onInitialize(ModContainer mod) {\n        System.out.println("[ModMind] ${project.name} initialized");\n    }\n}\n`
  }
  return files
}

function commonProperties(project: ProjectInfo, javaVersion: number): string[] {
  return [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.parallel=true',
    `minecraft_version=${project.minecraftVersion}`,
    `loader_version=${project.loaderVersion ?? ''}`,
    `java_version=${javaVersion}`,
    'mod_version=0.1.0',
    `mod_id=${project.namespace}`,
    `mod_name=${project.name}`,
    `maven_group=dev.modmind.${project.namespace}`,
    `archives_base_name=${project.namespace}`
  ]
}

function fabricFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const javaVersion = project.javaVersion ?? javaVersionForMinecraft(project.minecraftVersion)
  const packageInfo = slugPackage(project)
  const loomVersion = compareMinecraft(project.minecraftVersion, '1.18') < 0
    ? '0.12-SNAPSHOT'
    : compareMinecraft(project.minecraftVersion, '1.20') < 0 ? '1.2-SNAPSHOT' : '1.10.5'
  const properties = [...commonProperties(project, javaVersion)]
  if (project.apiVersion) properties.push(`fabric_version=${project.apiVersion}`)
  const apiDependency = project.apiVersion
    ? '    modImplementation "net.fabricmc.fabric-api:fabric-api:${project.fabric_version}"\n'
    : ''
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {\n    repositories {\n        maven { url = 'https://maven.fabricmc.net/' }\n        gradlePluginPortal()\n    }\n}\n\nrootProject.name = '${project.namespace}'\n`,
    'gradle.properties': `${properties.join('\n')}\n`,
    'build.gradle': `plugins {\n    id 'fabric-loom' version '${loomVersion}'\n    id 'maven-publish'\n}\n\nversion = project.mod_version\ngroup = project.maven_group\n\nrepositories {\n    maven { url = 'https://maven.fabricmc.net/' }\n    mavenCentral()\n}\n\ndependencies {\n    minecraft "com.mojang:minecraft:\${project.minecraft_version}"\n    mappings loom.officialMojangMappings()\n    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"\n${apiDependency}}\n\njava {\n    toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})\n}\n\nprocessResources {\n    inputs.property "version", project.version\n    filesMatching("fabric.mod.json") { expand "version": project.version }\n}\n`,
    [descriptorPath('fabric', project.minecraftVersion)]: JSON.stringify({
      schemaVersion: 1,
      id: project.namespace,
      version: '${version}',
      name: project.name,
      description: 'Created with ModMind',
      environment: '*',
      entrypoints: { main: [`${packageInfo.name}.ModMindEntry`] },
      depends: {
        fabricloader: '>=0.14.0',
        ...(project.apiVersion ? { 'fabric-api': '*' } : {}),
        minecraft: project.minecraftVersion,
        java: `>=${javaVersion}`
      }
    }, null, 2)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};\n\nimport net.fabricmc.api.ModInitializer;\n\npublic final class ModMindEntry implements ModInitializer {\n    public static final String MOD_ID = "${project.namespace}";\n\n    @Override\n    public void onInitialize() {\n        System.out.println("[ModMind] ${project.name} initialized");\n    }\n}\n`
  }
  return files
}

function forgeGradleBuild(project: ProjectInfo, javaVersion: number): string {
  if (compareMinecraft(project.minecraftVersion, '1.13') < 0) {
    const forgeGradle = compareMinecraft(project.minecraftVersion, '1.8') < 0 ? '1.2-SNAPSHOT' : '2.3-SNAPSHOT'
    const plugin = compareMinecraft(project.minecraftVersion, '1.8') < 0 ? 'forge' : 'net.minecraftforge.gradle.forge'
    return `buildscript {\n    repositories { maven { url = 'https://maven.minecraftforge.net/' }; mavenCentral() }\n    dependencies { classpath 'net.minecraftforge.gradle:ForgeGradle:${forgeGradle}' }\n}\napply plugin: '${plugin}'\n\nversion = project.mod_version\ngroup = project.maven_group\narchivesBaseName = project.archives_base_name\n\nminecraft {\n    version = project.loader_version\n    runDir = 'run'\n    mappings = 'stable_39'\n}\n`
  }
  const pluginVersion = compareMinecraft(project.minecraftVersion, '1.20') >= 0 ? '[6.0,6.2)' : compareMinecraft(project.minecraftVersion, '1.18') >= 0 ? '[5.1,6.0)' : '[3.0,5.0)'
  const gameTest = compareMinecraft(project.minecraftVersion, '1.18') >= 0
    ? `\n        gameTestServer {\n            workingDirectory project.file('run-gametest')\n            property 'forge.enabledGameTestNamespaces', '${project.namespace}'\n        }`
    : ''
  return `plugins {\n    id 'java'\n    id 'net.minecraftforge.gradle' version '${pluginVersion}'\n}\n\nversion = project.mod_version\ngroup = project.maven_group\nbase.archivesName = project.archives_base_name\n\njava.toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})\n\nminecraft {\n    mappings channel: 'official', version: project.minecraft_version\n    runs {\n        client { workingDirectory project.file('run') }\n        server {\n            workingDirectory project.file('run-server')\n            args '--nogui'\n        }${gameTest}\n    }\n}\n\nrepositories { mavenCentral() }\n\ndependencies {\n    minecraft "net.minecraftforge:forge:\${project.loader_version}"\n}\n\nprocessResources {\n    inputs.property 'version', project.version\n    filesMatching('META-INF/mods.toml') { expand version: project.version }\n}\n`
}

function modToml(project: ProjectInfo, loader: 'forge' | 'neoforge'): string {
  const dependencyId = loader === 'forge' ? 'forge' : 'neoforge'
  return `modLoader="javafml"\nloaderVersion="[1,)"\nlicense="MIT"\n\n[[mods]]\nmodId="${project.namespace}"\nversion="\${version}"\ndisplayName="${project.name.replaceAll('"', '\\"')}"\ndescription='''Created with ModMind'''\n\n[[dependencies.${project.namespace}]]\nmodId="${dependencyId}"\nmandatory=true\nversionRange="[1,)"\nordering="NONE"\nside="BOTH"\n\n[[dependencies.${project.namespace}]]\nmodId="minecraft"\nmandatory=true\nversionRange="[${project.minecraftVersion}]"\nordering="NONE"\nside="BOTH"\n`
}

function forgeFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const javaVersion = project.javaVersion ?? javaVersionForMinecraft(project.minecraftVersion)
  const packageInfo = slugPackage(project)
  const legacy = compareMinecraft(project.minecraftVersion, '1.13') < 0
  const descriptor = legacy
    ? JSON.stringify([{ modid: project.namespace, name: project.name, description: 'Created with ModMind', version: '${version}', mcversion: project.minecraftVersion }], null, 2)
    : modToml(project, 'forge')
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement { repositories { gradlePluginPortal(); maven { url = 'https://maven.minecraftforge.net/' } } }\nrootProject.name = '${project.namespace}'\n`,
    'gradle.properties': `${commonProperties(project, javaVersion).join('\n')}\n`,
    'build.gradle': forgeGradleBuild(project, javaVersion),
    [descriptorPath('forge', project.minecraftVersion)]: descriptor
  }
  if (includeStarter) {
    const modImport = compareMinecraft(project.minecraftVersion, '1.8') < 0 ? 'cpw.mods.fml.common.Mod' : 'net.minecraftforge.fml.common.Mod'
    const annotation = legacy ? `@Mod(modid = ModMindEntry.MOD_ID, name = "${project.name}", version = "0.1.0")` : '@Mod(ModMindEntry.MOD_ID)'
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};\n\nimport ${modImport};\n\n${annotation}\npublic final class ModMindEntry {\n    public static final String MOD_ID = "${project.namespace}";\n\n    public ModMindEntry() {\n        System.out.println("[ModMind] ${project.name} initialized");\n    }\n}\n`
  }
  return files
}

function neoForgeFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const javaVersion = project.javaVersion ?? javaVersionForMinecraft(project.minecraftVersion)
  const packageInfo = slugPackage(project)
  const modern = compareMinecraft(project.minecraftVersion, '1.20.5') >= 0
  const transition = project.minecraftVersion === '1.20.1'
  const build = modern
    ? `plugins {\n    id 'java-library'\n    id 'net.neoforged.moddev' version '2.0.+'\n}\n\nversion = project.mod_version\ngroup = project.maven_group\nbase.archivesName = project.archives_base_name\njava.toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})\n\nneoForge {\n    version = project.loader_version\n    runs {\n        client { client() }\n        server {\n            server()\n            programArgument '--nogui'\n        }\n        gameTestServer {\n            type = 'gameTestServer'\n            systemProperty 'neoforge.enabledGameTestNamespaces', '${project.namespace}'\n        }\n    }\n    mods { "${project.namespace}" { sourceSet(sourceSets.main) } }\n}\n\nprocessResources {\n    inputs.property 'version', project.version\n    filesMatching('META-INF/neoforge.mods.toml') { expand version: project.version }\n}\n`
    : `plugins {\n    id 'java'\n    id 'net.neoforged.gradle.userdev' version '7.0.+'\n}\n\nversion = project.mod_version\ngroup = project.maven_group\nbase.archivesName = project.archives_base_name\njava.toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})\n\nrepositories { mavenCentral() }\n\ndependencies {\n    implementation "net.neoforged:${transition ? 'forge' : 'neoforge'}:\${project.loader_version}"\n}\n\nprocessResources {\n    inputs.property 'version', project.version\n    filesMatching('META-INF/mods.toml') { expand version: project.version }\n}\n`
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement { repositories { gradlePluginPortal(); maven { url = 'https://maven.neoforged.net/releases' } } }\nrootProject.name = '${project.namespace}'\n`,
    'gradle.properties': `${commonProperties(project, javaVersion).join('\n')}\n`,
    'build.gradle': build,
    [descriptorPath('neoforge', project.minecraftVersion)]: modToml(project, 'neoforge')
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};\n\nimport net.neoforged.fml.common.Mod;\n\n@Mod(ModMindEntry.MOD_ID)\npublic final class ModMindEntry {\n    public static final String MOD_ID = "${project.namespace}";\n\n    public ModMindEntry() {\n        System.out.println("[ModMind] ${project.name} initialized");\n    }\n}\n`
  }
  return files
}

export function projectTemplateFiles(project: ProjectInfo, includeStarter = true): Record<string, string> {
  const files = project.loader === 'fabric'
    ? fabricFiles(project, includeStarter)
    : project.loader === 'quilt' ? quiltFiles(project, includeStarter)
    : project.loader === 'forge' ? forgeFiles(project, includeStarter) : neoForgeFiles(project, includeStarter)
  return {
    'modmind.project.json': JSON.stringify(project, null, 2),
    ...files,
    'README.md': `# ${project.name}\n\nMinecraft ${project.minecraftVersion} / ${project.loader}\n\nThis project was created with ModMind.\n`,
    ...(includeStarter ? { 'docs/idea.md': '# Mod idea\n\nDescribe the feature in ModMind to keep the generated specification here.\n' } : {})
  }
}
