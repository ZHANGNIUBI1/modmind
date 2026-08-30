import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const intentMode = process.argv.includes('--intent')
const applyMode = process.argv.includes('--apply')
const previewMode = process.argv.includes('--preview')
const uiMode = process.argv.includes('--ui')
const advancedCoreMode = process.argv.includes('--advanced-core')
const requestedFormats = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const formats = requestedFormats.length
  ? requestedFormats
  : ['java_block', 'bedrock', 'modded_entity']

const ravenIntent = {
  version: 1,
  metadata: {name: 'Ember Raven', quality: 'hero', domain: 'organism'},
  model: {
    format: 'modded_entity', textureWidth: 64, textureHeight: 64, symmetry: 'bilateral',
    parts: [
      {id: 'body', kind: 'body', size: [8, 10, 6], offset: [0, 8, 0]},
      {id: 'head', kind: 'head', parent: 'body', size: [6, 6, 6], offset: [0, 17, -1]},
      {id: 'wing', kind: 'wing', parent: 'body', side: 'left', size: [2, 7, 8], offset: [6, 9, 0]},
      {id: 'tail', kind: 'tail', parent: 'body', size: [4, 4, 8], offset: [0, 6, 7]}
    ]
  },
  appearance: {palette: 'ember', texture: 'mottle', seed: 'raven-1'},
  animation: {
    name: 'idle', length: 1, loop: 'loop',
    tracks: [{part: 'wing', channel: 'rotation', keyframes: [
      {time: 0, value: [0, 0, 0]},
      {time: 0.5, value: [8, 0, 0], interpolation: 'catmullrom'},
      {time: 1, value: [0, 0, 0]}
    ]}]
  }
}

