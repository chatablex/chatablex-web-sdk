# Todo App 示例（Vue 3）

ChatableX Web SDK 官方示例：**Vue 待办清单**。演示 `sdk.storage` 持久化 + 「先 `get` 查看任务，再增删改」的多轮对话可靠调用。

## 工具 API

| action | 说明 | 参数 |
|--------|------|------|
| **`get`** | **查看当前任务列表与统计（修改前必调）** | — |
| `add` | 添加任务 | `title: string` |
| `toggle` | 切换完成状态 | `id: string`（从 get 返回） |
| `delete` | 删除任务 | `id: string`（从 get 返回） |
| `clear_completed` | 清除已完成 | — |

`get` 返回示例：

```json
{
  "total": 2,
  "pending": 1,
  "completed": 1,
  "todos": [
    { "id": "todo_...", "title": "买牛奶", "done": false },
    { "id": "todo_...", "title": "写文档", "done": true }
  ]
}
```

## 存储

| 环境 | 方式 |
|------|------|
| ChatableX 宿主内 | **`sdk.storage`**（推荐）— 宿主 SQLite，WebView 重启后数据仍在 |
| 浏览器 `npm run dev` | `localStorage` 回退（key：`todo-app:todos`） |

> 本地工具不依赖线上服务。后续可扩展云存储 API，但 `sdk.storage` 接口保持不变。

## 开发

```bash
cd examples/todo-app
npm install
npm run dev      # http://localhost:5181
npm test         # 单元 + 桥接测试
npm run build    # 产出 dist/index.html
```

## 在 ChatableX 中实测

1. `npm run build`
2. 将 `todo-app` 目录复制或软链到 `~/.ChatableX/my_tools/todo-app`
3. 在客户端将 Todo App 拖入对话
4. 按顺序测试：
   - 「查看当前待办」→ `todo_control(get)`
   - 「添加待办：买牛奶」→ `todo_control(add, title=买牛奶)`
   - 「再查看待办」→ get 应含新任务及 `id`
   - 「完成 id 为 xxx 的任务」→ `todo_control(toggle, id=xxx)`

## 演示话术（推荐）

```
1. 先调用 todo_control，action=get，告诉我当前有哪些任务。
2. 添加一条待办：写 SDK 文档。
3. 再次 get，把新任务的 id 告诉我。
4. 把该任务标为已完成。
```
