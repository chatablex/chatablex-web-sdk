import type { ChatableXSDK } from 'chatablex-web-sdk';
import { ChatableX } from 'chatablex-web-sdk';
import { applyTodoAction, STORAGE_KEY, type Todo } from './todoStore';

export function isInsideChatableX(): boolean {
  return typeof window.ChatableXBridge === 'object' && window.ChatableXBridge !== null;
}

export function loadLocalTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Todo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalTodos(todos: Todo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

async function loadFromSdk(sdk: ChatableXSDK): Promise<Todo[]> {
  const saved = await sdk.storage.get<Todo[]>(STORAGE_KEY);
  return Array.isArray(saved) ? saved : [];
}

async function saveToSdk(sdk: ChatableXSDK, todos: Todo[]): Promise<void> {
  await sdk.storage.set(STORAGE_KEY, todos);
}

export async function initTodoBridge(
  getTodos: () => Todo[],
  setTodos: (todos: Todo[]) => void,
): Promise<ChatableXSDK | null> {
  if (!isInsideChatableX()) {
    setTodos(loadLocalTodos());
    return null;
  }

  const sdk = await ChatableX.init({ appId: 'todo-app', debug: true });
  const restored = await loadFromSdk(sdk);
  setTodos(restored);

  sdk.tool.onExecute(async (params) => {
    const { todos: next, result } = applyTodoAction(getTodos(), params);
    setTodos(next);
    await saveToSdk(sdk, next);
    return result;
  });

  return sdk;
}

export async function persistTodos(sdk: ChatableXSDK | null, todos: Todo[]): Promise<void> {
  if (sdk) {
    await sdk.storage.set(STORAGE_KEY, todos);
  } else {
    saveLocalTodos(todos);
  }
}

export function handleTodoTool(
  getTodos: () => Todo[],
  setTodos: (t: Todo[]) => void,
  params: Record<string, unknown>,
) {
  const { todos, result } = applyTodoAction(getTodos(), params);
  setTodos(todos);
  return result;
}
