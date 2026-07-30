import type { LoaderKind, ProjectInfo } from '../shared/types'
import {
  assertProjectCreationSupported,
  compareMinecraftVersions,
  gradleWrapperProperties,
  loaderBuildCompatibility,
  officialTemplateSources
} from './loaderCompatibility'
import { CURRENT_PROJECT_VERSION } from './projectVersion'

function slugPackage(project: ProjectInfo): { name: string; path: string } {
  const name = `dev.modmind.${project.namespace}`
  return { name, path: name.replaceAll('.', '/') }
}

function javaString(value: string): string {
  return JSON.stringify(value)
}

function propertyValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('=', '\\=')
    .replaceAll(':', '\\:')
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function commonProperties(project: ProjectInfo, javaVersion: number): string[] {
  return [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.parallel=true',
    'org.gradle.caching=true',
    `minecraft_version=${propertyValue(project.minecraftVersion)}`,
    `loader_version=${propertyValue(project.loaderVersion ?? '')}`,
    `java_version=${javaVersion}`,
    'mod_version=0.1.0',
    `mod_id=${propertyValue(project.namespace)}`,
    `mod_name=${propertyValue(project.name)}`,
    'mod_license=MIT',
    `maven_group=dev.modmind.${project.namespace}`,
    `archives_base_name=${project.namespace}`
  ]
}

function javaConfiguration(javaVersion: number): string {
  return `tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
    options.release = ${javaVersion}
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(${javaVersion})
    withSourcesJar()
}
`
}

export function descriptorPath(loader: LoaderKind, minecraftVersion: string): string {
  if (loader === 'fabric') return 'src/main/resources/fabric.mod.json'
  if (loader === 'quilt') return 'src/main/resources/quilt.mod.json'
  if (loader === 'forge' && compareMinecraftVersions(minecraftVersion, '1.13') < 0) return 'src/main/resources/mcmod.info'
  if (loader === 'neoforge' && compareMinecraftVersions(minecraftVersion, '1.20.5') >= 0) {
    return 'src/main/resources/META-INF/neoforge.mods.toml'
  }
  return 'src/main/resources/META-INF/mods.toml'
}

function fabricFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const compatibility = loaderBuildCompatibility('fabric', project.minecraftVersion)
  const javaVersion = project.javaVersion ?? compatibility.javaVersion
  const packageInfo = slugPackage(project)
  const apiVersion = project.apiVersion?.trim()
  const properties = [
    ...commonProperties(project, javaVersion),
    ...(apiVersion ? [`fabric_api_version=${propertyValue(apiVersion)}`] : [])
  ]
  const descriptor: Record<string, unknown> = {
    schemaVersion: 1,
    id: project.namespace,
    version: '${version}',
    name: project.name,
    description: 'Created with ModMind',
    environment: '*',
    ...(includeStarter ? { entrypoints: { main: [`${packageInfo.name}.ModMindEntry`] } } : {}),
    depends: {
      fabricloader: `>=${project.loaderVersion}`,
      ...(apiVersion ? { 'fabric-api': '*' } : {}),
      minecraft: project.minecraftVersion,
      java: `>=${javaVersion}`
    }
  }
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {
    repositories {
        maven { url = 'https://maven.fabricmc.net/' }
        gradlePluginPortal()
    }
}

rootProject.name = '${project.namespace}'
`,
    'gradle.properties': `${properties.join('\n')}\n`,
    'build.gradle': `plugins {
    id 'net.fabricmc.fabric-loom-remap' version '${compatibility.pluginVersion}'
    id 'maven-publish'
}

version = project.mod_version
group = project.maven_group

base {
    archivesName = project.archives_base_name
}

repositories {
    mavenCentral()
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings loom.officialMojangMappings()
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
${apiVersion ? '    modImplementation "net.fabricmc.fabric-api:fabric-api:${project.fabric_api_version}"\n' : ''}
}

