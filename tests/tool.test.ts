import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';

describe('sdk.tool', () => {
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

  async function initSdk() {
    createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    return ChatableX.init({ appId: 'test-app' });
  }

  it('registers onExecute handler and exposes __CHATABLEX_DISPATCH__', async () => {
    const sdk = await initSdk();
    const handler = vi.fn().mockResolvedValue({ success: true, data: 'ok' });
    sdk.tool.onExecute(handler);

    expect(typeof window.__CHATABLEX_DISPATCH__).toBe('function');
    const result = await window.__CHATABLEX_DISPATCH__!({ action: 'ping' });
    expect(result).toEqual({ success: true, data: 'ok' });
    expect(handler).toHaveBeenCalledWith({ action: 'ping' });
  });

  it('returns error when no handler is registered', async () => {
    createMockHost();
    const { createToolModule } = await import('../src/modules/tool');
    const { Bridge } = await import('../src/bridge');
    const bridge = new Bridge();
    bridge.install();
    createToolModule(bridge, 'orphan');

    const result = await window.__CHATABLEX_DISPATCH__!({ action: 'test' });
    expect(result).toEqual({ success: false, error: 'No execute handler registered' });
  });

  it('catches handler exceptions and returns error result', async () => {
    const sdk = await initSdk();
    sdk.tool.onExecute(async () => {
      throw new Error('handler crashed');
    });

    const result = await window.__CHATABLEX_DISPATCH__!({});
    expect(result).toEqual({ success: false, error: 'handler crashed' });
  });

  it('handles toolExecution event and sends tool.executeResult with _requestId', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app' });

    sdk.tool.onExecute(async (params) => ({
      success: true,
      data: { echoed: params.action },
    }));

    host.pushEvent('toolExecution', { action: 'increment', _requestId: 'req_123', _toolName: 'test-app' });

    await vi.waitFor(() => {
      const resultMsg = host.findByMethod('tool.executeResult');
      expect(resultMsg).toBeDefined();
      expect(resultMsg!.params).toEqual({
        _requestId: 'req_123',
        success: true,
        data: { echoed: 'increment' },
      });
    });
  });

  it('does not send tool.executeResult when _requestId is missing', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app' });
    sdk.tool.onExecute(async () => ({ success: true }));

    host.pushEvent('toolExecution', { action: 'noop' });
    await new Promise((r) => setTimeout(r, 50));
    expect(host.findByMethod('tool.executeResult')).toBeUndefined();
  });

  it('overwrites handler when onExecute is called twice', async () => {
    const sdk = await initSdk();
    const first = vi.fn().mockResolvedValue({ success: true, data: 'first' });
    const second = vi.fn().mockResolvedValue({ success: true, data: 'second' });

    sdk.tool.onExecute(first);
    sdk.tool.onExecute(second);

    const result = await window.__CHATABLEX_DISPATCH__!({});
    expect(result.data).toBe('second');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
