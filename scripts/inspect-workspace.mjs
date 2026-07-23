import { _electron as electron } from 'playwright'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const app = await electron.launch({ args: ['.'], cwd: root })
try {
  const window = await app.firstWindow()
  await window.getByText('Weapon Reforge Mod', { exact: true }).click()
  await window.waitForTimeout(800)
  const controls = await window.locator('input, textarea, button, select').evaluateAll((elements) => elements.map((element) => ({
    tag: element.tagName,
    text: element.textContent?.trim(),
    placeholder: element.getAttribute('placeholder'),
    title: element.getAttribute('title'),
    type: element.getAttribute('type'),
    value: 'value' in element ? element.value : undefined,
    disabled: 'disabled' in element ? element.disabled : undefined
  })))
  process.stdout.write(`${await window.locator('body').innerText()}\n\nCONTROLS\n${JSON.stringify(controls, null, 2)}`)
} finally {
  await app.close()
}
