import { useCallback, useEffect, useRef, useState } from 'react';
import { initCounterBridge, isInsideChatableX, saveLocalCount, type CounterBridge } from './bridge';
import { createInitialState, type CounterState } from './counterStore';

export default function App() {
  const [state, setState] = useState<CounterState>(() => createInitialState(0));
  const [hosted, setHosted] = useState(false);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const bridgeRef = useRef<CounterBridge | null>(null);
  stateRef.current = state;

  const getState = useCallback(() => stateRef.current, []);
  const applyState = useCallback((next: CounterState) => {
    setState(next);
    if (!isInsideChatableX()) {
      saveLocalCount(next.count);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const inside = isInsideChatableX();
      setHosted(inside);
      const bridge = await initCounterBridge(getState, applyState);
      bridgeRef.current = bridge;
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [getState, applyState]);

  const bump = (delta: number) => {
    const next = createInitialState(state.count + delta);
    if (bridgeRef.current?.sdk) {
      bridgeRef.current.setCount(next.count);
    } else {
      applyState(next);
    }
  };

  const reset = () => {
    if (bridgeRef.current?.sdk) {
      bridgeRef.current.setCount(0);
    } else {
      applyState(createInitialState(0));
    }
  };

  return (
    <div className="page">
      <div className="card">
        <header className="header">
          <div className="badge">{hosted ? 'ChatableX' : '本地预览'}</div>
          <h1>Counter</h1>
          <p className="subtitle">先 <code>get</code> 查看，再修改 — 多轮对话零幻觉</p>
        </header>

        <div className="display" aria-live="polite">
          <span className="value">{ready ? state.count : '—'}</span>
        </div>

        <div className="controls">
          <button type="button" className="btn secondary" onClick={() => bump(-1)} aria-label="减一">−</button>
          <button type="button" className="btn ghost" onClick={reset}>重置</button>
          <button type="button" className="btn primary" onClick={() => bump(1)} aria-label="加一">+</button>
        </div>

        <footer className="footer">
          <p>对话示例：</p>
          <ul>
            <li>「先查看计数器当前值」→ <code>counter_control(get)</code></li>
            <li>「加一」→ <code>counter_control(increment)</code></li>
            <li>「设为 10」→ <code>counter_control(set, value=10)</code></li>
          </ul>
          {hosted && <p className="storage-hint">数据保存在宿主 <code>sdk.storage</code></p>}
        </footer>
      </div>
    </div>
  );
}
