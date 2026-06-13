import { describe, it, expect } from 'vitest';
import { applyCounterAction, createInitialState } from '../src/counterStore';

describe('counterStore', () => {
  it('get returns current count without mutation', () => {
    const state = createInitialState(7);
    const { state: next, result } = applyCounterAction(state, { action: 'get' });
    expect(next.count).toBe(7);
    expect(result.success).toBe(true);
    expect(result.data?.current).toBe(7);
    expect(result.data?.action).toBe('get');
  });

  it('increment from get-known state', () => {
    let state = createInitialState(3);
    const get = applyCounterAction(state, { action: 'get' });
    expect(get.result.data?.current).toBe(3);

    const inc = applyCounterAction(state, { action: 'increment' });
    state = inc.state;
    expect(inc.result.data?.current).toBe(4);
    expect(inc.result.data?.previous).toBe(3);
  });

  it('set requires value', () => {
    const { result } = applyCounterAction(createInitialState(0), { action: 'set' });
    expect(result.success).toBe(false);
  });

  it('set updates to target value', () => {
    const { state, result } = applyCounterAction(createInitialState(1), { action: 'set', value: 42 });
    expect(state.count).toBe(42);
    expect(result.data?.current).toBe(42);
  });

  it('reset clears to zero', () => {
    const { state, result } = applyCounterAction(createInitialState(99), { action: 'reset' });
    expect(state.count).toBe(0);
    expect(result.data?.current).toBe(0);
  });
});
