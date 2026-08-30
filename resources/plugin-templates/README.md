# ModMind 插件模板

四个模板目录：

| 目录 | 形态 | 演示内容 |
|---|---|---|
| `panel-only/` | 仅侧边栏面板 | 沙箱 iframe、ready 握手、getProjectInfo、日志 |
| `tools-only/` | 仅后端工具 | registerTools、storage 键值存储、MCP 注册 |
| `panel-and-tools/` | 面板 + 后端工具 | 面板经宿主中转 invokeTool 调用本插件后端 |
| `overlay-pet/` | 跨页面悬浮界面 | 应用内常驻、透明桌面窗口、主题与开发日志 |

制作插件时，把对应模板复制为 `<id>/` 目录（id 用小写字母数字连字符），修改
`plugin.json` 的 id/name/description，再按需编辑 panel 与 backend 代码。
保存后 ModMind 会自动热重载。

插件后端经用户确认后作为完全可信的 Node 扩展运行，可以直接访问本机文件、网络和进程。`permissions` 只声明通过 ModMind 宿主桥使用的能力，不是安全沙箱。

详细规范见 `docs/plugin-development.zh-CN.md`。

工作台的插件制作工具只允许在插件自身目录新增或修改文件；插件后端本身拥有完整 Node 权限。
