(() => {
  'use strict'

  const CHANNEL = 'modmind-minipaint'
  const palettes = {
    light: {
      '--background': '#f3f4f6', '--text-color': '#34373d', '--text-color-muted': '#747881',
      '--text-color-red': '#b83d3d', '--text-color-green': '#287c45', '--text-color-blue': '#1769d1',
      '--link-color': '#1769d1', '--section-background-color': '#ffffff', '--area-background-color': '#eef0f3',
      '--block-background-color': '#ffffff', '--header-background-color': '#f7f8fa', '--button-background-color': '#ffffff',
      '--button-background-color-hover': '#eaf2ff', '--button-background-color-active': '#dcecff',
      '--button-shadow-color': 'rgba(37, 43, 53, .12)', '--button-text-color-active': '#1769d1',
      '--button-toggle-background-color': '#dfe9f5', '--button-toggle-background-color-hover': '#d3e3f5',
      '--input-background-color': '#ffffff', '--input-background-color-hover': '#f4f6f8', '--input-text-color': '#34373d',
      '--input-border-color': '#cfd4dc', '--input-border-color-active': '#75a9e6', '--input-group-border-color': '#dfe1e5',
      '--menu-background-color': '#ffffff', '--menu-icons-filter': 'none', '--menu-icons-filter-active': 'none',
      '--menu-text-color': '#34373d', '--menu-dropdown-hover-background-color': '#eaf2ff',
      '--menu-dropdown-border-color': '#75a9e6', '--background-color-active': '#dcecff',
      '--background-color-hover': '#eef3f9', '--text-color-active': '#1769d1', '--border-color': '#dfe1e5',
      '--scrollbar-track-color': '#f3f4f6', '--scrollbar-thumb-color': '#b9bec7', '--mobile-menu-toggle-filter': 'none'
    },
    dark: {
      '--background': '#1c1d20', '--text-color': '#e7e7eb', '--text-color-muted': '#aeb0b8',
      '--text-color-red': '#f19a93', '--text-color-green': '#8bd39a', '--text-color-blue': '#79b5e5',
      '--link-color': '#79b5e5', '--section-background-color': '#242529', '--area-background-color': '#202125',
      '--block-background-color': '#26282d', '--header-background-color': '#242529', '--button-background-color': '#2b2d32',
      '--button-background-color-hover': '#373a42', '--button-background-color-active': '#35485b',
      '--button-shadow-color': 'rgba(0, 0, 0, .35)', '--button-text-color-active': '#d9ebff',
      '--button-toggle-background-color': '#35485b', '--button-toggle-background-color-hover': '#40556b',
      '--input-background-color': '#202226', '--input-background-color-hover': '#2b2d32', '--input-text-color': '#e7e7eb',
      '--input-border-color': '#484b53', '--input-border-color-active': '#79b5e5', '--input-group-border-color': '#3b3e45',
      '--menu-background-color': '#242529', '--menu-icons-filter': 'invert(1)', '--menu-icons-filter-active': 'invert(1)',
      '--menu-text-color': '#e7e7eb', '--menu-dropdown-hover-background-color': '#35485b',
      '--menu-dropdown-border-color': '#40556b', '--background-color-active': '#35485b',
      '--background-color-hover': '#373a42', '--text-color-active': '#d9ebff', '--border-color': '#3b3e45',
      '--scrollbar-track-color': '#202125', '--scrollbar-thumb-color': '#555a64', '--mobile-menu-toggle-filter': 'invert(1)'
    }
  }

  function reply(type, payload = {}) {
    window.parent.postMessage({ channel: CHANNEL, type, ...payload }, '*')
  }

  function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light'
    document.body.classList.toggle('theme-light', normalized === 'light')
    document.body.classList.toggle('theme-dark', normalized === 'dark')
    document.documentElement.style.colorScheme = normalized
    for (const [name, value] of Object.entries(palettes[normalized])) document.body.style.setProperty(name, value)
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图片无法解码'))
      image.src = dataUrl
    })
  }

  async function openImage(dataUrl, name) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 30 * 1024 * 1024) throw new Error('图片数据无效或过大')
    if (!/^data:image\/(?:png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('只支持 PNG、JPEG、WebP、GIF 或 BMP 图片')
    if (!globalThis.FileOpen || !globalThis.Layers || !globalThis.AppConfig) throw new Error('miniPaint 文件接口尚未准备好')
    const image = await loadImage(dataUrl)
    await globalThis.Layers.reset_layers(false)
    globalThis.FileOpen.file_open_data_url_handler(dataUrl)
    await new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const check = () => {
        const layer = globalThis.AppConfig.layer
        if (globalThis.AppConfig.WIDTH === image.naturalWidth && globalThis.AppConfig.HEIGHT === image.naturalHeight && layer && layer.type === 'image') {
          if (typeof name === 'string' && name) layer.name = name.slice(0, 120)
          globalThis.Layers.refresh_gui()
          globalThis.Layers.Base_gui?.GUI_information?.show_size(true)
          globalThis.AppConfig.need_render = true
          resolve()
          return
        }
        if (Date.now() - startedAt > 10_000) { reject(new Error('miniPaint 打开图片超时')); return }
        requestAnimationFrame(check)
      }
      check()
    })
  }

  function exportPng() {
    if (!globalThis.Layers || !globalThis.AppConfig || !globalThis.AppConfig.WIDTH || !globalThis.AppConfig.HEIGHT) throw new Error('编辑器当前没有可导出的画布')
    const canvas = document.createElement('canvas')
    canvas.width = globalThis.AppConfig.WIDTH
    canvas.height = globalThis.AppConfig.HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建导出画布')
    context.imageSmoothingEnabled = false
    globalThis.Layers.convert_layers_to_canvas(context, null, false)
    return canvas.toDataURL('image/png')
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent || !event.data || event.data.channel !== CHANNEL) return
    const requestId = typeof event.data.requestId === 'string' ? event.data.requestId : ''
    try {
      if (event.data.type === 'theme') applyTheme(event.data.theme)
      else if (event.data.type === 'open') { await openImage(event.data.dataUrl, event.data.name); reply('openResult', { requestId }) }
      else if (event.data.type === 'export') reply('exportResult', { requestId, dataUrl: exportPng() })
    } catch (error) {
      reply('error', { requestId, message: error instanceof Error ? error.message : String(error) })
    }
  })

  window.addEventListener('load', () => {
    applyTheme('light')
    reply('ready')
  })
})()
