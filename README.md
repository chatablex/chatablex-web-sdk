# ChatableX Web SDK

[![license](https://img.shields.io/npm/l/chatablex-web-sdk.svg?style=flat-square)](https://github.com/chatablex/chatablex-web-sdk/blob/main/package.json)
[![npm version](https://img.shields.io/npm/v/chatablex-web-sdk.svg?style=flat-square)](https://www.npmjs.com/package/chatablex-web-sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/chatablex/chatablex-web-sdk/ci.yml?branch=main&label=Build%20%26%20Test&logo=github)](https://github.com/chatablex/chatablex-web-sdk/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/chatablex/chatablex-web-sdk/pulls)

English | [**简体中文**](README.zh-CN.md)

**Runtime SDK for building ChatableX AI App WebUI extensions.**

`chatablex-web-sdk` is the official JavaScript/TypeScript library that connects your web application to the **ChatableX desktop client** (Flutter WebView host). Unlike a type-only package, it ships the real bridge runtime — request/response RPC, event subscriptions, and tool execution callbacks.

Your WebUI runs inside a WebView. Many capabilities — native dialogs, file picking, session-aware storage, AI calls through the host pipeline — are awkward or inconsistent with browser-only APIs. This SDK exposes them as typed, promise-based modules.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Setup](#project-setup)
- [Architecture](#architecture)
- [Core Concept: Tool Execution](#core-concept-tool-execution)
- [API Reference](#api-reference)
  - [ChatableX (entry)](#chatablex-entry)
  - [sdk.tool](#sdktool)
  - [sdk.events](#sdkevents)
  - [sdk.ai](#sdkai)
  - [sdk.ui](#sdkui)
  - [sdk.storage](#sdkstorage)
  - [sdk.tools](#sdktools)
  - [sdk.platform](#sdkplatform)
  - [sdk.auth](#sdkauth)
- [Events Reference](#events-reference)
- [Permissions](#permissions)
- [Host Capability Matrix](#host-capability-matrix)
- [Local Development](#local-development)
- [Framework Integration](#framework-integration)
- [TypeScript Types](#typescript-types)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)
- [Versioning](#versioning)
- [License](#license)

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **ChatableX client** | Desktop app with WebView bridge (Flutter host) |
| **Extension mode** | `execution_mode: "webapp"` in `manifest.json` |
| **Node.js** | ≥ 16 (for building your WebUI) |
| **Build output** | `webui.entry` must point to `./dist/index.html` (Vite or equivalent) |
| **SDK install** | You **must** `npm install chatablex-web-sdk` — the host does **not** inject the SDK |

The platform consumes two things from your extension:

1. **Built artifacts** at `chatablex.webapp.webui.entry` (typically `./dist/index.html`)
2. **Bridge calls** via this SDK (`ChatableX.init`, `sdk.tool.onExecute`, etc.)

---

## Installation

```bash
npm install chatablex-web-sdk
```

Local development against a monorepo copy:

```bash
npm install ../chatablex-web-sdk
# or
npm install file:../chatablex-web-sdk
```

**Package exports** (ESM + CJS + TypeScript declarations):

```ts
import { ChatableX } from 'chatablex-web-sdk';
import type { ChatableXSDK, ToolResult, ChatResponse } from 'chatablex-web-sdk';
```

---

## Quick Start

Minimal integration — handle LLM tool calls in your WebUI:

```ts
import { ChatableX } from 'chatablex-web-sdk';

async function main() {
  const sdk = await ChatableX.init({
    appId: 'my-counter-app',  // must match manifest.json "id"
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

**You do not need every module.** The smallest production integration is usually `sdk.tool` only. Add `sdk.storage`, `sdk.events`, `sdk.ui`, etc. when your product needs them.

---

## Project Setup

### manifest.json (webapp extension)

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
      "description": "Control the counter widget",
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

| Field | Rule |
|-------|------|
| `id` | Must equal `ChatableX.init({ appId })` |
| `execution_mode` | Must be `"webapp"` |
| `webui.entry` | Relative path → local HTTP serve; `https://` → remote URL |
| `tools[]` | Declares LLM-callable functions; host forwards args to `sdk.tool.onExecute` |
| `permissions` | Gates host-side APIs — see [Permissions](#permissions) |

### package.json scripts

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

Run `npm run build` before publishing. The ChatableX client loads `dist/index.html`, not your dev server (unless you configure a remote `webui.entry` URL).

### Recommended project layout

```
my-app/
├── manifest.json          # extension metadata
├── package.json
├── index.html             # Vite entry HTML
├── src/
│   ├── main.ts            # ChatableX.init() + app bootstrap
│   ├── app.ts             # UI logic
│   └── bridge.ts          # optional: tool routing helpers
├── dist/                  # build output (consumed by host)
│   └── index.html
└── vite.config.ts
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Your Web App (React / Vue / Svelte / Vanilla)               │
│    import { ChatableX } from 'chatablex-web-sdk'             │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  chatablex-web-sdk                                           │
│                                                              │
│  Bridge (RPC + events)                                       │
│    JS → Host : window.ChatableXBridge.postMessage(JSON)      │
│    Host → JS : window.ChatableXReceive(JSON)                 │
│                                                              │
│  Modules: tool · events · ai · ui · storage · tools ·        │
│           tools · platform                                   │
└────────────────────────────┬─────────────────────────────────┘
                             │  WebView JavaScriptChannel
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  ChatableX Flutter Client                                    │
│    Chat UI · SSE stream · Agent graph · SQLite storage       │
└──────────────────────────────────────────────────────────────┘
```

### Bridge protocol

**Request (JS → Flutter):**

```json
{
  "id": "ctx_1_1718200000000",
  "method": "storage.get",
  "params": { "key": "filters" },
  "timestamp": 1718200000000
}
```

**Response (Flutter → JS):**

```json
{
  "type": "response",
  "id": "ctx_1_1718200000000",
  "success": true,
  "data": { "projectId": "p1" }
}
```

**Event push (Flutter → JS):**

```json
{
  "type": "event",
  "eventType": "toolExecution",
  "data": { "action": "increment", "_requestId": "texec_1_...", "_toolName": "counter_control" }
}
```

**Tool result (JS → Flutter, fire-and-forget):**

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

> `tool.executeResult` does **not** use the RPC `id` field. The host correlates results via `_requestId`. This is required because WebView `evaluateJavaScript` cannot await Promises.

### Initialization sequence

1. Your bundle loads in the WebView.
2. You call `ChatableX.init({ appId })`.
3. SDK installs `window.ChatableXReceive`.
4. SDK waits for `window.ChatableXBridge` (set by Flutter).
5. SDK sends `sdk_init` handshake → host responds with tool metadata.
6. SDK exposes `window.ChatableX` and returns the `sdk` object.

---

## Core Concept: Tool Execution

This is the **primary integration path** for AI Apps. When the LLM invokes your tool, the host forwards parameters into your WebUI and waits for a result.

```
LLM (Agent)          Flutter Host              Your WebUI (SDK)
     │                     │                          │
     │  frontend_tool_call │                          │
     │────────────────────>│                          │
     │                     │  event: toolExecution    │
     │                     │  { ...args, _requestId } │
     │                     │─────────────────────────>│
     │                     │                          │ onExecute(params)
     │                     │                          │  → your logic
     │                     │  tool.executeResult      │
     │                     │<─────────────────────────│
     │  tool-result POST   │                          │
     │<────────────────────│                          │
     │  Agent continues    │                          │
```

### Handler contract

```ts
sdk.tool.onExecute(async (params) => {
  // params includes LLM arguments PLUS host metadata:
  //   _toolName  — which manifest tool was invoked (string)
  //   _requestId — correlation id (string, set by host)

  return {
    success: true,           // required
    data: { /* any */ },     // optional, returned to LLM
    error: 'reason',         // optional, when success is false
  };
});
```

| Return field | Type | Description |
|--------------|------|-------------|
| `success` | `boolean` | Whether the operation succeeded |
| `data` | `unknown` | Payload for the LLM / session (any JSON-serializable value) |
| `error` | `string` | Human-readable error when `success: false` |

**Rules:**

- Register **one** handler via `onExecute`. Calling it again **replaces** the previous handler.
- Handler exceptions are caught and converted to `{ success: false, error: message }`.
- If no handler is registered, the host receives `{ success: false, error: 'No execute handler registered' }`.
- Always route multi-tool apps by `params._toolName` (see `game-maker` reference below).
- The host times out after **30 seconds** if no `tool.executeResult` arrives.

### Multi-tool routing example

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

## API Reference

### ChatableX (entry)

#### `ChatableX.init(config): Promise<ChatableXSDK>`

Initialize the SDK and connect to the Flutter host.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | `string` | — | **Required.** Must match `manifest.json` `id`. |
| `debug` | `boolean` | `false` | Log bridge activity to `console`. |
| `timeout` | `number` | `10000` | Ms to wait for `ChatableXBridge` during handshake. |

Returns a singleton. Subsequent `init()` calls return the same instance (first `appId` wins).

Throws if `ChatableXBridge` is not available within `timeout`.

#### `ChatableX.getInstance(): ChatableXSDK`

Returns the current instance. Throws if `init()` has not been called.

#### `ChatableX.isReady(): boolean`

`true` after the first successful `init()`.

#### `ChatableX.version: string`

Current SDK version (e.g. `"1.0.0"`).

---

### `sdk.tool`

Register and inspect your extension's tool execution handler.

| Method | Signature | Description |
|--------|-----------|-------------|
| `onExecute` | `(handler) => void` | Register the LLM tool handler. **Required for webapp extensions.** |
| `getInfo` | `() => ToolInfo` | Tool metadata from host handshake (`id`, `name`, `version`, `description`). |

```ts
const info = sdk.tool.getInfo();
// { id: 'my-app', name: 'My App', version: '1.0.0', description: '...' }
```

---

### `sdk.events`

Subscribe to host-pushed events. Each subscription also sends `events.subscribe` to the host so it knows to forward matching events.

| Method | Description |
|--------|-------------|
| `on(eventType, callback)` | Generic subscription. Returns `unsubscribe` function. |
| `onAiResponse(callback)` | Shorthand for `'aiResponse'`. |
| `onToolExecution(callback)` | Shorthand for `'toolExecution'`. |
| `onUserMessage(callback)` | Shorthand for `'userMessage'`. |

```ts
const unsub = sdk.events.on('streamingContent', ({ content, finished }) => {
  appendToken(content);
  if (finished) setLoading(false);
});

// Clean up on component unmount
unsub();
```

> **Note:** `unsubscribe()` removes the local listener only. The host is not notified via `events.unsubscribe` in the current SDK version.

---

### `sdk.ai`

Call the host's AI pipeline from your WebUI. Requires `ai_chat` permission in `manifest.json`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `chat` | `(message, options?) => Promise<ChatResponse>` | Send a message through the host AI stack. |
| `chatStream` | `(message, options?) => Promise<unknown>` | Initiate streaming chat. Tokens arrive via `sdk.events.on('streamingContent')`. |
| `getContext` | `() => Promise<SessionContext>` | Fetch current session metadata and messages. |

```ts
const reply = await sdk.ai.chat('Summarize the last three messages', {
  sessionId: 'optional-override',
  stream: false,
});

const ctx = await sdk.ai.getContext();
console.log(ctx.messages.length, ctx.activeTools);
```

**`ChatOptions`:** `sessionId`, `context`, `tools`, `skills`, `stream`.

---

### `sdk.ui`

Drive native host UI from your WebUI.

| Method | Signature | Permission | Description |
|--------|-----------|------------|-------------|
| `showNotification` | `(message, type?) => Promise<void>` | `notification` | Toast: `info` \| `success` \| `warning` \| `error`. |
| `showConfirm` | `(title, message) => Promise<boolean>` | — | Native confirm dialog. Returns `true` if confirmed. |
| `pickFile` | `(options?) => Promise<string \| null>` | `file_access` | Open native file picker. Returns path or `null` if cancelled. |
| `openTab` | `(config) => Promise<void>` | — | Request a new tab in the host shell. |
| `updateState` | `(state) => Promise<void>` | — | Notify host to refresh UI (e.g. `{ refreshMessages: true }`). |

```ts
const ok = await sdk.ui.showConfirm('Delete', 'This cannot be undone.');
if (!ok) return;

await sdk.ui.showNotification('Saved', 'success');
await sdk.ui.updateState({ refreshMessages: true });
```

**`FilePickerOptions`:** `type` (`any` \| `image` \| `video` \| `audio` \| `custom`), `multiple`, `allowedExtensions`.

**`TabConfig`:** `id`, `title`, `type` (`chat` \| `tool` \| `skill` \| `custom`), optional `icon`, `data`.

> **Host-only:** `ui.saveFile` (native Save As dialog) is implemented in the Flutter host but not yet wrapped by this SDK. Advanced integrations can call it via raw `ChatableXBridge.postMessage`.

---

### `sdk.storage`

Key-value storage persisted by the host (SQLite, scoped per tool). Use instead of `localStorage` when you need data to survive WebView resets and align with the desktop app.

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `<T>(key) => Promise<T \| null>` | Read a value. Returns `null` if missing. |
| `set` | `<T>(key, value) => Promise<void>` | Write a JSON-serializable value. |
| `delete` | `(key) => Promise<void>` | Remove a key. |

```ts
const KEY = 'my-app:draft';

await sdk.storage.set(KEY, { title: 'Draft', nodes: [] });
const draft = await sdk.storage.get<{ title: string }>(KEY);
await sdk.storage.delete(KEY);
```

Storage keys are namespaced per tool instance on the host side.

---

### `sdk.tools`

List and invoke **other** platform tools from your WebUI.

| Method | Signature | Description |
|--------|-----------|-------------|
| `list` | `() => Promise<ToolInfo[]>` | List available tools. |
| `execute` | `(toolId, params) => Promise<ToolResult>` | Invoke a tool immediately. |
| `executeWithConfirm` | `(toolId, params) => Promise<ToolResult>` | Invoke after host confirmation dialog. |

```ts
const tools = await sdk.tools.list();
const result = await sdk.tools.execute('fetch-doc', { url: 'https://...' });
if (!result.success) throw new Error(result.error);
```

> Skill-type extensions (`execution_mode: "skill"`) are activated in the chat session and injected into the system prompt — not executed via a separate SDK module. Use `sdk.tools` if your WebUI needs to orchestrate other extensions.

---

### `sdk.platform`

Platform-level utilities.

| Method | Signature | Description |
|--------|-----------|-------------|
| `openInBrowser` | `(targetUrl) => Promise<void>` | Open URL in the system browser with auth handoff. |

```ts
await sdk.platform.openInBrowser('https://docs.example.com/guide');
```

Throws if `targetUrl` is empty or whitespace-only.

---

### `sdk.auth`

Unified authentication for **every** WebUI app. In a hosted (Flutter WebView)
environment it transparently reuses the desktop login session — your app writes
**zero** login/token code. Just call `getAuthHeaders()` and attach it to your
`fetch`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `getToken` | `() => Promise<AuthTokenData \| null>` | Get a valid token (cached, refreshed on demand). `null` when not authenticated. |
| `getAuthHeaders` | `() => Promise<Record<string,string>>` | `{ Authorization: "Bearer <token>" }`, or `{}` when not authenticated. |
| `getUserId` | `() => string \| null` | Authenticated user id (sync, cache only). |
| `isAuthenticated` | `() => boolean` | Whether a valid token is cached (sync). |
| `refresh` | `() => Promise<boolean>` | Force a refresh via the host. Concurrent calls are merged (single-flight). |

```ts
// Attach the host login session to any authenticated request — no login code.
const res = await fetch('https://api.example.com/scenes', {
  headers: {
    'Content-Type': 'application/json',
    ...(await sdk.auth.getAuthHeaders()),
  },
});

if (!sdk.auth.isAuthenticated()) {
  // not logged in / not hosted — disable features that need auth
}

// On a 401 from your backend, force a refresh and retry once:
if (res.status === 401 && (await sdk.auth.refresh())) {
  // retry with await sdk.auth.getAuthHeaders()
}
```

**Behavior & guarantees**

- **Token is in-memory only.** The `refresh_token` never crosses the bridge.
- **Pre-emptive refresh.** The host refreshes the `access_token` before sending
  when it is expired or near expiry, so you normally never see an expired token.
- **Safe degradation.** Outside a WebView, or when the host is logged out,
  `getAuthHeaders()` resolves to `{}` and never throws.
- **Pluggable provider.** Today only `HostAuthProvider` (WebView) is wired up; a
  future browser/unified-login provider will slot in without changing your code.

---

## Events Reference

| Event | Payload | When fired |
|-------|---------|------------|
| `toolExecution` | `{ toolCall, result? }` or raw args + `_requestId` | LLM invokes a tool; also used internally for `onExecute` dispatch |
| `aiResponse` | `ChatResponse` | AI reply completed in the host session |
| `streamingContent` | `{ content, finished? }` | Token/chunk during streaming generation |
| `userMessage` | `{ message, timestamp }` | User sent a message in the main chat |
| `close` | `{ toolId }` | WebUI is about to close |

Subscribe before the event fires. Use the returned `unsubscribe()` function in framework cleanup hooks (`useEffect` return, `onUnmounted`, etc.).

---

## Permissions

Declare in `manifest.json` → `permissions[]`. The host rejects unauthorized API calls.

| Manifest value | SDK APIs gated | Description |
|----------------|----------------|-------------|
| `ai_chat` | `sdk.ai.*` | Access host AI pipeline |
| `file_access` | `sdk.ui.pickFile` | Native file picker |
| `notification` | `sdk.ui.showNotification` | System toasts |
| `network` | (host-level) | Network access for the extension |
| `system_command` | (host-level) | Execute system commands |

When denied, RPC calls reject with `Error: Permission denied: <permission>`.

---

## Host Capability Matrix

SDK methods are thin RPC wrappers. Some host handlers are fully implemented; others return stubs. Plan your extension accordingly.

| SDK method | Host status | Notes |
|------------|-------------|-------|
| `sdk.tool.onExecute` | **Production** | Core path — fully supported |
| `sdk.storage.*` | **Production** | SQLite per tool |
| `sdk.ui.showNotification` | **Production** | Requires `notification` |
| `sdk.ui.showConfirm` | **Production** | |
| `sdk.ui.pickFile` | **Production** | Requires `file_access` |
| `sdk.ui.updateState` | **Production** | Delegates to host |
| `sdk.platform.openInBrowser` | **Production** | Auth handoff |
| `sdk.auth.*` | **Production** | Hosted: reuses desktop login via `host.getAuthToken` (pre-refresh) |
| `sdk.ai.chat` | **Production** | Requires `ai_chat` + delegate |
| `sdk.ai.getContext` | **Partial** | Returns minimal context |
| `sdk.ai.chatStream` | **Partial** | Returns `{ streaming: true }`; tokens via events |
| `sdk.events.*` | **Production** | |
| `sdk.tools.list` | **Stub** | Returns `[]` (host stub) |
| `sdk.tools.execute` | **Delegate** | Requires host delegate |
| `sdk.ui.openTab` | **Stub** | Returns success, no action |
| `ui.saveFile` (raw) | **Production** | Host only — not yet in SDK |

---

## Local Development

Your WebUI should work in a normal browser for UI development. Detect the host and skip SDK initialization when absent.

```ts
function isInsideChatableX(): boolean {
  return typeof window.ChatableXBridge === 'object' && window.ChatableXBridge !== null;
}

async function bootstrap() {
  if (isInsideChatableX()) {
    const sdk = await ChatableX.init({ appId: 'my-app', debug: true });
    sdk.tool.onExecute(handleTool);
  } else {
    console.log('Running outside ChatableX — SDK inactive');
    // Use mocks, local state, or manual test triggers
  }

  mountApp();
}
```

**Tips:**

- Use `npm run dev` (Vite) for fast iteration in the browser.
- Use `npm run build` + load in ChatableX for integration testing.
- The host serves `dist/` over `http://127.0.0.1:<port>/` for local extensions.
- Set `debug: true` during development to see bridge logs.

---

## Framework Integration

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
        // handle tools
        return { success: true };
      });

      unsubStream = sdk.events.on('streamingContent', (data) => {
        // update state
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

## TypeScript Types

All public types are exported:

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

Global `window` augmentation (after init):

| Global | Set by | Purpose |
|--------|--------|---------|
| `window.ChatableX` | SDK | Live `ChatableXSDK` instance |
| `window.ChatableXReceive` | SDK | Host → JS message receiver |
| `window.ChatableXBridge` | Flutter | JS → Host `postMessage` channel |
| `window.__CHATABLEX_DISPATCH__` | SDK | Direct tool dispatch (advanced) |

---

## Best Practices

1. **Always call `init()` once** at app bootstrap, before registering handlers.
2. **Match `appId` to manifest `id`** — mismatches cause subtle storage and routing bugs.
3. **Route by `_toolName`** when your extension declares multiple `tools[]` entries.
4. **Return structured `data`** — the LLM reads tool results in the session context.
5. **Use `sdk.storage` for persistence** — not `localStorage`, if you need host-aligned state.
6. **Unsubscribe events** on teardown to avoid duplicate handlers in SPA navigation.
7. **Guard with `isInsideChatableX()`** so `npm run dev` works without the desktop client.
8. **Build before publish** — the host loads `dist/`, not TypeScript source.
9. **Declare permissions upfront** — don't call gated APIs without manifest entries.
10. **Keep handlers fast** — the host enforces a 30s timeout on tool execution.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `ChatableXBridge not available` | Page loaded outside ChatableX, or init ran before channel registered | Guard with `isInsideChatableX()`; call `init()` after DOM ready |
| `ChatableX SDK not initialised` | `getInstance()` before `init()` | Await `init()` first |
| Tool call hangs 30s then fails | `onExecute` not registered, or no `tool.executeResult` sent | Ensure `init()` completed and handler is set |
| `Permission denied` | Missing manifest permission | Add `ai_chat`, `file_access`, or `notification` |
| `sdk_init handshake failed` | Host bridge not ready (non-fatal) | SDK continues with default metadata; check `debug: true` logs |
| Storage returns `null` | First read or wrong key | Normal on first access; verify key spelling |
| Works in dev, blank in ChatableX | Forgot to build, or wrong `webui.entry` | Run `npm run build`; verify `dist/index.html` exists |
| Second `init()` ignored | Singleton by design | Restart WebView to re-init with a different `appId` |

**Debug checklist:**

```ts
await ChatableX.init({ appId: 'my-app', debug: true });
console.log('SDK ready:', ChatableX.isReady());
console.log('Tool info:', ChatableX.getInstance().tool.getInfo());
```

---

## Examples

Official sample apps under [`examples/`](examples/). Each includes unit tests + bridge integration tests + `dist/` build output.

| App | Framework | Tool | Demo flow |
|-----|-----------|------|-----------|
| [counter-app](examples/counter-app/) | React | `counter_control` | `get` → `increment` → `get` |
| [todo-app](examples/todo-app/) | Vue 3 | `todo_control` | `get` → `add` → `get` (uses `sdk.storage`) |

```bash
npm run test:examples    # run all example tests
npm run build:examples   # build both dist/
```

Both tools expose a **`get` action** so the LLM reads real state before mutating — critical for reliable multi-turn demos.

---

## Versioning

| SDK version | npm tag | Notes |
|-------------|---------|-------|
| `1.0.0` | `latest` | Current stable |

Breaking changes to bridge method names or `tool.executeResult` shape will trigger a major version bump. The Flutter host in each ChatableX client release is the canonical contract owner.

---

## License

MIT © ChatableX Team
