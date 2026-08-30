import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const releaseRoot = path.join(root, 'release')
const updateRoot = path.join(releaseRoot, 'update')
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const prerelease = version.includes('-')
const metadataName = prerelease ? 'beta.yml' : 'latest.yml'
const sourceMetadataPath = path.join(releaseRoot, 'latest.yml')
const metadataText = await fs.readFile(sourceMetadataPath, 'utf8')
const metadata = parse(metadataText)

if (!metadata || typeof metadata !== 'object' || metadata.version !== version) {
  throw new Error(`Update metadata version does not match package version ${version}`)
}
const files = Array.isArray(metadata.files) ? metadata.files : []
const installer = files.find((file) => file && typeof file === 'object' && typeof file.url === 'string' && file.url.toLowerCase().endsWith('.exe'))
if (!installer || typeof installer.url !== 'string' || typeof installer.sha512 !== 'string' || typeof installer.size !== 'number') {
  throw new Error('Update metadata does not contain a complete Windows installer entry')
}
if (path.basename(installer.url) !== installer.url || metadata.path !== installer.url) {
  throw new Error(`Unsafe or inconsistent update artifact name: ${installer.url}`)
}

const sourceInstaller = path.join(releaseRoot, `ModMind Setup ${version}.exe`)
const sourceBlockmap = `${sourceInstaller}.blockmap`
const installerStat = await fs.stat(sourceInstaller)
const blockmapStat = await fs.stat(sourceBlockmap)
if (!installerStat.isFile() || installerStat.size !== installer.size) {
  throw new Error(`Installer size does not match latest.yml: ${installerStat.size} != ${installer.size}`)
}
if (!blockmapStat.isFile() || blockmapStat.size < 1024) throw new Error('Installer blockmap is missing or too small')

const hash = createHash('sha512')
for await (const chunk of createReadStream(sourceInstaller)) hash.update(chunk)
if (hash.digest('base64') !== installer.sha512) throw new Error('Installer SHA-512 does not match latest.yml')

await fs.rm(updateRoot, { recursive: true, force: true })
await fs.mkdir(updateRoot, { recursive: true })

async function linkOrCopy(source, destination) {
  try {
    await fs.link(source, destination)
  } catch {
    await fs.copyFile(source, destination)
  }
}

await linkOrCopy(sourceInstaller, path.join(updateRoot, installer.url))
await linkOrCopy(sourceBlockmap, path.join(updateRoot, `${installer.url}.blockmap`))
await fs.writeFile(path.join(updateRoot, metadataName), metadataText, 'utf8')

const uploadFiles = [metadataName, installer.url, `${installer.url}.blockmap`]
process.stdout.write(`${JSON.stringify({ version, channel: prerelease ? 'beta' : 'stable', uploadDirectory: updateRoot, uploadFiles }, null, 2)}\n`)
