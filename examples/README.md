# ChatableX Web SDK — Examples

官方示例应用，可直接在 ChatableX 客户端中加载测试。

| 示例 | 框架 | 工具 | 存储 | 说明 |
|------|------|------|------|------|
| [counter-app](./counter-app/) | **React** | `counter_control` | `sdk.storage` | 计数器：先 `get` 再加减 |
| [todo-app](./todo-app/) | **Vue 3** | `todo_control` | `sdk.storage` | 待办清单：先 `get` 再增删改 |

> 鉴权用法见 [auth-usage.md](./auth-usage.md)：`sdk.auth.getAuthHeaders()` 一行接入宿主登录态（零鉴权样板）。

## 设计原则（演示可靠）

1. **每个工具都有 `get` action** — LLM 多轮对话前先读取真实状态，避免幻觉。
2. **`return_direct: true`** — 工具结果直接返回给 Agent，减少二次推理丢上下文。
3. **宿主内用 `sdk.storage`** — 本地 SQLite 持久化；浏览器 dev 用 `localStorage` 回退。
4. **可自动化验证** — 每个示例含 `tests/`（纯逻辑 + mockHost 桥接测试）。

## 一键测试

```bash
# SDK 本体
npm test

# 两个示例
npm run test:examples
```

## 构建全部示例

```bash
npm run build:examples
```

## UI 说明

- **Counter（React）**：深色卡片 + 大号渐变数字，适合侧边 WebView 窄屏。
- **Todo（Vue）**：浅色清单 + 统计条，国内 Vue 开发者友好。

> Pencil 设计工具暂不可用，UI 按上述风格在代码中直接实现。
