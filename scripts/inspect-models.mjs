import { _electron as electron } from 'playwright'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const app = await electron.launch({ args: ['.'], cwd: root })
try {
  const window = await app.firstWindow()
  await window.getByRole('button', { name: '设置' }).click()
  await window.waitForTimeout(500)
  await window.getByRole('button', { name: '扫描模型' }).click()
  await window.waitForTimeout(5_000)
  const models = await window.locator('.model-options label').evaluateAll((labels) => labels.map((label) => ({
    text: label.textContent?.trim(),
    checked: label.querySelector('input')?.checked
  })))
  process.stdout.write(JSON.stringify(models, null, 2))
} finally {
  await app.close()
}
