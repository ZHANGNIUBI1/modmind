import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, WebContentsView, type Rectangle } from 'electron'
import {
  BLOCKBENCH_FORMATS,
  type BlockbenchAction,
  type BlockbenchActionResult,
  type BlockbenchBounds,
  type BlockbenchBridgeStatus,
  type BlockbenchCommand,
  type BlockbenchFace,
  type BlockbenchVector3
} from '../shared/blockbench'

export interface BlockbenchBridgeOptions {
  window: BrowserWindow
  entryPath: string
  getProjectRoot: () => string | null
  partition?: string
}

type StatusListener = (status: BlockbenchBridgeStatus) => void

interface PageActionResult {
  message: string
  data?: Record<string, string | number | boolean>
  content?: string
}

const PAGE_DISPATCHER = String.raw`async function dispatchBlockbenchAction(action) {
  const root = globalThis;
  const BlockbenchApi = typeof Blockbench !== 'undefined' ? Blockbench : root.Blockbench;
  const FormatsApi = typeof Formats !== 'undefined' ? Formats : root.Formats;
  const CubeApi = typeof Cube !== 'undefined' ? Cube : root.Cube;
  const TextureApi = typeof Texture !== 'undefined' ? Texture : root.Texture;
  const GroupApi = typeof Group !== 'undefined' ? Group : root.Group;
  const AnimationApi = typeof Animation !== 'undefined' ? Animation : root.Animation;
  const UndoApi = typeof Undo !== 'undefined' ? Undo : root.Undo;
  const CanvasApi = typeof Canvas !== 'undefined' ? Canvas : root.Canvas;
  const CodecsApi = typeof Codecs !== 'undefined' ? Codecs : root.Codecs;
  const BarItemsApi = typeof BarItems !== 'undefined' ? BarItems : root.BarItems;
  const ModesApi = typeof Modes !== 'undefined' ? Modes : root.Modes;
  const ProjectApi = typeof Project !== 'undefined' ? Project : root.Project;
  const newProjectApi = typeof newProject !== 'undefined' ? newProject : root.newProject;

  if (!BlockbenchApi || !FormatsApi || !CubeApi || !TextureApi) {
    throw new Error('Blockbench API is not ready');
  }

  const updateCanvas = (elements) => {
    if (CanvasApi && typeof CanvasApi.updateView === 'function') {
      CanvasApi.updateView({
        elements,
        element_aspects: {geometry: true, uv: true, faces: true},
        selection: true
      });
    } else if (CanvasApi && typeof CanvasApi.updateAll === 'function') {
      CanvasApi.updateAll();
    }
  };
  const findGroup = (uuid, name) => {
    const groups = GroupApi && Array.isArray(GroupApi.all) ? GroupApi.all : [];
    return groups.find((group) => uuid ? group.uuid === uuid : group.name === name);
  };

  if (action.type === 'new-model') {
    const format = FormatsApi[action.format];
    if (!format) throw new Error('This Blockbench build does not support format: ' + action.format);
    if (typeof newProjectApi !== 'function') throw new Error('Blockbench newProject API is unavailable');
    const created = await newProjectApi(format);
    if (created === false) throw new Error('Blockbench cancelled project creation');
    if (ProjectApi) {
      ProjectApi.name = action.name;
      if (action.textureWidth) ProjectApi.texture_width = action.textureWidth;
      if (action.textureHeight) ProjectApi.texture_height = action.textureHeight;
    }
    if (typeof BlockbenchApi.dispatchEvent === 'function') {
      BlockbenchApi.dispatchEvent('update_project_settings', {});
    }
    return {message: 'Model created', data: {name: action.name, format: action.format}};
  }

  if (action.type === 'add-group') {
    if (!GroupApi) throw new Error('Blockbench group API is unavailable');
    const requestedParent = action.parentGroupUuid || action.parentGroupName
      ? findGroup(action.parentGroupUuid, action.parentGroupName)
      : null;
    if ((action.parentGroupUuid || action.parentGroupName) && !requestedParent) {
      throw new Error('Parent group not found: ' + (action.parentGroupUuid || action.parentGroupName));
    }
    if (UndoApi && typeof UndoApi.initEdit === 'function') UndoApi.initEdit({outliner: true});
    let group = new GroupApi({name: action.name, origin: action.origin, rotation: action.rotation});
    if (typeof group.addTo === 'function') group = group.addTo(requestedParent || 'root');
    if (typeof group.init === 'function') group = group.init();
    if (UndoApi && typeof UndoApi.finishEdit === 'function') UndoApi.finishEdit('Add group', {outliner: true});
    updateCanvas([]);
    return {message: 'Group added', data: {uuid: String(group.uuid), name: action.name}};
  }

  if (action.type === 'add-cube') {
    if (UndoApi && typeof UndoApi.initEdit === 'function') UndoApi.initEdit({elements: []});
    const config = {
      name: action.name,
      from: action.from,
      to: action.to,
      origin: action.origin,
      rotation: action.rotation,
      inflate: action.inflate || 0
    };
    let cube = new CubeApi(config);
    const requestedParent = action.parentGroupUuid || action.parentGroupName
      ? findGroup(action.parentGroupUuid, action.parentGroupName)
      : null;
    if ((action.parentGroupUuid || action.parentGroupName) && !requestedParent) {
      throw new Error('Parent group not found: ' + (action.parentGroupUuid || action.parentGroupName));
    }
    const parent = requestedParent || GroupApi && GroupApi.first_selected || 'root';
    if (typeof cube.addTo === 'function') cube = cube.addTo(parent);
    if (typeof cube.init === 'function') cube = cube.init();
    const textures = typeof Texture !== 'undefined' && Texture.all ? Texture.all : TextureApi.all;
    const requestedTexture = action.textureUuid
      ? Array.isArray(textures) && textures.find((item) => item.uuid === action.textureUuid)
      : Array.isArray(textures) && textures.find((item) => item.name === action.textureName);
    if ((action.textureUuid || action.textureName) && !requestedTexture) {
      throw new Error('Texture not found: ' + (action.textureUuid || action.textureName));
    }
    if (requestedTexture && cube.faces) {
      Object.keys(cube.faces).forEach((face) => { cube.faces[face].texture = requestedTexture.uuid; });
    }
    if (UndoApi && typeof UndoApi.finishEdit === 'function') {
      UndoApi.finishEdit('Add cube', {elements: [cube]});
    }
    updateCanvas([cube]);
    return {message: 'Cube added', data: {uuid: String(cube.uuid), name: action.name}};
  }

  if (action.type === 'add-animation') {
    if (!AnimationApi) throw new Error('Blockbench animation API is unavailable');
    let animation = new AnimationApi({name: action.name, length: action.length, loop: action.loop || 'once', snapping: action.snapping || 20});
    if (typeof animation.add === 'function') animation = animation.add();
    return {message: 'Animation added', data: {uuid: String(animation.uuid), name: action.name}};
  }

  if (action.type === 'add-keyframe') {
    if (!AnimationApi) throw new Error('Blockbench animation API is unavailable');
    const animations = Array.isArray(AnimationApi.all) ? AnimationApi.all : [];
    const animation = animations.find((item) => action.animationUuid ? item.uuid === action.animationUuid : item.name === action.animationName);
    const group = findGroup(action.groupUuid, action.groupName);
    if (!animation) throw new Error('Animation not found: ' + (action.animationUuid || action.animationName));
    if (!group) throw new Error('Animation group not found: ' + (action.groupUuid || action.groupName));
    if (typeof animation.getBoneAnimator !== 'function') throw new Error('Blockbench bone animator API is unavailable');
    const animator = animation.getBoneAnimator(group);
    if (!animator || typeof animator.addKeyframe !== 'function') throw new Error('Blockbench keyframe API is unavailable');
    const keyframe = animator.addKeyframe({
      channel: action.channel,
      time: action.time,
      interpolation: action.interpolation || 'linear',
      data_points: [{x: action.value[0], y: action.value[1], z: action.value[2]}]
    });
    return {message: 'Keyframe added', data: {uuid: String(keyframe && keyframe.uuid || ''), channel: action.channel, time: action.time}};
  }

  if (action.type === 'create-texture') {
    const activeProject = typeof Project !== 'undefined' ? Project : root.Project;
    if (!activeProject) {
      const textureFormat = FormatsApi.free || FormatsApi.java_block || FormatsApi.modded_entity;
      if (!textureFormat || typeof newProjectApi !== 'function') {
        throw new Error('Blockbench cannot create a standalone texture workspace');
      }
      const created = await newProjectApi(textureFormat);
      if (created === false) throw new Error('Blockbench cancelled texture workspace creation');
      const textureProject = typeof Project !== 'undefined' ? Project : root.Project;
      if (textureProject) {
        textureProject.name = 'texture_workspace';
        textureProject.texture_width = action.width;
        textureProject.texture_height = action.height;
      }
    }
    let dataUrl = action.dataUrl;
    if (!dataUrl) {
      const canvas = document.createElement('canvas');
      canvas.width = action.width;
      canvas.height = action.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable');
      context.fillStyle = action.fill || '#00000000';
      context.fillRect(0, 0, action.width, action.height);
      if (Array.isArray(action.rectangles)) {
        action.rectangles.forEach((rectangle) => {
          context.fillStyle = rectangle.color;
          context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
        });
      }
      dataUrl = canvas.toDataURL('image/png');
    }
    let texture = new TextureApi({
      name: action.name,
      width: action.width,
      height: action.height,
      mode: 'bitmap'
    });
    if (typeof texture.fromDataURL !== 'function') throw new Error('Blockbench texture import API is unavailable');
    const imported = texture.fromDataURL(dataUrl);
    if (imported) texture = imported;
    if (typeof texture.add === 'function') texture.add(false);
    return {message: 'Texture created', data: {uuid: String(texture.uuid), name: action.name}};
  }

  if (action.type === 'set-cube-texture') {
    const elements = typeof Outliner !== 'undefined' ? Outliner.elements : (root.Outliner && root.Outliner.elements);
    const textures = typeof Texture !== 'undefined' && Texture.all ? Texture.all : TextureApi.all;
    const cube = Array.isArray(elements) && elements.find((element) =>
      action.cubeUuid ? element.uuid === action.cubeUuid : element.name === action.cubeName
    );
    const texture = Array.isArray(textures) && textures.find((item) =>
      action.textureUuid ? item.uuid === action.textureUuid : item.name === action.textureName
    );
    if (!cube || !cube.faces) throw new Error('Cube not found: ' + (action.cubeUuid || action.cubeName));
    if (!texture) throw new Error('Texture not found: ' + (action.textureUuid || action.textureName));
    const faces = action.faces || ['north', 'east', 'south', 'west', 'up', 'down'];
    if (UndoApi && typeof UndoApi.initEdit === 'function') UndoApi.initEdit({elements: [cube]});
    faces.forEach((face) => { if (cube.faces[face]) cube.faces[face].texture = texture.uuid; });
    if (UndoApi && typeof UndoApi.finishEdit === 'function') {
      UndoApi.finishEdit('Apply texture', {elements: [cube]});
    }
    updateCanvas([cube]);
    return {message: 'Texture applied', data: {cubeUuid: cube.uuid, textureUuid: texture.uuid}};
  }

  if (action.type === 'run-command') {
    const modeMap = {'mode-edit': 'edit', 'mode-paint': 'paint', 'mode-animate': 'animate'};
    const mode = modeMap[action.command];
    if (mode) {
      const modeOption = ModesApi && ModesApi.options && ModesApi.options[mode];
      if (!modeOption || typeof modeOption.select !== 'function') {
        throw new Error('Blockbench mode is unavailable: ' + mode);
      }
      modeOption.select();
      return {message: 'Mode changed', data: {command: action.command}};
    }
    const barItemMap = {
      undo: ['undo'],
      redo: ['redo'],
      'frame-all': ['frame_all'],
      'toggle-grid': ['toggle_grid'],
      'toggle-animate': ['play_animation', 'toggle_animate'],
      'open-project': ['open_model', 'open_project'],
      'save-project-dialog': ['save_project', 'save_project_as']
    };
    const candidates = barItemMap[action.command] || [];
    const item = candidates.map((id) => BarItemsApi && BarItemsApi[id]).find(Boolean);
    if (!item || typeof item.trigger !== 'function') {
      throw new Error('Blockbench command is unavailable: ' + action.command);
    }
    item.trigger();
    return {message: 'Command executed', data: {command: action.command}};
  }

  if (action.type === 'serialize-project') {
    if (!CodecsApi || !CodecsApi.project || typeof CodecsApi.project.compile !== 'function') {
      throw new Error('Blockbench project codec is unavailable');
    }
    const compiled = await CodecsApi.project.compile({compressed: false});
    const content = typeof compiled === 'string' ? compiled : JSON.stringify(compiled, null, 2);
    return {message: 'Project serialized', content};
  }

  if (action.type === 'serialize-export') {
    const codec = ProjectApi && ProjectApi.format && ProjectApi.format.codec;
    if (!codec || typeof codec.compile !== 'function') throw new Error('The active Blockbench format cannot be exported');
    const compiled = await codec.compile({raw: true});
    const content = typeof compiled === 'string' ? compiled : JSON.stringify(compiled, null, 2);
    return {message: 'Model exported', content};
  }

  if (action.type === 'serialize-texture') {
    const textures = typeof Texture !== 'undefined' && Texture.all ? Texture.all : TextureApi.all;
    const texture = Array.isArray(textures) && textures.find((item) =>
      action.textureUuid ? item.uuid === action.textureUuid : item.name === action.textureName
    );
    if (!texture || typeof texture.getDataURL !== 'function') throw new Error('Texture not found or cannot be serialized');
    const content = texture.getDataURL();
    if (typeof content !== 'string' || !content.startsWith('data:image/png;base64,')) {
      throw new Error('Blockbench returned an invalid PNG texture');
    }
    return {message: 'Texture serialized', content};
  }

  throw new Error('Unsupported Blockbench action');
}`

