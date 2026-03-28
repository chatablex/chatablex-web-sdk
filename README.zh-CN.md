# chatablex-web-sdk

[**English**](README.md) | 简体中文

用于构建 **ChatableX AI App** WebUI 应用的运行时 SDK。

与仅提供类型的包不同，本 SDK 包含将 Web 应用连接到 ChatableX Flutter 宿主的真实桥接运行时。你必须将其作为依赖安装 —— 平台**不会**替你注入。

## 安装

```bash
npm install chatablex-web-sdk
# 本地开发时可使用 link：
npm install ../chatablex-web-sdk
```

## 快速开始

```tsx
import { ChatableX } from 'chatablex-web-sdk';

// 初始化 —— 连接 Flutter WebView 宿主
const sdk = await ChatableX.init({ appId: 'my-app', debug: true });

// 注册工具处理器（当 LLM 调用你的工具时触发）
sdk.tool.onExecute(async (params) => {
  const { action, value } = params;
  // ... 执行操作、更新 UI ...
  return { success: true, result: 42 };
});
```

## API

### `ChatableX.init(config)`

| 选项      | 类型    | 默认值 | 说明 |
|-----------|---------|--------|------|
| `appId`   | string  | —      | **必填。**须与 `manifest.json` 中的 `id` 一致。 |
| `debug`   | boolean | false  | 是否在控制台打印调试日志。 |
| `timeout` | number  | 10000  | 握手超时时间（毫秒）。 |

返回 `Promise<ChatableXSDK>`。

### `sdk.tool`

```ts
sdk.tool.onExecute(async (params) => {
  return { success: true, data: '...' };
});

sdk.tool.getInfo(); // { id, name, version, description }
```

### `sdk.events`

```ts
sdk.events.on('userMessage', (data) => { ... });
sdk.events.on('streamingContent', (data) => { ... });
sdk.events.onAiResponse((data) => { ... });
```

### `sdk.ai`

```ts
const resp = await sdk.ai.chat('Hello AI');
const ctx  = await sdk.ai.getContext();
```

### `sdk.ui`

```ts
await sdk.ui.showNotification('Done!', 'success');
const ok = await sdk.ui.showConfirm('Delete?', 'Are you sure?');
const file = await sdk.ui.pickFile({ type: 'image' });
await sdk.ui.updateState({ refreshMessages: true });
```

### `sdk.storage`

```ts
await sdk.storage.set('key', { foo: 'bar' });
const val = await sdk.storage.get('key');
await sdk.storage.delete('key');
```

### `sdk.tools` / `sdk.skills`

```ts
const tools = await sdk.tools.list();
const result = await sdk.tools.execute('other-tool', { q: 'test' });
```

## 架构

```
Your App (React/Vue/Vanilla)
    │  import { ChatableX } from 'chatablex-web-sdk'
    │
    ▼
┌─────────────────────────────────────┐
│  chatablex-web-sdk（本包）            │
│                                     │
│  桥接层：                            │
│    JS → Flutter: ChatableXBridge    │
│    Flutter → JS: ChatableXReceive   │
│                                     │
│  模块：tool, events, ai, ui,        │
│        storage, tools, skills       │
└──────────────┬──────────────────────┘
               │  WebView Bridge
               ▼
┌─────────────────────────────────────┐
│  ChatableX Flutter 客户端            │
│  （承载聊天 UI、SSE 流、Agent）       │
└─────────────────────────────────────┘
```

## 许可证

MIT