${javaConfiguration(javaVersion)}
processResources {
    filteringCharset = 'UTF-8'
    inputs.property 'version', project.version
    filesMatching('fabric.mod.json') { expand version: project.version }
}
`,
    [descriptorPath('fabric', project.minecraftVersion)]: JSON.stringify(descriptor, null, 2)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};

import net.fabricmc.api.ModInitializer;

public final class ModMindEntry implements ModInitializer {
    public static final String MOD_ID = ${javaString(project.namespace)};

    @Override
    public void onInitialize() {
        System.out.println("[ModMind] " + ${javaString(project.name)} + " initialized");
    }
}
`
  }
  return files
}

function quiltFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const compatibility = loaderBuildCompatibility('quilt', project.minecraftVersion)
  const javaVersion = project.javaVersion ?? compatibility.javaVersion
  const packageInfo = slugPackage(project)
  const properties = [
    ...commonProperties(project, javaVersion),
    `qfapi_version=${propertyValue(project.apiVersion ?? '')}`,
    `qsl_version=${propertyValue(project.qslVersion ?? '')}`
  ]
  const quiltLoader: Record<string, unknown> = {
    group: `dev.modmind.${project.namespace}`,
    id: project.namespace,
    version: '${version}',
    metadata: { name: project.name, description: 'Created with ModMind', license: 'MIT' },
    intermediate_mappings: 'net.fabricmc:intermediary',
    ...(includeStarter ? { entrypoints: { init: [`${packageInfo.name}.ModMindEntry`] } } : {}),
    depends: [
      { id: 'quilt_loader', versions: `>=${project.loaderVersion}` },
      { id: 'minecraft', versions: project.minecraftVersion },
      { id: 'java', versions: `>=${javaVersion}` },
      { id: 'quilted_fabric_api', versions: '*' }
    ]
  }
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {
    repositories {
        maven { url = 'https://maven.quiltmc.org/repository/release/' }
        maven { url = 'https://maven.fabricmc.net/' }
        gradlePluginPortal()
    }
}

rootProject.name = '${project.namespace}'
`,
    'gradle.properties': `${properties.join('\n')}\n`,
    'build.gradle': `plugins {
    id 'org.quiltmc.loom' version '${compatibility.pluginVersion}'
    id 'maven-publish'
}

version = project.mod_version
group = project.maven_group

base {
    archivesName = project.archives_base_name
}

repositories {
    maven { url = 'https://maven.quiltmc.org/repository/release/' }
    mavenCentral()
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings loom.officialMojangMappings()
    modImplementation "org.quiltmc:quilt-loader:\${project.loader_version}"
    modImplementation "org.quiltmc.quilted-fabric-api:quilted-fabric-api:\${project.qfapi_version}"
    modImplementation "org.quiltmc:qsl:\${project.qsl_version}"
}

${javaConfiguration(javaVersion)}
processResources {
    filteringCharset = 'UTF-8'
    inputs.property 'version', project.version
    filesMatching('quilt.mod.json') { expand version: project.version }
}
`,
    [descriptorPath('quilt', project.minecraftVersion)]: JSON.stringify({ schema_version: 1, quilt_loader: quiltLoader }, null, 2)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};

import org.quiltmc.loader.api.ModContainer;
import org.quiltmc.qsl.base.api.entrypoint.ModInitializer;

public final class ModMindEntry implements ModInitializer {
    public static final String MOD_ID = ${javaString(project.namespace)};

    @Override
    public void onInitialize(ModContainer mod) {
        System.out.println("[ModMind] " + ${javaString(project.name)} + " initialized");
    }
}
`
  }
  return files
}

function loaderMajor(loaderVersion: string | undefined): string {
  const segment = (loaderVersion ?? '').split('-').at(-1) ?? ''
  return segment.match(/^\d+/)?.[0] ?? '1'
}

function forgeModToml(project: ProjectInfo): string {
  const major = loaderMajor(project.loaderVersion)
  return `modLoader="javafml"
loaderVersion="[${major},)"
license="MIT"

[[mods]]
modId="${project.namespace}"
version="\${version}"
displayName=${tomlString(project.name)}
description='''Created with ModMind'''

[[dependencies.${project.namespace}]]
modId="forge"
mandatory=true
versionRange="[${major},)"
ordering="NONE"
side="BOTH"

[[dependencies.${project.namespace}]]
modId="minecraft"
mandatory=true
versionRange="[${project.minecraftVersion}]"
ordering="NONE"
side="BOTH"
`
}

function forgeFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const compatibility = loaderBuildCompatibility('forge', project.minecraftVersion)
  const javaVersion = project.javaVersion ?? compatibility.javaVersion
  const packageInfo = slugPackage(project)
  const forgeGradle7 = compatibility.pluginVersion.startsWith('7.')
  const runs = forgeGradle7
    ? `        configureEach {
            workingDir = layout.projectDirectory.dir('run')
            systemProperty 'forge.enabledGameTestNamespaces', '${project.namespace}'
        }
        register('client')
        register('server') { args '--nogui' }
        register('gameTestServer')`
    : `        client { workingDirectory project.file('run') }
        server {
            workingDirectory project.file('run-server')
            args '--nogui'
        }
        gameTestServer {
            workingDirectory project.file('run-gametest')
            property 'forge.enabledGameTestNamespaces', '${project.namespace}'
        }`
  const repositories = forgeGradle7
    ? `repositories {
    minecraft.mavenizer(it)
    maven fg.forgeMaven
    maven fg.minecraftLibsMaven
    mavenCentral()
}`
    : 'repositories { mavenCentral() }'
  const dependency = forgeGradle7
    ? `    implementation minecraft.dependency("net.minecraftforge:forge:\${project.loader_version}")`
    : `    minecraft "net.minecraftforge:forge:\${project.loader_version}"`
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {
    repositories {
        gradlePluginPortal()
        maven { url = 'https://maven.minecraftforge.net/' }
    }
}

rootProject.name = '${project.namespace}'
`,
    'gradle.properties': `${commonProperties(project, javaVersion).join('\n')}\n`,
    'build.gradle': `plugins {
    id 'java'
    id 'net.minecraftforge.gradle' version '${compatibility.pluginVersion}'
}

version = project.mod_version
group = project.maven_group

base {
    archivesName = project.archives_base_name
}

${javaConfiguration(javaVersion)}
minecraft {
    mappings channel: 'official', version: project.minecraft_version
    runs {
${runs}
    }
}

${repositories}

dependencies {
${dependency}
}

processResources {
    filteringCharset = 'UTF-8'
    inputs.property 'version', project.version
    filesMatching('META-INF/mods.toml') { expand version: project.version }
}
`,
    [descriptorPath('forge', project.minecraftVersion)]: forgeModToml(project)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};

import net.minecraftforge.fml.common.Mod;

@Mod(ModMindEntry.MOD_ID)
public final class ModMindEntry {
    public static final String MOD_ID = ${javaString(project.namespace)};

    public ModMindEntry() {
        System.out.println("[ModMind] " + ${javaString(project.name)} + " initialized");
    }
}
`
  }
  return files
}

function neoForgeModToml(project: ProjectInfo): string {
  const modern = compareMinecraftVersions(project.minecraftVersion, '1.20.5') >= 0
  const header = modern ? 'license="MIT"' : 'modLoader="javafml"\nloaderVersion="[1,)"\nlicense="MIT"'
  const required = modern ? 'type="required"' : 'mandatory=true'
  return `${header}

[[mods]]
modId="${project.namespace}"
version="\${version}"
displayName=${tomlString(project.name)}
description='''Created with ModMind'''

[[dependencies.${project.namespace}]]
modId="neoforge"
${required}
versionRange="[${project.loaderVersion},)"
ordering="NONE"
side="BOTH"

[[dependencies.${project.namespace}]]
modId="minecraft"
${required}
versionRange="[${project.minecraftVersion}]"
ordering="NONE"
side="BOTH"
`
}

