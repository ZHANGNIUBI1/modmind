# 远程控制网页端 & 中继服务端需求（安卓 TWA 壳配套）

背景：桌面 ModMind 已经实现 Remote WebSocket v2 设备端（`RemoteClientService`，
连接 `wss://ether-studio.top/ws/remote`，协议见
`docs/desktop-remote-control-integration(1).md`）。我们计划用 TWA 壳把网页端包装成
安卓 App，因此需要网页端和中继服务端做以下配合。

优先级：**P0 = 不做就无法出可用的 App；P1 = 首版体验需要；P2 = 后续增强。**

---

## 网页端（ether-studio.top）

### 1. [P0] PWA manifest

新增 `manifest.webmanifest` 并在页面 `<head>` 引用：

```json
{
  "name": "Ether Studio",
  "short_name": "Ether Studio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0B0F14",
  "theme_color": "#0B0F14",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

图标源文件可从仓库 `logo.png` 提供。`display: standalone` 是 App 内去掉浏览器地址栏
的关键。

### 2. [P0] Digital Asset Links

部署 `https://ether-studio.top/.well-known/assetlinks.json`
（Content-Type: `application/json`，200 状态码，无重定向）：

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "top.etherstudio.remote",
    "sha256_cert_fingerprints": ["<由客户端提供，冒号分隔 SHA-256>"]
  }
}]
```

指纹来自我们的签名 keystore，出包后提供（debug 与 release 各一个）。此文件上线后
平时不再变动，仅在未来更换签名密钥时更新。

### 3. [P0] 控制页移动端适配

用手机 Chrome 打开现有站点自查一遍是第一步。要求：

- viewport meta 正确，无横向滚动；
- 聊天输入框在软键盘弹出时保持可见（visualViewport 或 `interactive-widget` 处理）；
- 触摸目标 ≥ 44px；进度流/长文本在窄屏可读；
- 任务进行中给出可见状态（页面标题前缀如 `(2/3) 构建中…`，便于任务切换器辨识）。

这是工作量最大、也最依赖现状的一条，请先评估再排期。

### 4. [P1] Web Push 订阅流程

前端接入 Service Worker + PushManager 订阅（VAPID 公钥由服务端提供，见服务端需求
2），并把订阅对象上报给中继服务端。注意：国内 ROM 上 Google 服务框架缺失时 Web Push
送达率不可靠，首版接受降级——用户发完任务保持亮屏即可，推送作为尽力而为的增强。
若后续确认国内送达率不可接受，再讨论原生壳 + 厂商通道方案。

---

## 中继服务端（/ws/remote 所在后端）

### 1. [P1] 任务完成时触发 Web Push

服务端已经全程掌握任务生命周期：收到设备的 `device.activity` / `device.response`
帧即意味着进度与终态。要求：

- 生成并保管 VAPID 密钥对，向前端暴露公钥；
- 在收到某用户任务的 `device.response`（COMPLETED 或 FAILED）时，向该用户所有有效
  的 Web Push 订阅发送通知（标题含项目名/结果，正文取 response.text 前 ~100 字）;
- 用户打开页面后清理失效订阅（410 响应）。

### 2. [P2] 移动设备类型支持（可选）

协议里 `device.hello.deviceType` 目前只有 `DESKTOP` / `CLI`。如果未来想让手机也以
设备身份直连（局域网直连方案的预留位），需要服务端放行新的枚举值（如 `MOBILE`）
并在每账号 1 台设备的限制上明确策略。当前 TWA 方案不依赖这一条，仅提前登记。

---

## 明确不需要做的

- 桌面端零改动：远程开关、鉴权、协议保持现状。
- 不需要为 App 单独开 API 或鉴权体系：App 就是浏览器环境，Cookie 登录态自动生效。
- assetlinks.json 上线后无需日常维护；manifest 只在改名称/图标/主题色时更新。
