# ChatableX Web SDK

[![license](https://img.shields.io/npm/l/chatablex-web-sdk.svg?style=flat-square)](https://github.com/chatablex/chatablex-web-sdk/blob/main/package.json)
[![npm version](https://img.shields.io/npm/v/chatablex-web-sdk.svg?style=flat-square)](https://www.npmjs.com/package/chatablex-web-sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/chatablex/chatablex-web-sdk/ci.yml?branch=main&label=Build%20%26%20Test&logo=github)](https://github.com/chatablex/chatablex-web-sdk/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/chatablex/chatablex-web-sdk/pulls)

**[English](README.md)** | 简体中文

**用于构建 ChatableX AI App WebUI 扩展的官方运行时 SDK。**

`chatablex-web-sdk` 是将你的 Web 应用连接到 **ChatableX 桌面客户端**（Flutter WebView 宿主）的官方 JavaScript/TypeScript 库。它不是纯类型包，而是包含真实桥接运行时：RPC 请求/响应、事件订阅、工具执行回调。

你的 WebUI 运行在 WebView 中。许多能力——原生对话框、文件选择、与会话对齐的存储、走宿主 AI 管线的对话——仅靠浏览器 API 难以实现或体验不一致。本 SDK 将它们封装为带类型的 Promise API。

---

## 目录

- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [项目配置](#项目配置)
- [架构说明](#架构说明)
- [核心概念：工具执行](#核心概念工具执行)
- [API 参考](#api-参考)
  - [ChatableX（入口）](#chatablex入口)
  - [sdk.tool](#sdktool)
  - [sdk.events](#sdkevents)
  - [sdk.ai](#sdkai)
  - [sdk.ui](#sdkui)
  - [sdk.storage](#sdkstorage)
  - [sdk.tools](#sdktools)
  - [sdk.platform](#sdkplatform)
  - [sdk.auth](#sdkauth)
- [事件参考](#事件参考)
- [权限声明](#权限声明)
- [宿主能力矩阵](#宿主能力矩阵)
- [本地开发](#本地开发)
- [框架集成](#框架集成)
- [TypeScript 类型](#typescript-类型)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)
- [官方示例](#官方示例)
- [版本说明](#版本说明)
- [许可证](#许可证)

---

## 环境要求

| 要求 | 说明 |
|------|------|
| **ChatableX 客户端** | 支持 WebView 桥接的桌面应用（Flutter 宿主） |
| **扩展模式** | `manifest.json` 中 `execution_mode: "webapp"` |
| **Node.js** | ≥ 16（用于构建 WebUI） |
| **构建产物** | `webui.entry` 须指向 `./dist/index.html`（Vite 或同类工具） |
| **SDK 安装** | **必须** `npm install chatablex-web-sdk`——宿主**不会**自动注入 SDK |

平台从你的扩展中消费两样东西：

1. **构建产物**：`chatablex.webapp.webui.entry` 指向的文件（通常为 `./dist/index.html`）
2. **桥接调用**：通过本 SDK（`ChatableX.init`、`sdk.tool.onExecute` 等）

---

## 安装

```bash
npm install chatablex-web-sdk
```

在 monorepo 中本地联调：

```bash
npm install ../chatablex-web-sdk
# 或
npm install file:../chatablex-web-sdk
```

**包导出**（ESM + CJS + TypeScript 声明）：

```ts
import { ChatableX } from 'chatablex-web-sdk';
import type { ChatableXSDK, ToolResult, ChatResponse } from 'chatablex-web-sdk';
```

---

## 快速开始

最小集成——在 WebUI 中响应 LLM 工具调用：

```ts
import { ChatableX } from 'chatablex-web-sdk';

async function main() {
  const sdk = await ChatableX.init({
    appId: 'my-counter-app',  // 须与 manifest.json 的 "id" 一致
    debug: true,
  });

  sdk.tool.onExecute(async (params) => {
    const { action, value } = params;

    if (action === 'increment') {
      const next = (Number(value) || 0) + 1;
      return { success: true, data: { value: next } };
    }

    return { success: false, error: `Unknown action: ${action}` };
  });
}

main().catch(console.error);
```

**你不需要用到每一个模块。** 生产环境的最小集成通常只需 `sdk.tool`。按需添加 `sdk.storage`、`sdk.events`、`sdk.ui` 等。

---

## 项目配置

### manifest.json（webapp 扩展）

```json
{
  "id": "my-counter-app",
  "name": "Counter App",
  "version": "1.0.0",
  "type": "app",
  "execution_mode": "webapp",
  "return_direct": true,
  "permissions": ["notification"],
  "tools": [
    {
      "name": "counter_control",
      "description": "控制计数器组件",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": { "type": "string", "enum": ["increment", "decrement", "get"] },
          "value": { "type": "number" }
        },
        "required": ["action"]
      }
    }
  ],
  "chatablex": {
    "webapp": {
      "webui": {
        "entry": "./dist/index.html"
      }
    }
  }
}
```

| 字段 | 规则 |
|------|------|
| `id` | 必须等于 `ChatableX.init({ appId })` |
| `execution_mode` | 必须为 `"webapp"` |
| `webui.entry` | 相对路径 → 本地 HTTP 服务；`https://` → 远程 URL |
| `tools[]` | 声明 LLM 可调用的函数；宿主将参数转发给 `sdk.tool.onExecute` |
| `permissions` | 控制宿主侧 API 访问——见[权限声明](#权限声明) |

### package.json 脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "chatablex-web-sdk": "^1.0.0"
  }
}
```

发布前执行 `npm run build`。ChatableX 客户端加载的是 `dist/index.html`，而非开发服务器（除非你配置了远程 `webui.entry` URL）。

### 推荐项目结构

```
my-app/
├── manifest.json          # 扩展元数据
├── package.json
├── index.html             # Vite 入口 HTML
├── src/
│   ├── main.ts            # ChatableX.init() + 应用启动
│   ├── app.ts             # UI 逻辑
│   └── bridge.ts          # 可选：工具路由辅助
├── dist/                  # 构建产物（宿主加载）
│   └── index.html
└── vite.config.ts
```

---

## 架构说明

```
┌──────────────────────────────────────────────────────────────┐
│  你的 Web 应用（React / Vue / Svelte / 原生 JS）              │
│    import { ChatableX } from 'chatablex-web-sdk'             │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  chatablex-web-sdk                                           │
│                                                              │
│  Bridge（RPC + 事件）                                         │
│    JS → 宿主 : window.ChatableXBridge.postMessage(JSON)      │
│    宿主 → JS : window.ChatableXReceive(JSON)                 │
│                                                              │
│  模块：tool · events · ai · ui · storage · tools ·           │
│        tools · platform                                      │
└────────────────────────────┬─────────────────────────────────┘
                             │  WebView JavaScriptChannel
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  ChatableX Flutter 客户端                                    │
│    聊天 UI · SSE 流 · Agent 图 · SQLite 存储                  │
└──────────────────────────────────────────────────────────────┘
```

### 桥接协议

**请求（JS → Flutter）：**

```json
{
  "id": "ctx_1_1718200000000",
  "method": "storage.get",
  "params": { "key": "filters" },
  "timestamp": 1718200000000
}
```

**响应（Flutter → JS）：**

```json
{
  "type": "response",
  "id": "ctx_1_1718200000000",
  "success": true,
  "data": { "projectId": "p1" }
}
```

**事件推送（Flutter → JS）：**

```json
{
  "type": "event",
  "eventType": "toolExecution",
  "data": { "action": "increment", "_requestId": "texec_1_...", "_toolName": "counter_control" }
}
```

**工具结果（JS → Flutter，即发即忘）：**

```json
{
  "method": "tool.executeResult",
  "params": {
    "_requestId": "texec_1_...",
    "success": true,
    "data": { "value": 42 }
  }
}
```

> `tool.executeResult` **不使用** RPC 的 `id` 字段。宿主通过 `_requestId` 关联结果。这是因为 WebView 的 `evaluateJavaScript` 无法 await Promise。

### 初始化流程

1. 你的 bundle 在 WebView 中加载。
2. 调用 `ChatableX.init({ appId })`。
3. SDK 安装 `window.ChatableXReceive`。
4. SDK 等待 `window.ChatableXBridge`（由 Flutter 设置）。
5. SDK 发送 `sdk_init` 握手 → 宿主返回工具元数据。
6. SDK 暴露 `window.ChatableX` 并返回 `sdk` 对象。

---

## 核心概念：工具执行

这是 AI App 的**主要集成路径**。当 LLM 调用你的工具时，宿主将参数推入 WebUI 并等待结果。

```
LLM（Agent）         Flutter 宿主              你的 WebUI（SDK）
     │                     │                          │
     │  frontend_tool_call │                          │
     │────────────────────>│                          │
     │                     │  event: toolExecution    │
     │                     │  { ...args, _requestId } │
     │                     │─────────────────────────>│
     │                     │                          │ onExecute(params)
     │                     │                          │  → 你的业务逻辑
     │                     │  tool.executeResult      │
     │                     │<─────────────────────────│
     │  tool-result POST   │                          │
     │<────────────────────│                          │
     │  Agent 继续推理      │                          │
```

### 处理器契约

```ts
sdk.tool.onExecute(async (params) => {
  // params 包含 LLM 参数 + 宿主元数据：
  //   _toolName  — 被调用的 manifest 工具名（string）
  //   _requestId — 关联 ID（string，由宿主设置）

  return {
    success: true,           // 必填
    data: { /* 任意 */ },     // 可选，返回给 LLM
    error: '原因',            // 可选，success 为 false 时
  };
});
```

| 返回字段 | 类型 | 说明 |
|----------|------|------|
| `success` | `boolean` | 操作是否成功 |
| `data` | `unknown` | 传给 LLM / 会话的载荷（任意可 JSON 序列化的值） |
| `error` | `string` | `success: false` 时的可读错误信息 |

**规则：**

- 通过 `onExecute` 注册**一个**处理器。再次调用会**覆盖**之前的处理器。
- 处理器抛出的异常会被捕获并转为 `{ success: false, error: message }`。
- 未注册处理器时，宿主收到 `{ success: false, error: 'No execute handler registered' }`。
- 多工具扩展务必按 `params._toolName` 路由（参考下方示例）。
- 若 30 秒内未收到 `tool.executeResult`，宿主会超时。

### 多工具路由示例

```ts
sdk.tool.onExecute(async (params) => {
  const toolName = typeof params._toolName === 'string' ? params._toolName : '';

  switch (toolName) {
    case 'counter_control':
      return handleCounter(params);
    case 'export_data':
      return handleExport(params);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
});
```

---

## API 参考

### ChatableX（入口）

#### `ChatableX.init(config): Promise<ChatableXSDK>`

初始化 SDK 并连接 Flutter 宿主。

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `appId` | `string` | — | **必填。** 须与 `manifest.json` 的 `id` 一致。 |
| `debug` | `boolean` | `false` | 将桥接日志输出到 `console`。 |
| `timeout` | `number` | `10000` | 等待 `ChatableXBridge` 的超时时间（毫秒）。 |

返回单例。后续 `init()` 调用返回同一实例（以首次 `appId` 为准）。

若在 `timeout` 内 `ChatableXBridge` 不可用则抛出异常。

#### `ChatableX.getInstance(): ChatableXSDK`

返回当前实例。若尚未调用 `init()` 则抛出异常。

#### `ChatableX.isReady(): boolean`

首次 `init()` 成功后为 `true`。

#### `ChatableX.version: string`

当前 SDK 版本（如 `"1.0.0"`）。

---

### `sdk.tool`

注册并查询扩展的工具执行处理器。

| 方法 | 签名 | 说明 |
|------|------|------|
| `onExecute` | `(handler) => void` | 注册 LLM 工具处理器。**webapp 扩展必填。** |
| `getInfo` | `() => ToolInfo` | 握手后由宿主填充的元数据（`id`、`name`、`version`、`description`）。 |

```ts
const info = sdk.tool.getInfo();
// { id: 'my-app', name: 'My App', version: '1.0.0', description: '...' }
```

---

### `sdk.events`

订阅宿主推送的事件。每次订阅也会向宿主发送 `events.subscribe`，告知宿主需要转发对应事件。

| 方法 | 说明 |
|------|------|
| `on(eventType, callback)` | 通用订阅。返回 `unsubscribe` 函数。 |
| `onAiResponse(callback)` | `'aiResponse'` 的简写。 |
| `onToolExecution(callback)` | `'toolExecution'` 的简写。 |
| `onUserMessage(callback)` | `'userMessage'` 的简写。 |

```ts
const unsub = sdk.events.on('streamingContent', ({ content, finished }) => {
  appendToken(content);
  if (finished) setLoading(false);
});

// 组件卸载时清理
unsub();
```

> **注意：** `unsubscribe()` 仅移除本地监听器。当前 SDK 版本不会通过 `events.unsubscribe` 通知宿主。

---

### `sdk.ai`

从 WebUI 调用宿主的 AI 管线。须在 `manifest.json` 中声明 `ai_chat` 权限。

| 方法 | 签名 | 说明 |
|------|------|------|
| `chat` | `(message, options?) => Promise<ChatResponse>` | 通过宿主 AI 栈发送消息。 |
| `chatStream` | `(message, options?) => Promise<unknown>` | 发起流式对话。Token 通过 `sdk.events.on('streamingContent')` 推送。 |
| `getContext` | `() => Promise<SessionContext>` | 获取当前会话元数据和消息列表。 |

```ts
const reply = await sdk.ai.chat('总结最近三条消息', {
  sessionId: '可选覆盖',
  stream: false,
});

const ctx = await sdk.ai.getContext();
console.log(ctx.messages.length, ctx.activeTools);
```

**`ChatOptions`：** `sessionId`、`context`、`tools`、`skills`、`stream`。

---

### `sdk.ui`

从 WebUI 驱动宿主原生 UI。

| 方法 | 签名 | 权限 | 说明 |
|------|------|------|------|
| `showNotification` | `(message, type?) => Promise<void>` | `notification` | 吐司：`info` \| `success` \| `warning` \| `error`。 |
| `showConfirm` | `(title, message) => Promise<boolean>` | — | 原生确认框。确认返回 `true`。 |
| `pickFile` | `(options?) => Promise<string \| null>` | `file_access` | 打开原生文件选择器。取消返回 `null`。 |
| `openTab` | `(config) => Promise<void>` | — | 请求在宿主中打开新标签页。 |
| `updateState` | `(state) => Promise<void>` | — | 通知宿主刷新 UI（如 `{ refreshMessages: true }`）。 |

```ts
const ok = await sdk.ui.showConfirm('删除', '此操作不可撤销。');
if (!ok) return;

await sdk.ui.showNotification('已保存', 'success');
await sdk.ui.updateState({ refreshMessages: true });
```

**`FilePickerOptions`：** `type`（`any` \| `image` \| `video` \| `audio` \| `custom`）、`multiple`、`allowedExtensions`。

**`TabConfig`：** `id`、`title`、`type`（`chat` \| `tool` \| `skill` \| `custom`），可选 `icon`、`data`。

> **仅宿主支持：** `ui.saveFile`（原生另存为对话框）已在 Flutter 宿主实现，但尚未封装到本 SDK。高级集成可通过原始 `ChatableXBridge.postMessage` 调用。

---

### `sdk.storage`

由宿主持久化的键值存储（SQLite，按工具隔离）。需要数据在 WebView 重置后保留、或与桌面端对齐时，应使用此模块而非 `localStorage`。

| 方法 | 签名 | 说明 |
|------|------|------|
| `get` | `<T>(key) => Promise<T \| null>` | 读取值。不存在时返回 `null`。 |
| `set` | `<T>(key, value) => Promise<void>` | 写入可 JSON 序列化的值。 |
| `delete` | `(key) => Promise<void>` | 删除键。 |

```ts
const KEY = 'my-app:draft';

await sdk.storage.set(KEY, { title: '草稿', nodes: [] });
const draft = await sdk.storage.get<{ title: string }>(KEY);
await sdk.storage.delete(KEY);
```

存储键在宿主侧按工具实例隔离。

---

### `sdk.tools`

从 WebUI 列举并调用**其他**平台工具。

| 方法 | 签名 | 说明 |
|------|------|------|
| `list` | `() => Promise<ToolInfo[]>` | 列出可用工具。 |
| `execute` | `(toolId, params) => Promise<ToolResult>` | 立即调用工具。 |
| `executeWithConfirm` | `(toolId, params) => Promise<ToolResult>` | 经宿主确认框后调用。 |

```ts
const tools = await sdk.tools.list();
const result = await sdk.tools.execute('fetch-doc', { url: 'https://...' });
if (!result.success) throw new Error(result.error);
```

> 指令型扩展（`execution_mode: "skill"`）通过在对话中激活并注入系统提示词使用，不再有单独的 SDK 模块。若 WebUI 需编排其他扩展，请用 `sdk.tools`。

---

### `sdk.platform`

平台级工具方法。

| 方法 | 签名 | 说明 |
|------|------|------|
| `openInBrowser` | `(targetUrl) => Promise<void>` | 在系统浏览器中打开 URL，并传递鉴权信息。 |

```ts
await sdk.platform.openInBrowser('https://docs.example.com/guide');
```

`targetUrl` 为空或仅空白字符时抛出异常。

---

### `sdk.auth`

面向**所有** WebUI 应用的统一鉴权入口。在宿主（Flutter WebView）环境下，它会
透明复用桌面端的登录态——你的应用**无需编写任何登录/Token 代码**，只需调用
`getAuthHeaders()` 并附加到 `fetch` 即可。

| 方法 | 签名 | 说明 |
|------|------|------|
| `getToken` | `() => Promise<AuthTokenData \| null>` | 取有效 Token（内存缓存，按需刷新）；未登录返回 `null`。 |
| `getAuthHeaders` | `() => Promise<Record<string,string>>` | 返回 `{ Authorization: "Bearer <token>" }`，未登录则返回 `{}`。 |
| `getUserId` | `() => string \| null` | 当前登录用户 id（同步，仅读缓存）。 |
| `isAuthenticated` | `() => boolean` | 是否已缓存有效 Token（同步）。 |
| `refresh` | `() => Promise<boolean>` | 强制经宿主刷新；并发调用合并为一次（single-flight）。 |

```ts
// 给任意需要鉴权的请求附加宿主登录态——无需任何登录代码。
const res = await fetch('https://api.example.com/scenes', {
  headers: {
    'Content-Type': 'application/json',
    ...(await sdk.auth.getAuthHeaders()),
  },
});

if (!sdk.auth.isAuthenticated()) {
  // 未登录 / 非 WebView——禁用需要鉴权的功能
}

// 后端返回 401 时，强制刷新并重试一次：
if (res.status === 401 && (await sdk.auth.refresh())) {
  // 用 await sdk.auth.getAuthHeaders() 重试
}
```

**行为与保证**

- **Token 仅存内存。** `refresh_token` 永不经过 bridge。
- **下发前刷新。** 宿主在 Token 过期或临近过期时会先刷新再下发，正常情况下你
  不会拿到过期 Token。
- **安全降级。** 在非 WebView 或宿主未登录时，`getAuthHeaders()` 返回 `{}` 且
  不抛异常。
- **Provider 可插拔。** 目前仅接入 `HostAuthProvider`（WebView）；未来的浏览器/
  统一登录 provider 可无缝替换，消费方代码无需改动。

---

## 事件参考

| 事件 | 载荷 | 触发时机 |
|------|------|----------|
| `toolExecution` | `{ toolCall, result? }` 或原始参数 + `_requestId` | LLM 调用工具；也用于内部 `onExecute` 分发 |
| `aiResponse` | `ChatResponse` | 宿主会话中 AI 回复完成 |
| `streamingContent` | `{ content, finished? }` | 流式生成过程中的 token/片段 |
| `userMessage` | `{ message, timestamp }` | 用户在主聊天窗口发送消息 |
| `close` | `{ toolId }` | WebUI 即将关闭 |

在事件触发前完成订阅。在框架清理钩子（`useEffect` 返回、`onUnmounted` 等）中调用返回的 `unsubscribe()`。

---

## 权限声明

在 `manifest.json` → `permissions[]` 中声明。宿主会拒绝未授权的 API 调用。

| manifest 值 | 受控 SDK API | 说明 |
|-------------|--------------|------|
| `ai_chat` | `sdk.ai.*` | 访问宿主 AI 管线 |
| `file_access` | `sdk.ui.pickFile` | 原生文件选择器 |
| `notification` | `sdk.ui.showNotification` | 系统通知 |
| `network` | （宿主级） | 扩展的网络访问 |
| `system_command` | （宿主级） | 执行系统命令 |

被拒绝时，RPC 调用会以 `Error: Permission denied: <permission>` 拒绝。

---

## 宿主能力矩阵

SDK 方法是薄 RPC 封装。部分宿主处理器已完整实现，部分返回 stub。请据此规划扩展功能。

| SDK 方法 | 宿主状态 | 说明 |
|----------|----------|------|
| `sdk.tool.onExecute` | **生产可用** | 核心路径，完整支持 |
| `sdk.storage.*` | **生产可用** | 按工具隔离的 SQLite |
| `sdk.ui.showNotification` | **生产可用** | 需要 `notification` |
| `sdk.ui.showConfirm` | **生产可用** | |
| `sdk.ui.pickFile` | **生产可用** | 需要 `file_access` |
| `sdk.ui.updateState` | **生产可用** | 委托给宿主 |
| `sdk.platform.openInBrowser` | **生产可用** | 鉴权传递 |
| `sdk.auth.*` | **生产可用** | 宿主态：经 `host.getAuthToken` 复用桌面登录（下发前刷新） |
| `sdk.ai.chat` | **生产可用** | 需要 `ai_chat` + delegate |
| `sdk.ai.getContext` | **部分实现** | 返回最小上下文 |
| `sdk.ai.chatStream` | **部分实现** | 返回 `{ streaming: true }`；token 走事件 |
| `sdk.events.*` | **生产可用** | |
| `sdk.tools.list` | **Stub** | 返回 `[]` |
| `sdk.tools.execute` | **Delegate** | 需要宿主 delegate |
| `sdk.ui.openTab` | **Stub** | 返回成功，无实际操作 |
| `ui.saveFile`（原始调用） | **生产可用** | 仅宿主——尚未封装到 SDK |

---

## 本地开发

WebUI 应能在普通浏览器中开发 UI。检测宿主环境，不在 ChatableX 内时跳过 SDK 初始化。

```ts
function isInsideChatableX(): boolean {
  return typeof window.ChatableXBridge === 'object' && window.ChatableXBridge !== null;
}

async function bootstrap() {
  if (isInsideChatableX()) {
    const sdk = await ChatableX.init({ appId: 'my-app', debug: true });
    sdk.tool.onExecute(handleTool);
  } else {
    console.log('不在 ChatableX 内运行 — SDK 未激活');
    // 使用 mock、本地状态或手动测试触发器
  }

  mountApp();
}
```

**建议：**

- 用 `npm run dev`（Vite）在浏览器中快速迭代。
- 用 `npm run build` + 在 ChatableX 中加载做集成测试。
- 宿主通过 `http://127.0.0.1:<端口>/` 为本地扩展提供 `dist/` 服务。
- 开发时设置 `debug: true` 查看桥接日志。

---

## 框架集成

### React

```tsx
import { useEffect, useRef } from 'react';
import { ChatableX, type ChatableXSDK } from 'chatablex-web-sdk';

export function useChatableX(appId: string) {
  const sdkRef = useRef<ChatableXSDK | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubStream: (() => void) | undefined;

    (async () => {
      if (!window.ChatableXBridge) return;
      const sdk = await ChatableX.init({ appId });
      if (cancelled) return;
      sdkRef.current = sdk;

      sdk.tool.onExecute(async (params) => {
        // 处理工具调用
        return { success: true };
      });

      unsubStream = sdk.events.on('streamingContent', (data) => {
        // 更新状态
      });
    })();

    return () => {
      cancelled = true;
      unsubStream?.();
    };
  }, [appId]);

  return sdkRef;
}
```

### Vue 3

```ts
import { onMounted, onUnmounted, shallowRef } from 'vue';
import { ChatableX, type ChatableXSDK } from 'chatablex-web-sdk';

export function useChatableX(appId: string) {
  const sdk = shallowRef<ChatableXSDK | null>(null);
  let unsub: (() => void) | undefined;

  onMounted(async () => {
    if (!window.ChatableXBridge) return;
    sdk.value = await ChatableX.init({ appId });
    sdk.value.tool.onExecute(handleTool);
    unsub = sdk.value.events.onAiResponse(handleAiResponse);
  });

  onUnmounted(() => unsub?.());

  return { sdk };
}
```

---

## TypeScript 类型

所有公开类型均已导出：

```ts
import type {
  ChatableXSDK,
  ChatableXInitConfig,
  ToolInfo,
  ToolResult,
  ToolExecuteHandler,
  ChatResponse,
  ChatOptions,
  SessionContext,
  EventType,
  EventCallbackMap,
  NotificationType,
  FilePickerOptions,
  TabConfig,
  StateUpdate,
  Unsubscribe,
} from 'chatablex-web-sdk';
```

初始化后的全局 `window` 增强：

| 全局变量 | 设置方 | 用途 |
|----------|--------|------|
| `window.ChatableX` | SDK | 活跃的 `ChatableXSDK` 实例 |
| `window.ChatableXReceive` | SDK | 宿主 → JS 消息接收器 |
| `window.ChatableXBridge` | Flutter | JS → 宿主 `postMessage` 通道 |
| `window.__CHATABLEX_DISPATCH__` | SDK | 直接工具分发（高级用法） |

---

## 最佳实践

1. **在应用启动时调用一次 `init()`**，先于处理器注册。
2. **`appId` 与 manifest `id` 保持一致**——不一致会导致存储和路由的隐蔽问题。
3. **多 `tools[]` 时按 `_toolName` 路由**。
4. **返回结构化的 `data`**——LLM 在会话上下文中读取工具结果。
5. **持久化用 `sdk.storage`**——需要与宿主对齐时不要依赖 `localStorage`。
6. **卸载时取消事件订阅**——避免 SPA 导航中重复注册处理器。
7. **用 `isInsideChatableX()` 守卫**——使 `npm run dev` 无需桌面客户端即可运行。
8. **发布前构建**——宿主加载的是 `dist/`，不是 TypeScript 源码。
9. **提前声明权限**——不要在 manifest 中缺少权限的情况下调用受限 API。
10. **保持处理器快速**——宿主对工具执行有 30 秒超时。

---

## 故障排查

| 现象 | 可能原因 | 解决办法 |
|------|----------|----------|
| `ChatableXBridge not available` | 页面在 ChatableX 外加载，或 init 早于通道注册 | 用 `isInsideChatableX()` 守卫；DOM 就绪后再 `init()` |
| `ChatableX SDK not initialised` | 在 `init()` 前调用 `getInstance()` | 先 await `init()` |
| 工具调用挂起 30 秒后失败 | 未注册 `onExecute`，或未发送 `tool.executeResult` | 确认 `init()` 完成且处理器已设置 |
| `Permission denied` | manifest 缺少权限 | 添加 `ai_chat`、`file_access` 或 `notification` |
| `sdk_init handshake failed` | 宿主桥未就绪（非致命） | SDK 会以默认元数据继续；检查 `debug: true` 日志 |
| storage 返回 `null` | 首次读取或键名错误 | 首次访问时正常；检查键名拼写 |
| 开发正常、ChatableX 中空白 | 未构建或 `webui.entry` 错误 | 执行 `npm run build`；确认 `dist/index.html` 存在 |
| 第二次 `init()` 被忽略 | 单例设计 | 重启 WebView 才能以不同 `appId` 重新初始化 |

**调试清单：**

```ts
await ChatableX.init({ appId: 'my-app', debug: true });
console.log('SDK ready:', ChatableX.isReady());
console.log('Tool info:', ChatableX.getInstance().tool.getInfo());
```

---

## 官方示例

[`examples/`](examples/) 目录下的可运行示例。每个示例均含单元测试、桥接集成测试，以及可装入 ChatableX 的 `dist/` 构建产物。

| 应用 | 框架 | 工具 | 演示流程 |
|------|------|------|----------|
| [counter-app](examples/counter-app/) | React | `counter_control` | `get` → `increment` → `get` |
| [todo-app](examples/todo-app/) | Vue 3 | `todo_control` | `get` → `add` → `get`（`sdk.storage` 持久化） |

```bash
npm run test:examples    # 运行全部示例测试
npm run build:examples   # 构建两个 dist/
```

两个工具均提供 **`get` action**，要求 LLM 在修改前先读取真实状态——多轮对话演示时避免幻觉和工具漏调。

---

## 版本说明

| SDK 版本 | npm 标签 | 说明 |
|----------|----------|------|
| `1.0.0` | `latest` | 当前稳定版 |

桥接方法名或 `tool.executeResult` 结构的破坏性变更将触发主版本号升级。各 ChatableX 客户端发行版中的 Flutter 宿主是协议的权威来源。

---

## 许可证

MIT © ChatableX Team
