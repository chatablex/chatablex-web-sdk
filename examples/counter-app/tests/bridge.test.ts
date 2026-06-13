import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost } from '../../../tests/helpers/mockHost';
import { createInitialState } from '../src/counterStore';
import { handleCounterTool } from '../src/bridge';

describe('counter-app bridge', () => {
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

  it('get → increment roundtrip via toolExecution', async () => {
    const host = createMockHost({
      responses: {
        sdk_init: { success: true, data: { id: 'counter-app', name: 'Counter', version: '1.0.0', description: '' } },
        'storage.get': { success: true, data: null },
        'storage.set': { success: true },
      },
    });

    const { ChatableX } = await import('chatablex-web-sdk');
    let state = createInitialState(5);
    const getState = () => state;
    const setState = (s: typeof state) => { state = s; };

    const sdk = await ChatableX.init({ appId: 'counter-app' });
    sdk.tool.onExecute(async (params) => {
      const result = handleCounterTool(getState, setState, params);
      await sdk.storage.set('counter-app:count', getState());
      return result;
    });

    // Step 1: get current (demo flow)
    host.pushEvent('toolExecution', { action: 'get', _requestId: 'req_get', _toolName: 'counter_control' });
    await vi.waitFor(() => {
      const r = host.findByMethod('tool.executeResult');
      expect(r?.params).toMatchObject({ _requestId: 'req_get', success: true, data: { current: 5 } });
    });

    // Step 2: increment
    host.pushEvent('toolExecution', { action: 'increment', _requestId: 'req_inc', _toolName: 'counter_control' });
    await vi.waitFor(() => {
      const results = host.findAllByMethod('tool.executeResult');
      const inc = results.find((m) => m.params?._requestId === 'req_inc');
      expect(inc?.params).toMatchObject({ success: true, data: { current: 6 } });
    });

    expect(host.findByMethod('storage.set')).toBeDefined();
  });
});
