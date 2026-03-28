# chatablex-web-sdk

Runtime SDK for building **ChatableX AI App** WebUI applications.

Unlike a type-only package, this SDK contains the actual bridge runtime that connects your web app to the ChatableX Flutter host. You must install it as a dependency — the platform does **not** inject it for you.

## Install

```bash
npm install chatablex-web-sdk
# or link locally during development:
npm install ../chatablex-web-sdk
```

## Quick Start

```tsx
import { ChatableX } from 'chatablex-web-sdk';

// Initialize — connects to the Flutter WebView host
const sdk = await ChatableX.init({ appId: 'my-app', debug: true });

// Register a tool handler (called when the LLM invokes your tool)
sdk.tool.onExecute(async (params) => {
  const { action, value } = params;
  // ... perform action, update UI ...
  return { success: true, result: 42 };
});
```

## API

### `ChatableX.init(config)`

| Option    | Type    | Default | Description |
|-----------|---------|---------|-------------|
| `appId`   | string  | —       | **Required.** Must match your `manifest.json` `id`. |
| `debug`   | boolean | false   | Print debug logs to console. |
| `timeout` | number  | 10000   | Handshake timeout in ms. |

Returns `Promise<ChatableXSDK>`.

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

## Architecture

```
Your App (React/Vue/Vanilla)
    │  import { ChatableX } from 'chatablex-web-sdk'
    │
    ▼
┌─────────────────────────────────────┐
│  chatablex-web-sdk (this package)   │
│                                     │
│  Bridge layer:                      │
│    JS → Flutter: ChatableXBridge    │
│    Flutter → JS: ChatableXReceive   │
│                                     │
│  Modules: tool, events, ai, ui,    │
│           storage, tools, skills    │
└──────────────┬──────────────────────┘
               │  WebView Bridge
               ▼
┌─────────────────────────────────────┐
│  ChatableX Flutter Client           │
│  (owns chat UI, SSE stream, agent)  │
└─────────────────────────────────────┘
```

## License

MIT
