# chatablex-web-sdk

English | [**简体中文**](README.zh-CN.md)

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

## What are the SDK namespaces for?

The object returned by `ChatableX.init()` is a **set of APIs grouped by responsibility**. Your WebUI runs inside a WebView; many capabilities (native dialogs, file picking, storage aligned with the main chat, AI calls through the host’s stack) are awkward or inconsistent if you only use browser APIs. These modules call into the **Flutter host via the JS bridge**.

**You do not need every module** for every app — the smallest integration is usually `sdk.tool` (handle LLM invocations). Add others when you need them.


| Namespace | Role (why it exists) |
|-----------|----------------------|
| **`sdk.tool`** | Register tool execution: when the LLM invokes your tool, the host forwards params into your WebUI and you return a result. This is the **core** hook for an AI App. |
| **`sdk.events`** | Subscribe to host-side events (e.g. user messages, streaming) so the WebUI stays in sync with the session. |
| **`sdk.ai`** | Send messages or read session context through the **same host AI pipeline** (`chat`, `getContext`, etc.) instead of wiring your own model only inside the page. |
| **`sdk.ui`** | Drive **native host UI**: toasts, confirms, file picker, refresh main chrome — same UX and permissions as the desktop client. |
| **`sdk.storage`** | Key–value storage on the **host** for persistence and sharing with the rest of the app, not only `localStorage` in the WebView. |
| **`sdk.tools` / `sdk.skills`** | List or invoke other tools and skills on the platform for orchestration. |

The **API** sections below each include: a **typical scenario** (when to use it) + **example code** (how to wire it up).

## API

### `ChatableX.init(config)`

| Option    | Type    | Default | Description |
|-----------|---------|---------|-------------|
| `appId`   | string  | —       | **Required.** Must match your `manifest.json` `id`. |
| `debug`   | boolean | false   | Print debug logs to console. |
| `timeout` | number  | 10000   | Handshake timeout in ms. |

Returns `Promise<ChatableXSDK>`.

### `sdk.tool`

**When to use**: The user opens your AI App from chat, or the model invokes your tool; the host forwards JSON params into the WebView and you return a result back into the session.

```ts
sdk.tool.onExecute(async (params) => {
  const { action, rowId } = params as { action?: string; rowId?: string };
  if (action === 'delete') {
    await deleteRow(rowId);
    return { success: true, message: 'Deleted' };
  }
  return { success: false, error: 'unknown action' };
});

// Metadata from manifest (filled in by the host after handshake)
const info = sdk.tool.getInfo();
```

### `sdk.events`

**When to use**: Your side panel should stay in sync with the main window—new user messages, streaming assistant output, or other tool executions should update your UI.

```ts
const unsubUser = sdk.events.onUserMessage(({ message }) => {
  appendActivityFeed(`User: ${message}`);
});

const unsubStream = sdk.events.on('streamingContent', ({ content, finished }) => {
  setPartialReply(content);
  if (finished) setLoading(false);
});

const unsubAi = sdk.events.onAiResponse((data) => {
  setLastReply(data.content);
});

// Unsubscribe on unmount to avoid leaks
// unsubUser(); unsubStream(); unsubAi();
```

You can also subscribe to `toolExecution`, `close`, etc. (depends on host support).

### `sdk.ai`

**When to use**: A button in your panel like “ask about this session again” should use the **host’s** model and context, not a separate API key inside the page; or you need session metadata for a summary view.

```ts
const reply = await sdk.ai.chat('Summarize the last user message in three bullets', {
  stream: false,
});

const ctx = await sdk.ai.getContext();
if (ctx.name) setSessionTitle(ctx.name); // some fields depend on host implementation

// Streaming may be pushed by the host; call chatStream when supported
await sdk.ai.chatStream('Write a short reply', { stream: true });
```

### `sdk.ui`

**When to use**: Destructive actions need a **native confirm**; long jobs end with a **host toast**; picking files should use the **host file picker**; after work you may **refresh the main transcript** or close the WebUI.

```ts
await sdk.ui.showNotification('Export finished', 'success');

const ok = await sdk.ui.showConfirm('Delete record', 'This cannot be undone. Continue?');
if (!ok) return;

const path = await sdk.ui.pickFile({ type: 'image' });
if (path) await uploadPreview(path);

await sdk.ui.updateState({ refreshMessages: true });
// await sdk.ui.openTab({ title: 'Details', type: 'custom', data: { id: 'x' } });
```

### `sdk.storage`

**When to use**: Persist filters, layout, or drafts for your panel on the **host** so it behaves like the rest of the desktop app—not only `localStorage` inside the WebView.

```ts
const KEY = 'my-app:filters';

await sdk.storage.set(KEY, { projectId: 'p1', sort: 'date' });
const filters = await sdk.storage.get<{ projectId: string; sort: string }>(KEY);
await sdk.storage.delete(KEY);
```

### `sdk.tools` / `sdk.skills`

**When to use**: A one-click flow in your panel chains **other installed tools** in order; or you show a form so the user fills variables and runs a **skill** (a skill may orchestrate several tools). Use `executeWithConfirm` for risky steps so the host shows a confirm dialog first.

```ts
const tools = await sdk.tools.list();
setToolPicker(tools.filter((t) => t.id !== sdk.tool.getInfo().id));

const step1 = await sdk.tools.execute('fetch-doc', { url });
if (!step1.success) throw new Error(step1.error);
const step2 = await sdk.tools.execute('summarize', { text: step1.data });

// High-risk actions: confirm in the host first
await sdk.tools.executeWithConfirm('delete-backup', { id: backupId });

const skills = await sdk.skills.list();
const skillResult = await sdk.skills.execute('weekly-report-skill', {
  week: '2026-W13',
  department: 'sales',
});
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
