import { _electron as electron } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const artifacts = path.join(root, 'artifacts')
await mkdir(artifacts, { recursive: true })

const prompts = [
  `接管并彻底完成当前失败的“大师秘境 VII：虚无镜像”实现。docs/idea.md 中保留了灵感台的完整原始规格，docs/last-ai-response.txt 记录了上一轮失败过程；当前磁盘内容是未完成的半成品，绝对不要因为曾经编译成功就假设功能完成。

先审计原始规格、当前源码、注册入口、客户端入口、资源、网络、配方和运行日志，再制定分阶段计划并修复。必须保留项目现有的其他玩法，优先使用精确修改，避免无关的整文件覆盖。

最终至少满足这些可观察要求：大师焰火可以升级并进入 VII；第七级实际注册 Hollow Mirror 的工厂、属性、参与玩家、标题、限时和结算；客户端注册所有会出现的实体渲染器和网络接收器；不存在缺失纹理、模型、渲染器或实体属性；HollowMirrorEntity 的生命周期不会因为覆盖 tick 而跳过实体基础更新，同时完整保留父类防御条、HUD、死亡结算和秘境伤害机制；行为观察能真实识别跳跃疾跑、拉弓、连续右键和静止，不能存在永远为零的占位字段；地裂波、护盾、沉默飞弹、残影、分身、词条窃取和记忆洪流都按规格有实际服务端行为与正确同步；客户端缓存更新必须在正确线程；分身轨迹、皮肤和必要状态必须同步；所有美术引用都有实际资源，不能用不存在的文件名蒙混；现有启动日志中的项目级错误和缺失资源一并处理。

完成代码后必须构建、启动 Minecraft 做运行验收、扫描错误日志，并逐条给出 docs/idea.md 自检标准的证据。任何一条没有证据都不能结束。`,
  `对刚完成的“大师秘境 VII：虚无镜像”做第二轮独立对抗审计并直接修复所有发现。不要相信上一轮总结，也不要只看是否编译；以当前磁盘、docs/idea.md 的原始规格和真实运行日志为准。

重点尝试证伪：VII 是否真的可从配方进入并生成正确 Boss；服务端与客户端注册是否完整且只注册一次；每种技能是否可达而非死代码；实体 tick、死亡、保存、追踪、断线重连和多人同步是否安全；网络回调线程是否正确；所有渲染器、皮肤、粒子、声音和纹理是否存在；随机选人是否只影响秘境参与者；运行时是否还有 has no attributes、missing、No renderer、异常或项目级 ERROR；任何“简化实现”是否违背验收标准。

发现问题就直接修改。最后重新构建、运行 Minecraft、检查日志并执行独立验收；只有所有原始验收项都有具体证据时才能完成。`
]

const app = await electron.launch({ args: ['.'], cwd: root })
process.stdout.write('[PRODUCT] Electron 已启动\n')
const window = await app.firstWindow()
process.stdout.write('[PRODUCT] 已连接主窗口\n')
await window.waitForLoadState('domcontentloaded')
process.stdout.write('[PRODUCT] 工作台页面已加载\n')
await window.getByText('Weapon Reforge Mod', { exact: true }).click()
process.stdout.write('[PRODUCT] 已打开 Weapon Reforge Mod\n')
await window.waitForTimeout(1_500)

async function approveBuildWhenRequested() {
  const button = window.getByRole('button', { name: '信任并构建' })
  if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
    process.stdout.write('\n[PRODUCT] 已确认当前版本的 Gradle 构建脚本\n')
    await button.click()
  }
}

async function resumeWhenRequested() {
  const button = window.getByRole('button', { name: '继续 AI 任务' })
  if (await button.isVisible().catch(() => false)) {
    process.stdout.write('\n[PRODUCT] 从产品保存的中断点继续任务\n')
    await button.click()
    return true
  }
  return false
}

async function waitForProductCompletion(label) {
  const startedAt = Date.now()
  let lastTimeline = ''
  let recoveryAttempts = 0
  while (Date.now() - startedAt < 60 * 60 * 1000) {
    await approveBuildWhenRequested()
    if (await resumeWhenRequested()) recoveryAttempts += 1
    if (recoveryAttempts > 4) throw new Error(`${label} exceeded four recovery attempts`)

    const timelineItems = window.locator('.ai-timeline-item')
    const count = await timelineItems.count()
    if (count) {
      const current = (await timelineItems.nth(count - 1).innerText()).trim()
      if (current && current !== lastTimeline) {
        lastTimeline = current
        process.stdout.write(`\n[PRODUCT] ${current.slice(0, 1_500)}\n`)
      }
    }

    const status = (await window.locator('.ai-output-status').innerText().catch(() => '')).trim()
    const startButton = window.getByTitle('开始 AI 编程')
    if (status === '已应用' && await startButton.isVisible().catch(() => false)) return
    if (status === '需要检查' && !(await window.getByRole('button', { name: '继续 AI 任务' }).isVisible().catch(() => false))) {
      await window.waitForTimeout(2_000)
      if ((await window.locator('.ai-output-status').innerText().catch(() => '')).trim() === '需要检查') {
        throw new Error(`${label} failed without a resumable checkpoint`)
      }
    }
    await window.waitForTimeout(1_000)
  }
  throw new Error(`${label} timed out after one hour`)
}

try {
  process.stdout.write('[PRODUCT] 正在检查是否存在可续跑任务\n')
  let promptStartIndex = 0
  if (await window.getByRole('button', { name: '继续 AI 任务' }).isVisible().catch(() => false)) {
    await resumeWhenRequested()
    await waitForProductCompletion('恢复任务')
    promptStartIndex = 1
  }

  for (let index = promptStartIndex; index < prompts.length; index += 1) {
    process.stdout.write(`\n[PRODUCT] 开始自然语言任务 ${index + 1}/${prompts.length}\n`)
    const textarea = window.locator('textarea').first()
    await textarea.fill(prompts[index])
    process.stdout.write(`[PRODUCT] 已填写自然语言任务 ${index + 1}\n`)
    await window.getByTitle('开始 AI 编程').click()
    process.stdout.write(`[PRODUCT] 已点击开始自然语言任务 ${index + 1}\n`)
    await window.locator('.ai-output-status').filter({ hasText: '生成中' }).waitFor({ timeout: 30_000 })
    await waitForProductCompletion(`任务 ${index + 1}`)
    await window.screenshot({ path: path.join(artifacts, `weapon-product-task-${index + 1}.png`), fullPage: true })
    process.stdout.write(`\n[PRODUCT] 自然语言任务 ${index + 1} 已通过产品完成\n`)
  }

  const finalText = await window.locator('body').innerText()
  await writeFile(path.join(artifacts, 'weapon-product-final.txt'), finalText, 'utf8')
  process.stdout.write('\n[PRODUCT] 两轮开发与独立审计全部完成\n')
} catch (error) {
  await window.screenshot({ path: path.join(artifacts, 'weapon-product-failure.png'), fullPage: true }).catch(() => undefined)
  throw error
} finally {
  await app.close()
}
