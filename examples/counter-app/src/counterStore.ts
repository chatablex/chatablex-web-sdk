export const STORAGE_KEY = 'counter-app:count';

export type CounterAction = 'get' | 'increment' | 'decrement' | 'reset' | 'set';

export interface CounterState {
  count: number;
  updatedAt: string;
}

export interface ToolResult extends Record<string, unknown> {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export function createInitialState(count = 0): CounterState {
  return { count, updatedAt: new Date().toISOString() };
}

export function applyCounterAction(state: CounterState, params: Record<string, unknown>): {
  state: CounterState;
  result: ToolResult;
} {
  const action = (params.action as CounterAction) || 'get';

  switch (action) {
    case 'get':
      return {
        state,
        result: {
          success: true,
          data: {
            action: 'get',
            current: state.count,
            updatedAt: state.updatedAt,
            hint: '修改前已返回当前值。可继续调用 increment/decrement/reset/set。',
          },
        },
      };

    case 'increment': {
      const next = createInitialState(state.count + 1);
      return {
        state: next,
        result: { success: true, data: { action: 'increment', previous: state.count, current: next.count } },
      };
    }

    case 'decrement': {
      const next = createInitialState(state.count - 1);
      return {
        state: next,
        result: { success: true, data: { action: 'decrement', previous: state.count, current: next.count } },
      };
    }

    case 'reset': {
      const next = createInitialState(0);
      return {
        state: next,
        result: { success: true, data: { action: 'reset', previous: state.count, current: 0 } },
      };
    }

    case 'set': {
      const raw = params.value;
      if (raw === undefined || raw === null || Number.isNaN(Number(raw))) {
        return {
          state,
          result: { success: false, error: 'action=set 需要有效的 value 参数' },
        };
      }
      const next = createInitialState(Number(raw));
      return {
        state: next,
        result: { success: true, data: { action: 'set', previous: state.count, current: next.count } },
      };
    }

    default:
      return {
        state,
        result: { success: false, error: `Unknown action: ${action}` },
      };
  }
}
