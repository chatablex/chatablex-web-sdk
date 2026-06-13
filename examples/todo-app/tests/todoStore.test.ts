import { describe, it, expect } from 'vitest';
import { applyTodoAction, createTodo } from '../src/todoStore';

describe('todoStore', () => {
  it('get returns full snapshot without mutation', () => {
    const todos = [createTodo('买牛奶'), createTodo('写文档')];
    todos[1].done = true;
    const { todos: next, result } = applyTodoAction(todos, { action: 'get' });
    expect(next).toHaveLength(2);
    expect(result.success).toBe(true);
    expect(result.data?.total).toBe(2);
    expect(result.data?.pending).toBe(1);
    expect(result.data?.completed).toBe(1);
    expect(Array.isArray(result.data?.todos)).toBe(true);
  });

  it('demo flow: get → add → get', () => {
    let todos: ReturnType<typeof createTodo>[] = [];

    const g1 = applyTodoAction(todos, { action: 'get' });
    expect(g1.result.data?.total).toBe(0);

    const add = applyTodoAction(todos, { action: 'add', title: '演示任务' });
    todos = add.todos;
    expect(add.result.success).toBe(true);

    const g2 = applyTodoAction(todos, { action: 'get' });
    expect(g2.result.data?.total).toBe(1);
    expect((g2.result.data?.todos as { title: string }[])[0].title).toBe('演示任务');
  });

  it('toggle requires id from prior get', () => {
    const todos = [createTodo('任务A')];
    const { result } = applyTodoAction(todos, { action: 'toggle' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('toggle with valid id', () => {
    const todos = [createTodo('任务A')];
    const id = todos[0].id;
    const { todos: next, result } = applyTodoAction(todos, { action: 'toggle', id });
    expect(result.success).toBe(true);
    expect(next[0].done).toBe(true);
  });

  it('delete unknown id fails with helpful message', () => {
    const { result } = applyTodoAction([], { action: 'delete', id: 'bad_id' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('get');
  });

  it('clear_completed removes done items only', () => {
    const a = createTodo('A');
    const b = createTodo('B');
    b.done = true;
    const { todos: next, result } = applyTodoAction([a, b], { action: 'clear_completed' });
    expect(next).toHaveLength(1);
    expect(result.data?.removed).toBe(1);
  });
});
