# Counter App 示例（React）

ChatableX Web SDK 官方示例：**React 计数器**。演示「先 `get` 查看状态，再修改」的多轮对话可靠调用模式。

## 工具 API

| action | 说明 | 参数 |
|--------|------|------|
| **`get`** | **查看当前计数（修改前必调）** | — |
| `increment` | 加 1 | — |
| `decrement` | 减 1 | — |
| `reset` | 归零 | — |
| `set` | 设为指定值 | `value: number` |

## 存储

| 环境 | 方式 |
|------|------|
| ChatableX 宿主内 | `sdk.storage`（Flutter SQLite，按工具隔离） |
| 浏览器 `npm run dev` | `localStorage` 回退（同 key：`counter-app:count`） |

## 开发

```bash
cd examples/counter-app
npm install
npm run dev      # http://localhost:5180
npm test         # 单元 + 桥接测试
npm run build    # 产出 dist/index.html
```

## 在 ChatableX 中实测

1. `npm run build`
2. 将 `counter-app` 目录复制或软链到 `~/.ChatableX/my_tools/counter-app`
3. 在客户端将 Counter App 拖入对话
4. 按顺序测试（确保 100% 工具命中）：
   - 「查看计数器当前值」→ `counter_control(get)`
   - 「加一」→ `counter_control(increment)`
   - 「再查看一下」→ `counter_control(get)` 应返回新值

## 演示话术（推荐）

```
1. 请先调用 counter_control，action 设为 get，查看当前计数。
2. 在当前值基础上加 1。
3. 再次 get 确认结果。
```
