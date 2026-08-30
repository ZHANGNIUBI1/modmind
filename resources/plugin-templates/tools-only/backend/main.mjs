// ModMind 插件后端入口示例。
// 宿主会注入全局对象 modmindPlugin，包含：
//   - registerTools(handlers)  注册与 plugin.json 中 backend.tools 对应的处理函数
//   - ctx                      按 permissions 开放的宿主桥（不是 Node 安全沙箱）
//
// 后端经用户确认后是完全可信 Node 代码；以下只是 ctx 的便捷宿主能力：
//   ctx.log.info/warn/error(message)
//   ctx.projectInfo()             -> 项目信息快照（project.read）
//   ctx.storage.get(key) / set(key, value)（storage）
//   ctx.net.fetch(url, init)      （net.fetch）
//   ctx.callTool(toolName, input) 调用同一插件内的其他工具

modmindPlugin.registerTools({
  async echo(input) {
    return { echoed: String(input?.text ?? '') }
  },

  async counter() {
    const current = (await modmindPlugin.ctx.storage.get('count')) ?? 0
    const next = Number(current) + 1
    await modmindPlugin.ctx.storage.set('count', next)
    return { count: next }
  }
})

modmindPlugin.ctx.log.info('tools-only 示例插件后端已启动')
