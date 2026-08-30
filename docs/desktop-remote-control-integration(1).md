# Remote WebSocket v2 - 桌面端开发交接文档

## 结论

Remote 实时传输已改为 WebSocket。桌面端不要再调用原来的 HTTP 注册、轮询、状态回传和命令查询接口；这些接口现在返回 HTTP 410。

桌面端需要实现一个长期连接的 Agent 通道：

1. 使用当前有效的 ModMinds 接入 Key 完成 WebSocket 鉴权。
2. 接收网页用户发来的 Agent 任务和取消请求。
3. 执行过程中持续回传可读进度。
4. 执行结束后回传最终文本、结构化结果或错误。

每个用户最多注册并同时连接 1 台设备。不要为同一账号并行启动多个 Remote 客户端。

## 地址与版本

- 生产地址：`wss://ether-studio.top/ws/remote`
- 本地地址：`ws://127.0.0.1:<port>/ws/remote`
- 协议版本：`2`
- 编码：UTF-8 JSON 文本帧
- 首条认证消息超时：10 秒
- 服务端 WebSocket Ping 间隔：30 秒，客户端库应自动回复 Pong

## 设备认证

建立 WebSocket 后，第一条消息必须是 `device.hello`：

```json
{
  "type": "device.hello",
  "credential": "用户当前有效的 ModMinds 接入 Key",
  "deviceId": "本机稳定且唯一的设备 ID",
  "deviceName": "工作室电脑",
  "deviceType": "DESKTOP",
  "clientVersion": "2.0.0"
}
```

字段要求：

| 字段 | 必填 | 限制 |
| --- | --- | --- |
| `credential` | 是 | 1-1024 字符，不得写入日志 |
| `deviceId` | 是 | 1-100 字符，同一台机器必须长期保持一致 |
| `deviceName` | 是 | 1-100 字符 |
| `deviceType` | 否 | `DESKTOP` 或 `CLI`，默认 `DESKTOP` |
| `clientVersion` | 否 | 最多 100 字符 |

鉴权成功后服务端返回：

```json
{
  "type": "server.ready",
  "role": "device",
  "protocolVersion": 2,
  "deviceId": "device-id",
  "limits": {
    "frameBytes": 131072,
    "activityChars": 2000,
    "resultChars": 20000,
    "activityPerMinute": 60
  }
}
```

收到 `server.ready` 前不要开始处理业务消息。

## 接收网页请求

### Agent 任务

服务端向桌面 Agent 发送：

```json
{
  "type": "server.command",
  "requestId": "数据库生成的请求 ID",
  "text": "帮我检查当前项目为什么无法构建",
  "metadata": {},
  "createdAt": "2026-08-17T09:00:00.000Z"
}
```

网页消息统一作为 Agent 任务处理，不再区分 `chat` 与 `generate`。旧版 `CHAT / GENERATE / PING` 命令枚举不再用于桌面协议；心跳只使用 WebSocket 原生 Ping/Pong，不发送应用层 ping JSON。

### 取消任务

```json
{
  "type": "server.cancel",
  "requestId": "本次取消命令的 ID",
  "targetRequestId": "需要取消的原任务 ID",
  "createdAt": "2026-08-17T09:00:10.000Z"
}
```

桌面端应使用 `targetRequestId` 查找并取消对应任务。取消动作本身也需要用本消息的 `requestId` 回传执行结果。

## 回传执行进度

执行过程中发送 `device.activity`。这就是网页用户了解 Agent 当前在做什么的主要协议：

```json
{
  "type": "device.activity",
  "requestId": "正在执行的请求 ID",
  "text": "正在读取构建日志并定位第一个 TypeScript 错误",
  "state": "RUNNING",
  "progress": 0.35
}
```

字段说明：

- `requestId` 可省略，用于不属于具体任务的设备状态。
- `text` 必填，最多 2,000 字符，超限消息会被拒绝。
- `state`：`IDLE`、`RUNNING`、`COMPLETED` 或 `FAILED`，默认 `RUNNING`。
- `progress` 可省略，存在时必须在 `0` 到 `1` 之间。
- 每台设备每分钟最多发送 60 条活动消息。

服务端接收成功后回复：

```json
{
  "type": "activity.ack",
  "requestId": "请求 ID",
  "receivedAt": "2026-08-17T09:00:02.000Z"
}
```

建议仅在工作阶段发生变化时回传，不要把每个 token、日志行或文件块作为一条活动消息。

## 回传最终结果

### 成功

```json
{
  "type": "device.response",
  "requestId": "请求 ID",
  "status": "COMPLETED",
  "text": "已修复构建错误并完成验证。",
  "result": {
    "filesChanged": ["src/example.ts"],
    "testsPassed": 12
  }
}
```

### 失败