export class BlockbenchBridge {
  private readonly window: BrowserWindow
  private readonly entryPath: string
  private readonly getProjectRoot: () => string | null
  private readonly view: WebContentsView
  private readonly listeners = new Set<StatusListener>()
  private status: BlockbenchBridgeStatus
  private attached = false
  private destroyed = false
  private actionQueue: Promise<void> = Promise.resolve()

  constructor(options: BlockbenchBridgeOptions) {
    this.window = options.window
    this.entryPath = path.resolve(options.entryPath)
    this.getProjectRoot = options.getProjectRoot
    this.status = this.makeStatus('idle', false)
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: options.partition ?? 'persist:modmind-blockbench'
      }
    })

    this.configureSecurity()
    this.bindLifecycleEvents()
  }

  getStatus(): BlockbenchBridgeStatus {
    return { ...this.status }
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    listener(this.getStatus())
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<BlockbenchBridgeStatus> {
    this.assertAlive()
    const entry = await fs.stat(this.entryPath).catch(() => null)
    if (!entry?.isFile()) {
      const message = `Blockbench entry was not found: ${this.entryPath}`
      this.setStatus('error', message)
      throw new Error(message)
    }

    this.setStatus('loading', 'Loading embedded Blockbench')
    try {
      await this.view.webContents.loadFile(this.entryPath)
      const version = await this.waitUntilReady()
      this.setStatus('ready', 'Blockbench is ready', version)
      return this.getStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus('error', message)
      throw error
    }
  }

  show(): void {
    this.assertAlive()
    if (!this.attached) {
      this.window.contentView.addChildView(this.view)
      this.attached = true
    }
    this.view.setVisible(true)
    this.updateVisibility(true)
  }

  hide(): void {
    if (this.destroyed) return
    this.view.setVisible(false)
    if (this.attached) {
      this.window.contentView.removeChildView(this.view)
      this.attached = false
    }
    this.updateVisibility(false)
  }

  setBounds(bounds: BlockbenchBounds): void {
    this.assertAlive()
    this.view.setBounds(validateBounds(bounds))
  }

  executeAction(action: BlockbenchAction): Promise<BlockbenchActionResult> {
    let validated: BlockbenchAction
    try {
      validated = validateAction(action)
    } catch (error) {
      return Promise.reject(error)
    }

    const operation = this.actionQueue.then(() => this.executeValidatedAction(validated))
    this.actionQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  async executeActions(actions: BlockbenchAction[], signal?: AbortSignal): Promise<BlockbenchActionResult[]> {
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > 50) {
      throw new Error('A Blockbench batch must contain between 1 and 50 actions')
    }
    const results: BlockbenchActionResult[] = []
    for (const action of actions) {
      if (signal?.aborted) throw Object.assign(new Error('Blockbench 操作已取消'), { name: 'AbortError' })
      results.push(await this.executeAction(action))
    }
    return results
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.attached) this.window.contentView.removeChildView(this.view)
    this.attached = false
    this.listeners.clear()
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.setStatus('destroyed', 'Blockbench bridge destroyed')
  }

  private async executeValidatedAction(action: BlockbenchAction): Promise<BlockbenchActionResult> {
    this.assertAlive()
    if (this.status.phase !== 'ready') throw new Error('Blockbench is not ready')

    if (action.type === 'save-project') {
      const pageResult = await this.invokePage({ type: 'serialize-project' })
      if (typeof pageResult.content !== 'string') throw new Error('Blockbench returned an invalid project')
      if (Buffer.byteLength(pageResult.content, 'utf8') > 50 * 1024 * 1024) {
        throw new Error('Blockbench project exceeds the 50 MiB save limit')
      }
      const destination = await this.resolveProjectFile(action.relativePath)
      await fs.writeFile(destination, pageResult.content, { encoding: 'utf8', flag: 'w' })
      return {
        action: action.type,
        success: true,
        message: 'Blockbench project saved',
        data: { relativePath: action.relativePath }
      }
    }

    if (action.type === 'export-model') {
      const pageResult = await this.invokePage({ type: 'serialize-export' })
      if (typeof pageResult.content !== 'string' || Buffer.byteLength(pageResult.content, 'utf8') > 50 * 1024 * 1024) {
        throw new Error('Blockbench returned an invalid or oversized model export')
      }
      const destination = await this.resolveProjectFile(action.relativePath)
      await fs.writeFile(destination, pageResult.content, { encoding: 'utf8', flag: 'w' })
      return { action: action.type, success: true, message: 'Blockbench model exported', data: { relativePath: action.relativePath } }
    }

    if (action.type === 'save-texture') {
      const pageResult = await this.invokePage({
        type: 'serialize-texture',
        textureUuid: action.textureUuid,
        textureName: action.textureName
      })
      if (typeof pageResult.content !== 'string' || !pageResult.content.startsWith('data:image/png;base64,')) {
        throw new Error('Blockbench returned an invalid PNG texture')
      }
      const encoded = pageResult.content.slice('data:image/png;base64,'.length)
      const content = Buffer.from(encoded, 'base64')
      if (!content.length || content.length > 8 * 1024 * 1024) throw new Error('Blockbench PNG size is invalid')
      const destination = await this.resolveProjectFile(action.relativePath)
      await fs.writeFile(destination, content, { flag: 'w' })
      return {
        action: action.type,
        success: true,
        message: 'Blockbench texture saved',
        data: { relativePath: action.relativePath, size: content.length }
      }
    }

    const pageResult = await this.invokePage(action)
    return {
      action: action.type,
      success: true,
      message: pageResult.message,
      data: pageResult.data
    }
  }

  private async invokePage(
    action:
      | BlockbenchAction
      | { type: 'serialize-project' }
      | { type: 'serialize-export' }
      | { type: 'serialize-texture'; textureUuid?: string; textureName?: string }
  ): Promise<PageActionResult> {
    const encoded = Buffer.from(JSON.stringify(action), 'utf8').toString('base64')
    const script = `(async()=>{const action=JSON.parse(atob(${JSON.stringify(encoded)}));return (${PAGE_DISPATCHER})(action)})()`
    const result: unknown = await this.view.webContents.executeJavaScript(script, true)
    if (!isRecord(result) || typeof result.message !== 'string') {
      throw new Error('Blockbench returned an invalid action result')
    }
    return result as unknown as PageActionResult
  }

  private async waitUntilReady(): Promise<string | undefined> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (this.destroyed) throw new Error('Blockbench bridge was destroyed while loading')
      const probe: unknown = await this.view.webContents.executeJavaScript(
        `(() => {
          const root = globalThis;
          const bb = typeof Blockbench !== 'undefined' ? Blockbench : root.Blockbench;
          const formats = typeof Formats !== 'undefined' ? Formats : root.Formats;
          const cube = typeof Cube !== 'undefined' ? Cube : root.Cube;
          const texture = typeof Texture !== 'undefined' ? Texture : root.Texture;
          const codecs = typeof Codecs !== 'undefined' ? Codecs : root.Codecs;
          return {ready: !!(bb && formats && cube && texture && codecs && codecs.project), version: bb && bb.version};
        })()`,
        true
      )
      if (isRecord(probe) && probe.ready === true) {
        return typeof probe.version === 'string' ? probe.version : undefined
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('Blockbench loaded, but its editor API did not become ready')
  }

  private async resolveProjectFile(relativePath: string): Promise<string> {
    const projectRoot = this.getProjectRoot()
    if (!projectRoot) throw new Error('No ModMind project is open')
    const realRoot = await fs.realpath(projectRoot)
    const target = path.resolve(realRoot, relativePath)
    if (!isInside(realRoot, target)) throw new Error('Blockbench save path leaves the current project')

    const parent = path.dirname(target)
    await fs.mkdir(parent, { recursive: true })
    const realParent = await fs.realpath(parent)
    if (!isInside(realRoot, realParent)) throw new Error('Blockbench save path crosses a symbolic link')
    const existing = await fs.lstat(target).catch(() => null)
    if (existing?.isSymbolicLink()) throw new Error('Blockbench cannot overwrite a symbolic link')
    return target
  }

  private configureSecurity(): void {
    const entryDirectory = path.dirname(this.entryPath)
    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.view.webContents.on('will-navigate', (event, url) => {
      if (!isLocalEntryUrl(url, entryDirectory)) event.preventDefault()
    })
    this.view.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen')
    })
  }

  private bindLifecycleEvents(): void {
    this.view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.setStatus('error', description)
    })
    this.view.webContents.on('render-process-gone', (_event, details) => {
      this.setStatus('error', `Blockbench renderer stopped: ${details.reason}`)
    })
    this.window.on('closed', () => this.destroy())
  }

  private makeStatus(
    phase: BlockbenchBridgeStatus['phase'],
    visible: boolean,
    message?: string,
    version?: string
  ): BlockbenchBridgeStatus {
    return { phase, visible, message, version, updatedAt: new Date().toISOString() }
  }

  private setStatus(phase: BlockbenchBridgeStatus['phase'], message?: string, version?: string): void {
    this.status = this.makeStatus(phase, this.status.visible, message, version ?? this.status.version)
    this.emitStatus()
  }

  private updateVisibility(visible: boolean): void {
    this.status = { ...this.status, visible, updatedAt: new Date().toISOString() }
    this.emitStatus()
  }

  private emitStatus(): void {
    const status = this.getStatus()
    for (const listener of this.listeners) listener(status)
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Blockbench bridge has been destroyed')
  }
}

