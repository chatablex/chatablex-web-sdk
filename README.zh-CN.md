# chatablex-web-sdk

**[English](README.md)** | 简体中文

用于构建 **ChatableX AI App** WebUI 应用的运行时 SDK。

与仅提供类型的包不同，本 SDK 包含将 Web 应用连接到 ChatableX Flutter 宿主的真实桥接运行时。你必须将其作为依赖安装.

## 安装

```bash
npm install chatablex-web-sdk
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

## SDK 模块是做什么的？

`ChatableX.init()` 返回的 `sdk` 是一个**按职责划分的 API 集合**。WebUI 跑在 WebView 里，很多能力（系统对话框、文件选择、与主聊天同步的存储、走宿主模型的对话等）在浏览器里要么不好做、要么和 Flutter 主应用割裂。这些模块都通过 **JS ↔ Flutter 桥** 调用宿主已实现的能力。

**你不一定要用到每一个模块**：最小集成往往只需要 `sdk.tool`（响应 LLM 调用）；其余按需选用。


| 命名空间 | 用途（为什么要单独拆出来） |
|----------|---------------------------|
| **`sdk.tool`** | 注册工具执行逻辑：LLM 调用你的工具时由宿主把参数传进来，你在 WebUI 里算完再返回结果。这是 AI App 的**核心**入口。 |
| **`sdk.events`** | 订阅宿主侧事件（如用户消息、流式内容），让 WebUI 与当前会话状态对齐。 |
| **`sdk.ai`** | 在 WebUI 内向**宿主同一条 AI 管线**发消息或拉取会话上下文（`chat` / `getContext` 等），避免你在页面里自己再接一套模型。 |
| **`sdk.ui`** | 用**宿主原生 UI** 做提示、确认框、选文件、通知主界面刷新等，体验和权限与桌面客户端一致。 |
| **`sdk.storage`** | 键值存储走**宿主侧**，便于与 App 其它部分共享状态、持久化，而不只存在页面的 `localStorage` 里。 |
| **`sdk.tools` / `sdk.skills`** | 列举或调用平台上其它工具、技能，做编排或联动。 |

下面「API」各节包含：**典型场景**（什么时候用）+ **示例代码**（怎么接）。

## API

### `ChatableX.init(config)`


| 选项        | 类型      | 默认值   | 说明                                    |
| --------- | ------- | ----- | ------------------------------------- |
| `appId`   | string  | —     | **必填。**须与 `manifest.json` 中的 `id` 一致。 |
| `debug`   | boolean | false | 是否在控制台打印调试日志。                         |
| `timeout` | number  | 10000 | 握手超时时间（毫秒）。                           |


返回 `Promise<ChatableXSDK>`。

### `sdk.tool`

**典型场景**：用户在聊天里触发你的 AI App，或模型根据上下文调用你的工具；宿主把 JSON 参数推进 WebView，你要执行逻辑并把结果返回给会话。

```ts
sdk.tool.onExecute(async (params) => {
  const { action, rowId } = params as { action?: string; rowId?: string };
  if (action === 'delete') {
    await deleteRow(rowId);
    return { success: true, message: '已删除' };
  }
  return { success: false, error: 'unknown action' };
});

// 展示 manifest 里的名称、版本等（握手后由宿主填充）
const info = sdk.tool.getInfo();
```

### `sdk.events`

**典型场景**：侧边 WebUI 要做「实时仪表盘」——主窗口里用户发了新消息、AI 流式输出、或其它工具执行完成时，你的面板要同步高亮或刷新。

```ts
const unsubUser = sdk.events.onUserMessage(({ message }) => {
  appendActivityFeed(`用户：${message}`);
});

const unsubStream = sdk.events.on('streamingContent', ({ content, finished }) => {
  setPartialReply(content);
  if (finished) setLoading(false);
});

const unsubAi = sdk.events.onAiResponse((data) => {
  setLastReply(data.content);
});

// 组件卸载时取消订阅，避免泄漏
// unsubUser(); unsubStream(); unsubAi();
```

事件名还可选：`toolExecution`、`close` 等（与宿主实现一致）。

### `sdk.ai`

**典型场景**：在工具面板里提供「针对当前会话再问一句」按钮——走宿主已配置的模型与上下文，而不是在页面里单独接第三方 API；或拉取会话上下文做摘要展示。

```ts
const reply = await sdk.ai.chat('把上一条用户消息总结成三点', {
  stream: false,
});

const ctx = await sdk.ai.getContext();
if (ctx.name) setSessionTitle(ctx.name); // 部分字段视宿主实现而定

// 流式由宿主推送；也可按需调用 chatStream（视宿主支持而定）
await sdk.ai.chatStream('写一段简短回复', { stream: true });
```

### `sdk.ui`

**典型场景**：危险操作要用**系统级确认框**；完成长任务后用**原生通知**；需要访问用户文件时用**宿主文件选择器**；操作结束后让主窗口**刷新消息列表或关闭 WebUI**。

```ts
await sdk.ui.showNotification('导出完成', 'success');

const ok = await sdk.ui.showConfirm('删除记录', '此操作不可撤销，是否继续？');
if (!ok) return;

const path = await sdk.ui.pickFile({ type: 'image' });
if (path) await uploadPreview(path);

await sdk.ui.updateState({ refreshMessages: true });
// await sdk.ui.openTab({ title: '详情', type: 'custom', data: { id: 'x' } });
```

### `sdk.storage`

**典型场景**：记住用户在面板里的筛选条件、布局或草稿；数据存在**宿主侧**，可和 App 其它部分一致、也比仅 `localStorage` 更符合桌面端预期。

```ts
const KEY = 'my-app:filters';

await sdk.storage.set(KEY, { projectId: 'p1', sort: 'date' });
const filters = await sdk.storage.get<{ projectId: string; sort: string }>(KEY);
await sdk.storage.delete(KEY);
```

### `sdk.tools` / `sdk.skills`

**典型场景**：面板上的「一键流程」——按固定顺序调用**其它已安装工具**；或展示表单让用户填变量后执行**技能**（技能内部可编排多个工具）。敏感步骤可用 `executeWithConfirm` 让宿主先弹确认。

```ts
const tools = await sdk.tools.list();
setToolPicker(tools.filter((t) => t.id !== sdk.tool.getInfo().id));

const step1 = await sdk.tools.execute('fetch-doc', { url });
if (!step1.success) throw new Error(step1.error);
const step2 = await sdk.tools.execute('summarize', { text: step1.data });

// 删除类等高风险：走宿主确认
await sdk.tools.executeWithConfirm('delete-backup', { id: backupId });

const skills = await sdk.skills.list();
const skillResult = await sdk.skills.execute('weekly-report-skill', {
  week: '2026-W13',
  department: 'sales',
});
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