import { _electron as electron } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const artifacts = path.join(root, 'artifacts')
await mkdir(artifacts, { recursive: true })

const app = await electron.launch({ args: ['.'], cwd: root })
try {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(1_000)
  await window.screenshot({ path: path.join(artifacts, 'modmind-latest.png'), fullPage: true })
  const text = await window.locator('body').innerText()
  process.stdout.write(text.slice(0, 12_000))
} finally {
  await app.close()
}