function validateBounds(bounds: BlockbenchBounds): Rectangle {
  const values = [bounds?.x, bounds?.y, bounds?.width, bounds?.height]
  if (!values.every((value) => Number.isInteger(value) && Number.isFinite(value))) {
    throw new Error('Blockbench bounds must be finite integers')
  }
  if (bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1) {
    throw new Error('Blockbench bounds must be positive and remain inside the window')
  }
  if (bounds.x > 16384 || bounds.y > 16384 || bounds.width > 16384 || bounds.height > 16384) {
    throw new Error('Blockbench bounds exceed the supported window size')
  }
  return { ...bounds }
}

function normalizeBlockbenchPath(value: unknown, extensions: string[], label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 240) throw new Error(`Invalid ${label} path`)
  const normalized = value.replaceAll('\\', '/')
  const root = normalized.split('/')[0].toLowerCase()
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.includes('\0') ||
    ['.git', '.modmind', '.modtool', 'node_modules', 'build', '.gradle'].includes(root) ||
    !extensions.some((extension) => normalized.toLowerCase().endsWith(extension))
  ) {
    throw new Error(`${label} path must be a safe project-relative ${extensions.join(' / ')} path`)
  }
  return normalized
}

export function validateAction(input: BlockbenchAction): BlockbenchAction {
  if (!isRecord(input) || typeof input.type !== 'string') throw new Error('Invalid Blockbench action')

  if (input.type === 'new-model') {
    assertOnlyKeys(input, ['type', 'format', 'name', 'textureWidth', 'textureHeight'])
    if (!BLOCKBENCH_FORMATS.includes(input.format as (typeof BLOCKBENCH_FORMATS)[number])) {
      throw new Error('Unsupported Blockbench format')
    }
    assertName(input.name, 'model name')
    assertOptionalTextureSize(input.textureWidth)
    assertOptionalTextureSize(input.textureHeight)
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'add-cube') {
    assertOnlyKeys(input, ['type', 'name', 'from', 'to', 'origin', 'rotation', 'inflate', 'textureUuid', 'textureName', 'parentGroupUuid', 'parentGroupName'])
    assertName(input.name, 'cube name')
    assertVector(input.from, 'from', -1024, 1024)
    assertVector(input.to, 'to', -1024, 1024)
    if ((input.from as number[]).some((value, index) => value >= (input.to as number[])[index])) {
      throw new Error('Every cube from coordinate must be smaller than its to coordinate')
    }
    if (input.origin !== undefined) assertVector(input.origin, 'origin', -1024, 1024)
    if (input.rotation !== undefined) assertVector(input.rotation, 'rotation', -360, 360)
    if (input.inflate !== undefined) assertNumber(input.inflate, 'inflate', -64, 64)
    if (input.textureUuid !== undefined) assertIdentifier(input.textureUuid, 'texture UUID')
    if (input.textureName !== undefined) assertName(input.textureName, 'texture name')
    if (input.parentGroupUuid !== undefined) assertIdentifier(input.parentGroupUuid, 'parent group UUID')
    if (input.parentGroupName !== undefined) assertName(input.parentGroupName, 'parent group name')
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'add-group') {
    assertOnlyKeys(input, ['type', 'name', 'origin', 'rotation', 'parentGroupUuid', 'parentGroupName'])
    assertName(input.name, 'group name')
    if (input.origin !== undefined) assertVector(input.origin, 'origin', -1024, 1024)
    if (input.rotation !== undefined) assertVector(input.rotation, 'rotation', -360, 360)
    if (input.parentGroupUuid !== undefined) assertIdentifier(input.parentGroupUuid, 'parent group UUID')
    if (input.parentGroupName !== undefined) assertName(input.parentGroupName, 'parent group name')
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'add-animation') {
    assertOnlyKeys(input, ['type', 'name', 'length', 'loop', 'snapping'])
    assertName(input.name, 'animation name')
    assertNumber(input.length, 'animation length', Number.EPSILON, 3600)
    if (input.loop !== undefined && !['once', 'loop', 'hold'].includes(String(input.loop))) throw new Error('Animation loop mode is invalid')
    if (input.snapping !== undefined && (!Number.isInteger(input.snapping) || input.snapping < 1 || input.snapping > 120)) throw new Error('Animation snapping must be an integer from 1 to 120')
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'add-keyframe') {
    assertOnlyKeys(input, ['type', 'animationUuid', 'animationName', 'groupUuid', 'groupName', 'channel', 'time', 'value', 'interpolation'])
    const uuids = input.animationUuid !== undefined && input.groupUuid !== undefined
    const names = input.animationName !== undefined && input.groupName !== undefined
    if (!uuids && !names) throw new Error('Animation and group must be referenced by UUIDs or names')
    if (input.animationUuid !== undefined) assertIdentifier(input.animationUuid, 'animation UUID')
    if (input.animationName !== undefined) assertName(input.animationName, 'animation name')
    if (input.groupUuid !== undefined) assertIdentifier(input.groupUuid, 'group UUID')
    if (input.groupName !== undefined) assertName(input.groupName, 'group name')
    if (!['rotation', 'position', 'scale'].includes(String(input.channel))) throw new Error('Animation channel is invalid')
    assertNumber(input.time, 'keyframe time', 0, 3600)
    assertVector(input.value, 'keyframe value', -1024, 1024)
    if (input.interpolation !== undefined && !['linear', 'catmullrom', 'step', 'bezier'].includes(String(input.interpolation))) throw new Error('Keyframe interpolation is invalid')
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'create-texture') {
    assertOnlyKeys(input, ['type', 'name', 'width', 'height', 'dataUrl', 'fill', 'rectangles'])
    assertName(input.name, 'texture name')
    assertTextureSize(input.width, 'texture width')
    assertTextureSize(input.height, 'texture height')
    if (input.dataUrl !== undefined) {
      if (typeof input.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.dataUrl)) {
        throw new Error('Texture data must be a base64 PNG data URL')
      }
      if (input.dataUrl.length > 8 * 1024 * 1024) throw new Error('Texture data exceeds 8 MiB')
    }
    if (input.fill !== undefined && (typeof input.fill !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(input.fill))) {
      throw new Error('Texture fill must be #RRGGBB or #RRGGBBAA')
    }
    if (input.rectangles !== undefined) {
      if (!Array.isArray(input.rectangles) || input.rectangles.length > 256) throw new Error('Texture rectangles must contain at most 256 entries')
      for (const entry of input.rectangles) {
        if (!isRecord(entry)) throw new Error('Texture rectangle must be an object')
        assertOnlyKeys(entry, ['x', 'y', 'width', 'height', 'color'])
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          if (!Number.isInteger(entry[key]) || typeof entry[key] !== 'number') throw new Error(`Texture rectangle ${key} must be an integer`)
        }
        if (entry.x < 0 || entry.y < 0 || entry.width < 1 || entry.height < 1) throw new Error('Texture rectangle dimensions are invalid')
        if (entry.x + entry.width > input.width || entry.y + entry.height > input.height) throw new Error('Texture rectangle leaves the texture bounds')
        if (typeof entry.color !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(entry.color)) throw new Error('Texture rectangle color is invalid')
      }
    }
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'set-cube-texture') {
    assertOnlyKeys(input, ['type', 'cubeUuid', 'textureUuid', 'cubeName', 'textureName', 'faces'])
    const hasUuids = input.cubeUuid !== undefined && input.textureUuid !== undefined
    const hasNames = input.cubeName !== undefined && input.textureName !== undefined
    if (!hasUuids && !hasNames) throw new Error('Cube and texture must be referenced by UUIDs or names')
    if (input.cubeUuid !== undefined) assertIdentifier(input.cubeUuid, 'cube UUID')
    if (input.textureUuid !== undefined) assertIdentifier(input.textureUuid, 'texture UUID')
    if (input.cubeName !== undefined) assertName(input.cubeName, 'cube name')
    if (input.textureName !== undefined) assertName(input.textureName, 'texture name')
    if (input.faces !== undefined) {
      const allowed = new Set<BlockbenchFace>(['north', 'east', 'south', 'west', 'up', 'down'])
      if (!Array.isArray(input.faces) || input.faces.length > 6 || !input.faces.every((face) => allowed.has(face as BlockbenchFace))) {
        throw new Error('Invalid cube face list')
      }
      if (new Set(input.faces).size !== input.faces.length) throw new Error('Cube face list contains duplicates')
    }
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'save-project') {
    assertOnlyKeys(input, ['type', 'relativePath'])
    return { type: input.type, relativePath: normalizeBlockbenchPath(input.relativePath, ['.bbmodel'], 'Blockbench project') }
  }

  if (input.type === 'export-model') {
    assertOnlyKeys(input, ['type', 'relativePath'])
    return { type: input.type, relativePath: normalizeBlockbenchPath(input.relativePath, ['.geo.json', '.json', '.java'], 'Blockbench export') }
  }

  if (input.type === 'run-command') {
    assertOnlyKeys(input, ['type', 'command'])
    const commands = new Set<BlockbenchCommand>([
      'undo',
      'redo',
      'frame-all',
      'toggle-grid',
      'toggle-animate',
      'mode-edit',
      'mode-paint',
      'mode-animate',
      'open-project',
      'save-project-dialog'
    ])
    if (typeof input.command !== 'string' || !commands.has(input.command as BlockbenchCommand)) {
      throw new Error('Unsupported Blockbench command')
    }
    return input as unknown as BlockbenchAction
  }

  if (input.type === 'save-texture') {
    assertOnlyKeys(input, ['type', 'relativePath', 'textureUuid', 'textureName'])
    const normalized = normalizeBlockbenchPath(input.relativePath, ['.png'], 'Blockbench texture')
    if (input.textureUuid === undefined && input.textureName === undefined) throw new Error('save-texture requires textureUuid or textureName')
    if (input.textureUuid !== undefined) assertIdentifier(input.textureUuid, 'texture UUID')
    if (input.textureName !== undefined) assertName(input.textureName, 'texture name')
    return input as unknown as BlockbenchAction
  }

  throw new Error(`Unsupported Blockbench action: ${String((input as { type?: unknown }).type)}`)
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed)
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    throw new Error('Blockbench action contains unsupported fields')
  }
}

function assertName(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || /[\u0000-\u001f/\\]/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

function assertVector(value: unknown, label: string, minimum: number, maximum: number): asserts value is BlockbenchVector3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must have three coordinates`)
  value.forEach((coordinate) => assertNumber(coordinate, label, minimum, maximum))
}

function assertNumber(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is outside the supported range`)
  }
}

function assertTextureSize(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1 || value > 1024) {
    throw new Error(`${label} must be an integer from 1 to 1024`)
  }
}

function assertOptionalTextureSize(value: unknown): void {
  if (value !== undefined) assertTextureSize(value, 'texture size')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isLocalEntryUrl(rawUrl: string, entryDirectory: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'file:') return false
    return isInside(entryDirectory, path.resolve(fileURLToPath(url)))
  } catch {
    return false
  }
}