```json
{
  "type": "device.response",
  "requestId": "请求 ID",
  "status": "FAILED",
  "error": "构建依赖下载失败，无法继续"
}
```

限制：

- `text` 最多 20,000 字符。
- `error` 最多 20,000 字符。
- `text` 与 `result` 组成的 JSON 序列化内容最多 20,000 字符。
- 单个 WebSocket 帧最多 128 KiB。

服务端接收成功后回复：

```json
{
  "type": "response.ack",
  "requestId": "请求 ID"
}
```

收到 ACK 前可以保留待发送结果。断线重连后是否重发由桌面端决定；重复回传同一个 `requestId` 时，应以最后一次终态为准。

## 错误协议

服务端业务错误统一为：

```json
{
  "type": "server.error",
  "code": "RESULT_TOO_LARGE",
  "message": "结果回传最多 20000 字符",
  "requestId": "可选的请求 ID"
}
```

常见错误：

| `code` | 含义 |
| --- | --- |
| `AUTH_TIMEOUT` | 10 秒内没有发送认证消息 |
| `AUTH_FAILED` | Key、账号、Remote 权限或设备限制校验失败 |
| `REMOTE_DISABLED` | 用户关闭了 Remote 权限 |
| `INVALID_MESSAGE` | JSON、字段、消息方向或长度不合法 |
| `RESULT_TOO_LARGE` | 最终结果超过字符限制 |
| `DEVICE_OFFLINE` | 仅网页端会收到，表示桌面 Agent 未连接 |

连接关闭码：

| 关闭码 | 含义 |
| --- | --- |
| `4001` | 认证超时 |
| `4003` | 认证失败 |
| `4004` | Remote 权限被关闭 |

## 连接与重连

推荐状态机：

```text
DISCONNECTED
  -> CONNECTING
  -> AUTHENTICATING (发送 device.hello)
  -> READY (收到 server.ready)
  -> DISCONNECTED (close/error/心跳超时)
```

重连建议：

1. 首次断线等待 1 秒。
2. 按 2、4、8、15 秒指数退避。
3. 最大间隔固定为 15 秒。
4. `4003` 认证失败时不要无限重试，应提示用户重新连接账号。
5. `4004` 权限关闭时停止重试，直到用户重新启用 Remote。

## 最小客户端伪代码

```ts
const socket = new WebSocket("wss://ether-studio.top/ws/remote");

socket.onopen = () => {
  socket.send(JSON.stringify({
    type: "device.hello",
    credential: currentAccessKey,
    deviceId: stableDeviceId,
    deviceName: localDeviceName,
    deviceType: "DESKTOP",
    clientVersion: appVersion,
  }));
};

socket.onmessage = async (event) => {
  const message = JSON.parse(String(event.data));
  if (message.type === "server.ready") {
    setRemoteReady(true);
    return;
  }
  if (message.type === "server.cancel") {
    await cancelTask(message.targetRequestId);
    socket.send(JSON.stringify({
      type: "device.response",
      requestId: message.requestId,
      status: "COMPLETED",
      text: "取消请求已处理",
    }));
    return;
  }

  if (message.type !== "server.command") return;

  try {
    const result = await runAgent(message.text, {
      onActivity(text, progress) {
        socket.send(JSON.stringify({
          type: "device.activity",
          requestId: message.requestId,
          text,
          state: "RUNNING",
          progress,
        }));
      },
    });
    socket.send(JSON.stringify({
      type: "device.response",
      requestId: message.requestId,
      status: "COMPLETED",
      text: result.summary,
      result: result.data,
    }));
  } catch (error) {
    socket.send(JSON.stringify({
      type: "device.response",
      requestId: message.requestId,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Agent 执行失败",
    }));
  }
};
```

## 已停用的旧接口

以下接口不要再接入：

- `POST /api/remote/register`
- `GET /api/remote/poll`
- `POST /api/remote/status`
- `GET/POST /api/remote/commands`

网页中的启用、关闭和 2FA 验证仍然使用 `/api/remote/settings`，桌面端不需要调用这些设置接口。

## 桌面端验收清单

- 使用有效 Key 能收到 `server.ready`。
- 无效 Key、禁用 Remote、被封禁账号会被拒绝。
- 同一账号第二台设备无法上线。
- `server.command` 能进入统一的 Agent 执行流程。
- `server.cancel` 能终止对应 `targetRequestId`。
- 网页能实时看到 `device.activity`。
- 超过 2,000 字符的活动消息被客户端提前截断或拒绝发送。
- 超过 20,000 字符的结果被客户端压缩或拆成摘要后再发送。
- 断网后按退避策略重连，恢复后重新发送 `device.hello`。
- 客户端退出时正常关闭 WebSocket，网页在一个心跳周期内显示离线。