function neoForgeFiles(project: ProjectInfo, includeStarter: boolean): Record<string, string> {
  const compatibility = loaderBuildCompatibility('neoforge', project.minecraftVersion)
  const javaVersion = project.javaVersion ?? compatibility.javaVersion
  const packageInfo = slugPackage(project)
  const descriptor = descriptorPath('neoforge', project.minecraftVersion)
  const files: Record<string, string> = {
    'settings.gradle': `pluginManagement {
    repositories {
        gradlePluginPortal()
        maven { url = 'https://maven.neoforged.net/releases' }
    }
}

rootProject.name = '${project.namespace}'
`,
    'gradle.properties': `${commonProperties(project, javaVersion).join('\n')}\nneo_version=${propertyValue(project.loaderVersion ?? '')}\n`,
    'build.gradle': `plugins {
    id 'java-library'
    id 'maven-publish'
    id 'net.neoforged.moddev' version '${compatibility.pluginVersion}'
}

version = project.mod_version
group = project.maven_group

base {
    archivesName = project.archives_base_name
}

${javaConfiguration(javaVersion)}
neoForge {
    version = project.neo_version
    runs {
        client { client() }
        server {
            server()
            programArgument '--nogui'
        }
        gameTestServer {
            type = 'gameTestServer'
            systemProperty 'neoforge.enabledGameTestNamespaces', '${project.namespace}'
        }
    }
    mods {
        "${project.namespace}" { sourceSet(sourceSets.main) }
    }
}

processResources {
    filteringCharset = 'UTF-8'
    inputs.property 'version', project.version
    filesMatching('${descriptor.replace('src/main/resources/', '')}') { expand version: project.version }
}
`,
    [descriptor]: neoForgeModToml(project)
  }
  if (includeStarter) {
    files[`src/main/java/${packageInfo.path}/ModMindEntry.java`] = `package ${packageInfo.name};

import net.neoforged.fml.common.Mod;

@Mod(ModMindEntry.MOD_ID)
public final class ModMindEntry {
    public static final String MOD_ID = ${javaString(project.namespace)};

    public ModMindEntry() {
        System.out.println("[ModMind] " + ${javaString(project.name)} + " initialized");
    }
}
`
  }
  return files
}

function mitLicense(project: ProjectInfo): string {
  return `MIT License

Copyright (c) ${new Date(project.createdAt || Date.now()).getUTCFullYear()} ${project.name}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
}

export function projectTemplateFiles(project: ProjectInfo, includeStarter = true): Record<string, string> {
  assertProjectCreationSupported(project.loader, project.minecraftVersion)
  const compatibility = loaderBuildCompatibility(project.loader, project.minecraftVersion)
  const files = project.loader === 'fabric'
    ? fabricFiles(project, includeStarter)
    : project.loader === 'quilt' ? quiltFiles(project, includeStarter)
      : project.loader === 'forge' ? forgeFiles(project, includeStarter) : neoForgeFiles(project, includeStarter)
  return {
    'modmind.project.json': JSON.stringify({ ...project, projectVersion: CURRENT_PROJECT_VERSION }, null, 2),
    'modmind.template.json': JSON.stringify({
      source: officialTemplateSources[project.loader],
      loader: project.loader,
      minecraftVersion: project.minecraftVersion,
      pluginVersion: compatibility.pluginVersion,
      gradleVersion: compatibility.gradleVersion,
      projectVersion: CURRENT_PROJECT_VERSION,
      generatedAt: project.createdAt
    }, null, 2),
    ...files,
    'gradle/wrapper/gradle-wrapper.properties': gradleWrapperProperties(project),
    '.gitignore': '.gradle/\nbuild/\nrun/\nrun-*/\nlogs/\n.modmind/\n.modtool/\n',
    '.gitattributes': 'gradlew text eol=lf\n*.bat text eol=crlf\n*.jar binary\n',
    'LICENSE': mitLicense(project),
    'README.md': `# ${project.name}\n\nMinecraft ${project.minecraftVersion} / ${project.loader}\n\nBuild with \`./gradlew build\` (Windows: \`.\\gradlew.bat build\`).\n\nThis project was created with ModMind from the official ${project.loader} template structure.\n`,
    ...(includeStarter ? { 'docs/idea.md': '# Mod idea\n\nDescribe the feature in ModMind to keep the generated specification here.\n' } : {})
  }
}