function log(label, message, data) {
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`
  process.stdout.write(`[blockbench-probe:${label}] ${message}${suffix}\n`)
}

function withTimeout(promise, label, timeoutMs) {
  let timeout
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout))
}

function killProcessTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {stdio: 'ignore'})
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // The process may already have exited through ElectronApplication.close().
  }
}

async function closeApplication(app, pid) {
  if (app) {
    await withTimeout(app.close(), 'Electron close', 3_000).catch(() => undefined)
  }
  killProcessTree(pid)
}

async function waitForBlockbench(page, label) {
  const deadline = Date.now() + 45_000
  let lastState
  while (Date.now() < deadline) {
    lastState = await page.evaluate(() => window.modmind.blockbench.getState()).catch(() => null)
    if (lastState?.status === 'ready' || lastState?.phase === 'ready') return lastState
    if (lastState?.status === 'error' || lastState?.phase === 'error') {
      throw new Error(`Blockbench failed to load: ${lastState.message ?? 'unknown error'}`)
    }
    await page.waitForTimeout(250)
  }
  throw new Error(`Blockbench did not become ready: ${JSON.stringify(lastState)}`)
}

async function inspectCaptures(captures) {
  return Promise.all(captures.map(async (capture) => {
    const png = Buffer.from(capture.dataUrl.slice(capture.dataUrl.indexOf(',') + 1), 'base64')
    const stats = await sharp(png).stats()
    const deviation = Math.max(...stats.channels.map((channel) => channel.stdev))
    if (deviation < 1) throw new Error(`Captured ${capture.view} view is blank`)
    return {view: capture.view, bytes: png.length, deviation: Number(deviation.toFixed(2))}
  }))
}

async function probeFormat(format) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), `modmind-bb-${format}-`))
  let app
  let pid
  try {
    log(format, 'launching')
    app = await withTimeout(electron.launch({args: ['.', `--user-data-dir=${userDataDir}`], cwd: root}), 'Electron launch', 20_000)
    pid = app.process().pid
    const page = await withTimeout(app.firstWindow(), 'main window', 20_000)
    await withTimeout(page.waitForLoadState('domcontentloaded'), 'main renderer', 20_000)
    const bridge = await waitForBlockbench(page, format)
    log(format, 'bridge ready', bridge)

    const result = await withTimeout(page.evaluate((action) => window.modmind.blockbench.execute(action), {
      type: 'new-model',
      format,
      name: `probe_${format}`,
      textureWidth: 32,
      textureHeight: 32
    }), `${format} new-model`, 10_000)
    log(format, 'new-model complete', result)

    const state = await withTimeout(page.evaluate(() => window.modmind.blockbench.projectState()), `${format} project-state`, 10_000)
    log(format, 'project-state complete', {format: state.format, project: state.project, counts: state.counts})
    return {format, success: true, state}
  } catch (error) {
    log(format, 'failed', {message: error instanceof Error ? error.message : String(error)})
    return {format, success: false, error: error instanceof Error ? error.message : String(error)}
  } finally {
    await closeApplication(app, pid)
    await rm(userDataDir, {recursive: true, force: true}).catch(() => undefined)
  }
}

async function probeIntent() {
  const label = 'intent'
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-intent-'))
  let app
  let pid
  try {
    log(label, 'launching')
    app = await withTimeout(electron.launch({args: ['.', `--user-data-dir=${userDataDir}`], cwd: root}), 'Electron launch', 20_000)
    pid = app.process().pid
    const page = await withTimeout(app.firstWindow(), 'main window', 20_000)
    await withTimeout(page.waitForLoadState('domcontentloaded'), 'main renderer', 20_000)
    log(label, 'bridge ready', await waitForBlockbench(page, label))

    const candidate = await withTimeout(
      page.evaluate((intent) => window.modmind.assetIntent.compile(intent), ravenIntent),
      'intent compile',
      10_000
    )
    log(label, 'compiled', {actions: candidate.actions.length, diagnostics: candidate.diagnostics})
    if (previewMode) {
      const preview = await withTimeout(
        page.evaluate((intent) => window.modmind.assetIntent.preview(intent, {
          views: ['isometric_right', 'north', 'west'], width: 320, height: 320
        }), ravenIntent),
        'intent preview',
        30_000
      )
      const captureStats = await inspectCaptures(preview.captures)
      log(label, 'preview complete', {
        revisionBefore: preview.execution?.revisionBefore,
        previewRevision: preview.revision,
        valid: preview.validation?.valid,
        captures: captureStats
      })
      const projectWasDiscarded = await page.evaluate(async () => {
        try {
          await window.modmind.blockbench.projectState()
          return false
        } catch {
          return true
        }
      })
      if (!projectWasDiscarded) throw new Error('Preview left its temporary Blockbench project open')
      log(label, 'temporary project discarded')
      return {format: label, success: true}
    } else if (applyMode) {
      const applied = await withTimeout(
        page.evaluate((intent) => window.modmind.assetIntent.apply(intent), ravenIntent),
        'intent apply',
        30_000
      )
      log(label, 'apply complete', {
        revisionBefore: applied.execution?.revisionBefore,
        revisionAfter: applied.execution?.revisionAfter,
        results: applied.execution?.results.length,
        diagnostics: applied.diagnostics
      })
    } else {
      for (const [index, action] of candidate.actions.entries()) {
        const actionLabel = `${index + 1}/${candidate.actions.length} ${action.type}`
        log(label, `starting ${actionLabel}`, action)
        const result = await withTimeout(
          page.evaluate((nextAction) => window.modmind.blockbench.execute(nextAction), action),
          actionLabel,
          10_000
        )
        log(label, `completed ${actionLabel}`, result)
      }
    }

    const state = await withTimeout(page.evaluate(() => window.modmind.blockbench.projectState()), 'intent project-state', 10_000)
    log(label, 'project-state complete', {format: state.format, project: state.project, counts: state.counts})
    const validation = await withTimeout(page.evaluate(() => window.modmind.blockbench.validate()), 'intent validation', 10_000)
    log(label, 'validation complete', {valid: validation.valid, summary: validation.summary, findings: validation.findings})
    const captures = await withTimeout(page.evaluate(() => window.modmind.blockbench.captureViews({
      views: ['isometric_right', 'north', 'west'], width: 320, height: 320
    })), 'intent capture', 30_000)
    const captureStats = await inspectCaptures(captures.captures)
    log(label, 'capture complete', {revision: captures.revision, captures: captureStats})
    return {format: label, success: true, state}
  } catch (error) {
    log(label, 'failed', {message: error instanceof Error ? error.message : String(error)})
    return {format: label, success: false, error: error instanceof Error ? error.message : String(error)}
  } finally {
    await closeApplication(app, pid)
    await rm(userDataDir, {recursive: true, force: true}).catch(() => undefined)
  }
}

async function probeCandidateUi() {
  const label = 'candidate-ui'
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-ui-user-'))
  const projectDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-ui-project-'))
  let app
  let pid
  try {
    await mkdir(path.join(projectDir, '.modmind'), {recursive: true})
    await writeFile(path.join(projectDir, 'modmind.project.json'), JSON.stringify({
      name: 'Blockbench UI Probe', path: projectDir, loader: 'fabric', minecraftVersion: '1.21.1',
      namespace: 'blockbench_ui_probe', createdAt: new Date().toISOString(), kind: 'mod',
      projectVersion: '1.1.3', toolDataDirectory: '.modmind'
    }, null, 2))
    log(label, 'launching')
    app = await withTimeout(electron.launch({args: ['.', `--user-data-dir=${userDataDir}`], cwd: root}), 'Electron launch', 20_000)
    pid = app.process().pid
    const page = await withTimeout(app.firstWindow(), 'main window', 20_000)
    await withTimeout(page.waitForLoadState('domcontentloaded'), 'main renderer', 20_000)
    await page.evaluate((target) => window.modmind.project.openRecent(target), projectDir)
    await page.reload({waitUntil: 'domcontentloaded'})
    log(label, 'bridge ready', await waitForBlockbench(page, label))
    log(label, 'project restored', await page.evaluate(() => window.modmind.project.current()))
    const expertToggle = page.locator('.expert-mode-toggle input')
    if (!(await expertToggle.isChecked())) await page.locator('.expert-mode-toggle').click()
    await page.getByRole('button', {name: '模型', exact: true}).click()
    await page.getByRole('button', {name: 'AI candidate'}).click()
    await page.getByRole('button', {name: 'Preview', exact: true}).click()
    await page.locator('.bb-intent-captures img').first().waitFor({state: 'visible', timeout: 30_000})
    const previewCount = await page.locator('.bb-intent-captures img').count()
    if (previewCount !== 3) throw new Error(`Expected 3 candidate previews, received ${previewCount}`)
    log(label, 'preview rendered', {captures: previewCount})
    await page.getByRole('button', {name: 'Accept and save', exact: true}).click()
    await page.locator('.bb-intent-message').filter({hasText: 'Accepted and saved'}).waitFor({state: 'visible', timeout: 30_000})

    const modelPath = path.join(projectDir, 'models', 'blockbench', 'ember_raven.bbmodel')
    const texturePath = path.join(projectDir, 'src', 'main', 'resources', 'assets', 'blockbench_ui_probe', 'textures', 'entity', 'ember_raven_atlas.png')
    const model = JSON.parse(await readFile(modelPath, 'utf8'))
    const metadata = model.modmind_asset
    if (metadata?.source !== 'GENERATED' || !/^[a-f0-9]{64}$/.test(metadata.intentHash || '')) {
      throw new Error(`Saved model metadata is invalid: ${JSON.stringify(metadata)}`)
    }
    const generatedIntentHash = metadata.intentHash
    const texture = await sharp(texturePath).metadata()
    if (texture.format !== 'png' || texture.width !== 64 || texture.height !== 64) throw new Error('Saved candidate texture is invalid')
    log(label, 'accepted and saved', {model: path.relative(projectDir, modelPath), texture: path.relative(projectDir, texturePath), metadata})

    const beforeRefinementPreview = await page.evaluate(() => window.modmind.blockbench.projectState())
    await page.getByRole('button', {name: 'Refine current', exact: true}).click()
    await page.getByRole('button', {name: 'Preview', exact: true}).click()
    await page.locator('.bb-intent-captures img').first().waitFor({state: 'visible', timeout: 30_000})
    const refinementPreviewCount = await page.locator('.bb-intent-captures img').count()
    if (refinementPreviewCount !== 3) throw new Error(`Expected 3 refinement previews, received ${refinementPreviewCount}`)
    const afterRefinementPreview = await page.evaluate(() => window.modmind.blockbench.projectState())
    if (afterRefinementPreview.revision !== beforeRefinementPreview.revision || afterRefinementPreview.project.uuid !== beforeRefinementPreview.project.uuid) {
      throw new Error('Refinement preview changed the original Blockbench project')
    }
    log(label, 'refinement preview rendered and discarded', {captures: refinementPreviewCount, revision: afterRefinementPreview.revision})

    await page.getByRole('button', {name: 'Accept and save', exact: true}).click()
    await page.locator('.bb-intent-message').filter({hasText: 'Accepted and saved'}).waitFor({state: 'visible', timeout: 30_000})
    const refinedModel = JSON.parse(await readFile(modelPath, 'utf8'))
    const refinedMetadata = refinedModel.modmind_asset
    if (refinedMetadata?.source !== 'REFINED'
      || !/^[a-f0-9]{64}$/.test(refinedMetadata.intentHash || '')
      || refinedMetadata.intentHash === generatedIntentHash
      || refinedMetadata.refinedFrom !== generatedIntentHash) {
      throw new Error(`Refined model metadata is invalid: ${JSON.stringify(refinedMetadata)}`)
    }
    const tail = refinedModel.elements?.find((element) => element.name === 'tail_volume')
    const head = refinedModel.elements?.find((element) => element.name === 'head_volume')
    const dimensions = (element) => element?.from?.map((value, axis) => element.to[axis] - value)
    if (JSON.stringify(dimensions(tail)) !== JSON.stringify([4, 4, 12])) throw new Error(`Refined tail dimensions are invalid: ${JSON.stringify(dimensions(tail))}`)
    if (JSON.stringify(dimensions(head)) !== JSON.stringify([5, 5, 5])) throw new Error(`Refined head dimensions are invalid: ${JSON.stringify(dimensions(head))}`)
    if (!refinedModel.animations?.some((animation) => animation.name === 'wing_flap_refined')) throw new Error('Refined animation is missing')
    const refinedTexture = await sharp(texturePath).metadata()
    if (refinedTexture.format !== 'png' || refinedTexture.width !== 64 || refinedTexture.height !== 64) throw new Error('Refined candidate texture is invalid')
    log(label, 'refinement accepted and saved', {metadata: refinedMetadata, tail: dimensions(tail), head: dimensions(head)})

    const beforeRollback = await page.evaluate(() => window.modmind.blockbench.projectState())
    const rollbackTail = beforeRollback.cubes.find((cube) => cube.name === 'tail_volume')
    if (!rollbackTail) throw new Error('Cannot find tail cube for rollback probe')
    const rollbackError = await page.evaluate(async ({cubeUuid, inflate, revision}) => {
      try {
        await window.modmind.blockbench.executeActions([
          {type: 'update-cube', cubeUuid, inflate: inflate + 0.25},
          {type: 'update-group', groupUuid: 'missing-group', origin: [0, 0, 0]}
        ], revision)
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, {cubeUuid: rollbackTail.uuid, inflate: rollbackTail.inflate, revision: beforeRollback.revision})
    if (!rollbackError.includes('project was restored')) throw new Error(`Batch did not report a successful rollback: ${rollbackError}`)
    const afterRollback = await page.evaluate(() => window.modmind.blockbench.projectState())
    const restoredTail = afterRollback.cubes.find((cube) => cube.name === 'tail_volume')
    if (afterRollback.revision !== beforeRollback.revision
      || afterRollback.project.uuid !== beforeRollback.project.uuid
      || JSON.stringify(afterRollback.metadata) !== JSON.stringify(beforeRollback.metadata)
      || JSON.stringify(restoredTail) !== JSON.stringify(rollbackTail)) {
      const comparable = (state) => ({
        project: {...state.project, saved: undefined}, metadata: state.metadata, format: state.format, counts: state.counts,
        cubes: state.cubes, groups: state.groups, meshes: state.meshes, textures: state.textures,
        animations: state.animations.map(({selected, ...animation}) => animation)
      })
      const beforeComparable = comparable(beforeRollback)
      const afterComparable = comparable(afterRollback)
      const differences = Object.fromEntries(Object.keys(beforeComparable)
        .filter((key) => JSON.stringify(beforeComparable[key]) !== JSON.stringify(afterComparable[key]))
        .map((key) => [key, {before: beforeComparable[key], after: afterComparable[key]}]))
      throw new Error(`Rollback did not restore the original project: ${JSON.stringify({before: beforeRollback.revision, after: afterRollback.revision, differences})}`)
    }
    log(label, 'transaction rollback restored project', {revision: afterRollback.revision, projectUuid: afterRollback.project.uuid})
    return {format: label, success: true}
  } catch (error) {
    log(label, 'failed', {message: error instanceof Error ? error.message : String(error)})
    return {format: label, success: false, error: error instanceof Error ? error.message : String(error)}
  } finally {
    await closeApplication(app, pid)
    await rm(userDataDir, {recursive: true, force: true}).catch(() => undefined)
    await rm(projectDir, {recursive: true, force: true}).catch(() => undefined)
  }
}

async function probeAdvancedCore() {
  const label = 'advanced-core'
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-advanced-user-'))
  const projectDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-advanced-project-'))
  let app
  let pid
  try {
    await mkdir(path.join(projectDir, '.modmind'), {recursive: true})
    await writeFile(path.join(projectDir, 'modmind.project.json'), JSON.stringify({
      name: 'Blockbench Advanced Probe', path: projectDir, loader: 'fabric', minecraftVersion: '1.21.1',
      namespace: 'advanced_probe', createdAt: new Date().toISOString(), kind: 'mod',
      projectVersion: '1.1.3', toolDataDirectory: '.modmind'
    }, null, 2))
    app = await withTimeout(electron.launch({args: ['.', `--user-data-dir=${userDataDir}`], cwd: root}), 'Electron launch', 20_000)
    pid = app.process().pid
    const page = await withTimeout(app.firstWindow(), 'main window', 20_000)
    await withTimeout(page.waitForLoadState('domcontentloaded'), 'main renderer', 20_000)
    await page.evaluate((target) => window.modmind.project.openRecent(target), projectDir)
    await page.reload({waitUntil: 'domcontentloaded'})
    log(label, 'bridge ready', await waitForBlockbench(page, label))

    const vertices = {
      v0: [-4, 0, -4], v1: [4, 0, -4], v2: [4, 0, 4], v3: [-4, 0, 4],
      v4: [-3, 8, -3], v5: [3, 8, -3], v6: [3, 8, 3], v7: [-3, 8, 3]
    }
    const faces = [
      {id: 'bottom', vertices: ['v0', 'v3', 'v2', 'v1']},
      {id: 'top', vertices: ['v4', 'v5', 'v6', 'v7']},
      {id: 'north', vertices: ['v0', 'v1', 'v5', 'v4']},
      {id: 'east', vertices: ['v1', 'v2', 'v6', 'v5']},
      {id: 'south', vertices: ['v2', 'v3', 'v7', 'v6']},
      {id: 'west', vertices: ['v3', 'v0', 'v4', 'v7']}
    ]
    const actions = [
      {type: 'new-model', format: 'free', name: 'advanced_probe', textureWidth: 64, textureHeight: 64},
      {type: 'create-texture', name: 'advanced_atlas', width: 64, height: 64, fill: '#20242aff', rectangles: [{x: 0, y: 0, width: 16, height: 16, color: '#9f3f2fff'}]},
      {type: 'add-mesh', name: 'hull_mesh', vertices, faces: faces.map((face) => ({...face, textureName: 'advanced_atlas'})), shading: 'smooth'},
      {type: 'auto-unwrap-mesh', meshName: 'hull_mesh', textureWidth: 64, textureHeight: 64, padding: 1},
      {type: 'paint-texture', textureName: 'advanced_atlas', rectangles: [{x: 20, y: 20, width: 8, height: 8, color: '#e0b050ff'}], strokes: [{points: [[2, 60], [16, 48], [30, 60]], color: '#f8f0d0ff', size: 2}]},
      {type: 'add-armature', name: 'probe_rig'},
      {type: 'add-bone', name: 'root_bone', armatureName: 'probe_rig', origin: [0, 0, 0]},
      {type: 'add-bone', name: 'tip_bone', parentBoneName: 'root_bone', origin: [0, 8, 0]},
      {type: 'reparent-element', elementUuid: 'replace-after-inspection', parentGroupName: 'root_bone'}
    ]
    const initialActions = actions.slice(0, -1)
    for (const action of initialActions) {
      await withTimeout(page.evaluate((entry) => window.modmind.blockbench.execute(entry), action), `advanced ${action.type}`, 30_000)
      log(label, `completed ${action.type}`)
    }
    let state = await page.evaluate(() => window.modmind.blockbench.projectState())
    const mesh = state.meshes.find((candidate) => candidate.name === 'hull_mesh')
    if (!mesh || mesh.vertexCount !== 8 || mesh.faceCount !== 6) throw new Error(`Mesh topology was not created: ${JSON.stringify(mesh)}`)
    const initialTextureHash = state.textures.find((texture) => texture.name === 'advanced_atlas')?.pixelHash
    if (!initialTextureHash || !Object.values(mesh.faces).every((face) => Object.keys(face.uv).length === face.vertices.length)) {
      throw new Error('Auto UV or texture paint did not persist')
    }

    const rigActions = [
      {type: 'reparent-element', elementUuid: mesh.uuid, parentGroupName: 'root_bone'},
      {type: 'set-vertex-weights', meshUuid: mesh.uuid, weights: Object.fromEntries(Object.keys(vertices).map((vertex) => [vertex, [
        {boneName: vertex.startsWith('v4') || vertex.startsWith('v5') || vertex.startsWith('v6') || vertex.startsWith('v7') ? 'tip_bone' : 'root_bone', weight: 1}
      ]]))},
      {type: 'add-locator', name: 'muzzle_socket', position: [0, 8, -4], parentGroupName: 'tip_bone'},
      {type: 'add-ik-target', name: 'tip_ik', position: [0, 10, 0], targetGroupName: 'tip_bone', sourceGroupName: 'root_bone', lockRotation: true},
      {type: 'add-animation', name: 'bend', length: 1, loop: 'loop', snapping: 20},
      {type: 'add-keyframe', animationName: 'bend', groupName: 'tip_bone', channel: 'rotation', time: 0, value: [0, 0, 0]},
      {type: 'add-keyframe', animationName: 'bend', groupName: 'tip_bone', channel: 'rotation', time: 0.5, value: [0, 0, 25], interpolation: 'catmullrom'},
      {type: 'add-keyframe', animationName: 'bend', groupName: 'tip_bone', channel: 'rotation', time: 1, value: [0, 0, 0]}
    ]
    for (const action of rigActions) {
      await withTimeout(page.evaluate((entry) => window.modmind.blockbench.execute(entry), action), `advanced ${action.type}`, 30_000)
      log(label, `completed ${action.type}`)
    }
    state = await page.evaluate(() => window.modmind.blockbench.projectState())
    const weightedVertices = state.bones.reduce((sum, bone) => sum + Object.keys(bone.vertexWeights || {}).length, 0)
    if (state.armatures.length !== 1 || state.bones.length !== 2 || state.ikTargets.length !== 1 || state.locators.length !== 1 || weightedVertices < 8) {
      throw new Error(`Rig state is incomplete: ${JSON.stringify({armatures: state.armatures, bones: state.bones, ik: state.ikTargets, locators: state.locators})}`)
    }
    if (!state.animations.some((animation) => animation.name === 'bend' && animation.animators.some((animator) => animator.rotationKeyframes === 3))) {
      throw new Error('Bone animation did not persist')
    }

    const duplicate = await page.evaluate((action) => window.modmind.blockbench.execute(action), {type: 'duplicate-element', elementUuid: mesh.uuid, name: 'hull_copy', offset: [10, 0, 0]})
    await page.evaluate((action) => window.modmind.blockbench.execute(action), {type: 'rename-element', elementUuid: duplicate.data.uuid, name: 'hull_copy_renamed'})
    await page.evaluate((action) => window.modmind.blockbench.execute(action), {type: 'delete-elements', elementUuids: [duplicate.data.uuid]})

    const revisedVertices = {...vertices, v4: [-2.5, 9, -2.5], v5: [2.5, 9, -2.5], v6: [2.5, 9, 2.5], v7: [-2.5, 9, 2.5]}
    state = await page.evaluate(() => window.modmind.blockbench.projectState())
    await page.evaluate(({meshUuid, nextVertices, nextFaces, revision}) => window.modmind.blockbench.executeActions([{
      type: 'update-mesh', meshUuid, vertices: nextVertices, faces: nextFaces, shading: 'flat'
    }], revision), {meshUuid: mesh.uuid, nextVertices: revisedVertices, nextFaces: faces.map((face) => ({...face, textureName: 'advanced_atlas'})), revision: state.revision})
    state = await page.evaluate(() => window.modmind.blockbench.projectState())
    const updatedMesh = state.meshes.find((candidate) => candidate.uuid === mesh.uuid)
    if (!updatedMesh || updatedMesh.vertexCount !== 8 || updatedMesh.faceCount !== 6 || updatedMesh.shading !== 'flat' || updatedMesh.vertices.v4[1] !== 9) {
      throw new Error(`Mesh replacement failed: ${JSON.stringify(updatedMesh)}`)
    }

    const history = await page.evaluate(() => window.modmind.blockbench.history())
    const topologyCheckpoint = history.find((entry) => entry.actionCount === 1)
    if (!topologyCheckpoint) throw new Error(`Automatic Blockbench checkpoint is missing: ${JSON.stringify(history)}`)
    await page.evaluate((id) => window.modmind.blockbench.restoreHistory(id), topologyCheckpoint.id)
    let restoredState = await page.evaluate(() => window.modmind.blockbench.projectState())
    const restoredMesh = restoredState.meshes.find((candidate) => candidate.uuid === mesh.uuid)
    if (!restoredMesh || restoredMesh.shading !== 'smooth' || restoredMesh.vertices.v4[1] !== 8) throw new Error('History did not restore the pre-topology state')
    const redoHistory = await page.evaluate(() => window.modmind.blockbench.history())
    const redoCheckpoint = redoHistory.find((entry) => entry.label.startsWith('Before restoring'))
    if (!redoCheckpoint) throw new Error('History restore did not retain the replaced state')
    await page.evaluate((id) => window.modmind.blockbench.restoreHistory(id), redoCheckpoint.id)
    state = await page.evaluate(() => window.modmind.blockbench.projectState())
    const redoneMesh = state.meshes.find((candidate) => candidate.uuid === mesh.uuid)
    if (!redoneMesh || redoneMesh.shading !== 'flat' || redoneMesh.vertices.v4[1] !== 9) throw new Error('History redo checkpoint did not restore the replaced topology')
    await page.evaluate(() => window.modmind.blockbench.createCheckpoint('Advanced probe checkpoint'))
    if (!(await page.evaluate(() => window.modmind.blockbench.history())).some((entry) => entry.label === 'Advanced probe checkpoint')) throw new Error('Named checkpoint was not retained')

    await page.evaluate(() => window.modmind.blockbench.executeActions([
      {type: 'save-project', relativePath: 'models/blockbench/advanced_probe.bbmodel'},
      {type: 'save-texture', relativePath: 'src/main/resources/assets/advanced_probe/textures/entity/advanced_atlas.png', textureName: 'advanced_atlas'}
    ]))
    const document = JSON.parse(await readFile(path.join(projectDir, 'models', 'blockbench', 'advanced_probe.bbmodel'), 'utf8'))
    const encoded = JSON.stringify(document)
    if (!encoded.includes('hull_mesh') || !encoded.includes('vertex_weights') || !encoded.includes('tip_ik') || !encoded.includes('ik_target')) {
      throw new Error('Saved bbmodel omitted editable mesh, weights, or IK data')
    }
    const texture = await sharp(path.join(projectDir, 'src', 'main', 'resources', 'assets', 'advanced_probe', 'textures', 'entity', 'advanced_atlas.png')).metadata()
    if (texture.format !== 'png' || texture.width !== 64 || texture.height !== 64) throw new Error('Saved advanced texture is invalid')
    log(label, 'all advanced core actions persisted', {mesh: {vertices: redoneMesh.vertexCount, faces: redoneMesh.faceCount}, armatures: state.armatures.length, bones: state.bones.length, animations: state.animations.length, history: (await page.evaluate(() => window.modmind.blockbench.history())).length})
    return {format: label, success: true, state}
  } catch (error) {
    log(label, 'failed', {message: error instanceof Error ? error.message : String(error)})
    return {format: label, success: false, error: error instanceof Error ? error.message : String(error)}
  } finally {
    await closeApplication(app, pid)
    await rm(userDataDir, {recursive: true, force: true}).catch(() => undefined)
    await rm(projectDir, {recursive: true, force: true}).catch(() => undefined)
  }
}

async function probeAdvancedUi() {
  const label = 'advanced-ui'
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-advanced-ui-user-'))
  const projectDir = await mkdtemp(path.join(tmpdir(), 'modmind-bb-advanced-ui-project-'))
  let app
  let pid
  try {
    await mkdir(path.join(projectDir, '.modmind'), {recursive: true})
    await writeFile(path.join(projectDir, 'modmind.project.json'), JSON.stringify({
      name: 'Blockbench Advanced UI Probe', path: projectDir, loader: 'fabric', minecraftVersion: '1.21.1',
      namespace: 'advanced_ui_probe', createdAt: new Date().toISOString(), kind: 'mod', projectVersion: '1.1.3', toolDataDirectory: '.modmind'
    }, null, 2))
    app = await withTimeout(electron.launch({args: ['.', `--user-data-dir=${userDataDir}`], cwd: root}), 'Electron launch', 20_000)
    pid = app.process().pid
    const page = await withTimeout(app.firstWindow(), 'main window', 20_000)
    await withTimeout(page.waitForLoadState('domcontentloaded'), 'main renderer', 20_000)
    await page.evaluate((target) => window.modmind.project.openRecent(target), projectDir)
    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForBlockbench(page, label)
    await page.locator('.bb-workspace').waitFor({state: 'visible', timeout: 30_000})
    log(label, 'workspace visible', {buttons: await page.locator('button').allTextContents()})
    const expertToggle = page.locator('.expert-mode-toggle input')
    if (!(await expertToggle.isChecked())) await page.locator('.expert-mode-toggle').click()
    const modelButton = page.locator('.bb-mode-control button').first()
    await modelButton.waitFor({state: 'visible', timeout: 30_000})
    await modelButton.click()
    await page.getByRole('button', {name: 'AI candidate'}).click()
    await page.getByRole('button', {name: 'Advanced', exact: true}).click()
    await page.getByRole('button', {name: 'Preview', exact: true}).click()
    await page.locator('.bb-candidate-tabs button').first().waitFor({state: 'visible', timeout: 60_000})
    if (await page.locator('.bb-candidate-tabs button').count() !== 3) throw new Error('Advanced UI did not render A/B/C candidates')
    if (await page.locator('.bb-intent-captures img').count() !== 3) throw new Error('Advanced UI did not render the selected candidate views')
    const score = await page.locator('.bb-candidate-tabs button strong').first().textContent()
    if (!score || !/^\d+$/.test(score)) throw new Error(`Advanced visual score is invalid: ${score}`)
    await page.getByRole('button', {name: 'Accept and save', exact: true}).click()
    await page.locator('.bb-intent-message').filter({hasText: 'Accepted and saved'}).waitFor({state: 'visible', timeout: 60_000})
    const modelPath = path.join(projectDir, 'models', 'blockbench', 'arc_relay.bbmodel')
    const model = JSON.parse(await readFile(modelPath, 'utf8'))
    const encoded = JSON.stringify(model)
    if (!encoded.includes('arc_mesh') || !encoded.includes('relay_rig') || !encoded.includes('tip_ik') || !encoded.includes('vertex_weights')) throw new Error('Advanced UI saved an incomplete editable model')
    await page.getByRole('button', {name: 'Model history'}).click()
    await page.getByRole('button', {name: 'Create checkpoint', exact: true}).click()
    await page.locator('.bb-history-list > div').first().waitFor({state: 'visible', timeout: 10_000})
    log(label, 'advanced candidates, scoring, save, and history UI passed', {score, history: await page.locator('.bb-history-list > div').count()})
    return {format: label, success: true}
  } catch (error) {
    log(label, 'failed', {message: error instanceof Error ? error.message : String(error)})
    return {format: label, success: false, error: error instanceof Error ? error.message : String(error)}
  } finally {
    await closeApplication(app, pid)
    await rm(userDataDir, {recursive: true, force: true}).catch(() => undefined)
    await rm(projectDir, {recursive: true, force: true}).catch(() => undefined)
  }
}

const results = []
if (uiMode && advancedCoreMode) results.push(await probeAdvancedUi())
else if (advancedCoreMode) results.push(await probeAdvancedCore())
else if (uiMode) results.push(await probeCandidateUi())
else if (intentMode) results.push(await probeIntent())
else for (const format of formats) results.push(await probeFormat(format))
process.stdout.write(`${JSON.stringify(results.map(({format, success, error, state}) => ({
  format,
  success,
  ...(error ? {error} : {}),
  ...(state ? {detectedFormat: state.format.id} : {})
})), null, 2)}\n`)

if (results.some((result) => !result.success)) process.exitCode = 1
