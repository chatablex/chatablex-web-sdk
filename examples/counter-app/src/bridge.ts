import type { ChatableXSDK } from 'chatablex-web-sdk';
import { ChatableX } from 'chatablex-web-sdk';
import { applyCounterAction, createInitialState, STORAGE_KEY, type CounterState } from './counterStore';

export function isInsideChatableX(): boolean {
  return typeof window.ChatableXBridge === 'object' && window.ChatableXBridge !== null;
}

/** Dev fallback — mirrors sdk.storage key in localStorage. */
export function loadLocalCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as CounterState;
    return typeof parsed.count === 'number' ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function saveLocalCount(count: number): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createInitialState(count)));
}

async function loadFromSdk(sdk: ChatableXSDK): Promise<CounterState> {
  const saved = await sdk.storage.get<CounterState>(STORAGE_KEY);
  if (saved && typeof saved.count === 'number') {
    return saved;
  }
  return createInitialState(0);
}

async function saveToSdk(sdk: ChatableXSDK, state: CounterState): Promise<void> {
  await sdk.storage.set(STORAGE_KEY, state);
}

export type CounterBridge = {
  sdk: ChatableXSDK | null;
  getState: () => CounterState;
  setCount: (count: number) => void;
};

export async function initCounterBridge(
  getState: () => CounterState,
  setState: (state: CounterState) => void,
): Promise<CounterBridge> {
  if (!isInsideChatableX()) {
    const count = loadLocalCount();
    setState(createInitialState(count));
    return { sdk: null, getState, setCount: (n) => setState(createInitialState(n)) };
  }

  const sdk = await ChatableX.init({ appId: 'counter-app', debug: true });
  const restored = await loadFromSdk(sdk);
  setState(restored);

  sdk.tool.onExecute(async (params) => {
    const current = getState();
    const { state: next, result } = applyCounterAction(current, params);
    setState(next);
    await saveToSdk(sdk, next);
    return result;
  });

  return {
    sdk,
    getState,
    setCount: (n: number) => {
      const next = createInitialState(n);
      setState(next);
      void saveToSdk(sdk, next);
    },
  };
}

/** Standalone handler for tests without React. */
export function handleCounterTool(
  getState: () => CounterState,
  setState: (s: CounterState) => void,
  params: Record<string, unknown>,
) {
  const { state, result } = applyCounterAction(getState(), params);
  setState(state);
  return result;
}
