export const STORAGE_KEY = 'todo-app:todos';

export type TodoAction = 'get' | 'add' | 'toggle' | 'delete' | 'clear_completed';

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface TodoSnapshot {
  todos: Todo[];
  total: number;
  pending: number;
  completed: number;
  updatedAt: string;
}

export interface ToolResult extends Record<string, unknown> {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export function createTodo(title: string): Todo {
  return {
    id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
}

export function buildSnapshot(todos: Todo[]): TodoSnapshot {
  const completed = todos.filter((t) => t.done).length;
  return {
    todos,
    total: todos.length,
    pending: todos.length - completed,
    completed,
    updatedAt: new Date().toISOString(),
  };
}

export function snapshotForTool(snapshot: TodoSnapshot): Record<string, unknown> {
  return {
    action: 'get',
    total: snapshot.total,
    pending: snapshot.pending,
    completed: snapshot.completed,
    updatedAt: snapshot.updatedAt,
    todos: snapshot.todos.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      createdAt: t.createdAt,
    })),
    hint: '修改前已返回当前任务。add 需 title；toggle/delete 需 id（从 todos[].id 获取）。',
  };
}

export function applyTodoAction(todos: Todo[], params: Record<string, unknown>): {
  todos: Todo[];
  result: ToolResult;
} {
  const action = (params.action as TodoAction) || 'get';

  switch (action) {
    case 'get':
      return {
        todos,
        result: { success: true, data: snapshotForTool(buildSnapshot(todos)) },
      };

    case 'add': {
      const title = typeof params.title === 'string' ? params.title.trim() : '';
      if (!title) {
        return { todos, result: { success: false, error: 'action=add 需要 title 参数' } };
      }
      const next = [...todos, createTodo(title)];
      const snap = buildSnapshot(next);
      const added = next[next.length - 1];
      return {
        todos: next,
        result: {
          success: true,
          data: { action: 'add', added: { id: added.id, title: added.title }, ...snapshotForTool(snap) },
        },
      };
    }

    case 'toggle': {
      const id = typeof params.id === 'string' ? params.id : '';
      if (!id) {
        return { todos, result: { success: false, error: 'action=toggle 需要 id 参数（先 get 获取）' } };
      }
      const idx = todos.findIndex((t) => t.id === id);
      if (idx < 0) {
        return { todos, result: { success: false, error: `未找到 id=${id}，请先 get 查看当前列表` } };
      }
      const next = todos.map((t, i) => (i === idx ? { ...t, done: !t.done } : t));
      return {
        todos: next,
        result: {
          success: true,
          data: { action: 'toggle', id, done: next[idx].done, ...snapshotForTool(buildSnapshot(next)) },
        },
      };
    }

    case 'delete': {
      const id = typeof params.id === 'string' ? params.id : '';
      if (!id) {
        return { todos, result: { success: false, error: 'action=delete 需要 id 参数（先 get 获取）' } };
      }
      const exists = todos.some((t) => t.id === id);
      if (!exists) {
        return { todos, result: { success: false, error: `未找到 id=${id}，请先 get 查看当前列表` } };
      }
      const next = todos.filter((t) => t.id !== id);
      return {
        todos: next,
        result: { success: true, data: { action: 'delete', id, ...snapshotForTool(buildSnapshot(next)) } },
      };
    }

    case 'clear_completed': {
      const next = todos.filter((t) => !t.done);
      const removed = todos.length - next.length;
      return {
        todos: next,
        result: {
          success: true,
          data: { action: 'clear_completed', removed, ...snapshotForTool(buildSnapshot(next)) },
        },
      };
    }

    default:
      return { todos, result: { success: false, error: `Unknown action: ${action}` } };
  }
}
