# 桌面端设备凭据同步需求

## 目标

用户在网页端登录后切换上游模型线路或 API Key，桌面端可以通过现有 `mcdev://` 协议一键同步。桌面端不应接收网页直接传入的明文 API Key；完整 `apiKey` 只能通过桌面端随后调用 `/api/device/poll` 获取。

## 网页接口

登录用户调用：

```http
POST /api/device/sync
```

成功响应：

```json
{
  "success": true,
  "data": {
    "code": "6KQ8W2H5D9M4R7TX",
    "launchUrl": "mcdev://sync?site=https%3A%2F%2Fyour-site.example.com&code=6KQ8W2H5D9M4R7TX",
    "pollUrl": "https://your-site.example.com/api/device/poll",
    "expiresIn": 600
  }
}
```

`launchUrl` 默认使用 `mcdev://` 协议；站点可以通过 `CLIENT_PROTOCOL_SCHEME` 配置协议名。返回的授权码已经绑定当前网页登录用户，不需要再次打开浏览器确认。

未登录时应返回 HTTP `401` 及明确错误信息。除 POST 外的方法应返回 HTTP `405`。

## 桌面端轮询契约

桌面端从 `launchUrl` 读取并校验 `site` 和 `code`，然后调用：

```http
POST {site}/api/device/poll
Content-Type: application/json

{"code":"6KQ8W2H5D9M4R7TX"}
```

成功响应：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "baseUrl": "https://relay.example.com",
    "apiKey": "<desktop credential>",
    "balanceCents": "1234",
    "username": "someuser"
  }
}
```

授权码状态响应：

```json
{"success":true,"data":{"status":"pending"}}
```

或：

```json
{"success":true,"data":{"status":"expired"}}
```

成功返回后授权码必须立即失效，且只能被绑定用户使用。`apiKey` 不得出现在 `launchUrl`、网页重定向 URL、日志或错误响应中。

## 安全与兼容性要求

- `code` 使用大写字母和数字，长度 6–16，单次使用，有效期由 `expiresIn` 指定，建议不超过 600 秒。
- `site` 必须是当前站点 origin；客户端会拒绝跨站点深链。
- `launchUrl` 的协议名必须与桌面客户端注册的协议一致。
- `pollUrl` 仅用于诊断和兼容性展示，桌面端以深链中的 `site` 拼接 `/api/device/poll` 为准。
- 同步成功后，桌面端会安全覆盖本地设备凭据，并重新建立需要设备鉴权的连接。

