import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost } from '../../../tests/helpers/mockHost';
import { handleTodoTool } from '../src/bridge';
import type { Todo } from '../src/todoStore';

describe('todo-app bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('get → add → get roundtrip with storage persistence', async () => {
    const storage = new Map<string, unknown>();

    const host = createMockHost({
      responses: {
        sdk_init: { success: true, data: { id: 'todo-app', name: 'Todo', version: '1.0.0', description: '' } },
      },
    });

    host.onMessage((msg) => {
      if (!msg.id) return;
      if (msg.method === 'storage.get') {
        const key = msg.params?.key as string;
        host.respond(msg.id, true, storage.get(key) ?? null);
      }
      if (msg.method === 'storage.set') {
        storage.set(msg.params?.key as string, msg.params?.value);
        host.respond(msg.id, true);
      }
    });

    const { ChatableX } = await import('chatablex-web-sdk');
    let todos: Todo[] = [];
    const getTodos = () => todos;
    const setTodos = (t: Todo[]) => { todos = t; };

    const sdk = await ChatableX.init({ appId: 'todo-app' });
    sdk.tool.onExecute(async (params) => {
      const result = handleTodoTool(getTodos, setTodos, params);
      await sdk.storage.set('todo-app:todos', getTodos());
      return result;
    });

    // get (empty)
    host.pushEvent('toolExecution', { action: 'get', _requestId: 'r1', _toolName: 'todo_control' });
    await vi.waitFor(() => {
      const r = host.findAllByMethod('tool.executeResult').find((m) => m.params?._requestId === 'r1');
      expect(r?.params).toMatchObject({ success: true, data: { total: 0 } });
    });

    // add
    host.pushEvent('toolExecution', {
      action: 'add',
      title: '买牛奶',
      _requestId: 'r2',
      _toolName: 'todo_control',
    });
    await vi.waitFor(() => {
      const r = host.findAllByMethod('tool.executeResult').find((m) => m.params?._requestId === 'r2');
      expect(r?.params?.success).toBe(true);
      expect(todos).toHaveLength(1);
    });

    // get again — verify state for next LLM turn
    host.pushEvent('toolExecution', { action: 'get', _requestId: 'r3', _toolName: 'todo_control' });
    await vi.waitFor(() => {
      const r = host.findAllByMethod('tool.executeResult').find((m) => m.params?._requestId === 'r3');
      expect(r?.params?.data).toMatchObject({ total: 1, pending: 1 });
    });

    expect(storage.get('todo-app:todos')).toHaveLength(1);
  });
});
