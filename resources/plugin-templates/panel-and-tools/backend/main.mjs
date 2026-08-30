// ModMind 面板+工具插件后端示例。后端经用户确认后作为完全可信 Node 扩展运行。
modmindPlugin.registerTools({
  async summarize_project() {
    const project = await modmindPlugin.ctx.projectInfo()
    if (!project) return { summary: '当前没有打开的项目' }
    return {
      summary: `项目 ${project.name}（${project.kind}）位于 ${project.path}`
    }
  }
})
