import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';

/**
 * End-to-end flow mirroring production:
 *
 *   Flutter host  →  toolExecution event  →  sdk.tool.onExecute
 *                 ←  tool.executeResult (with _requestId)
 */
describe('Bridge protocol integration', () => {
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

  it('full init → execute → result roundtrip', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');

    const sdk = await ChatableX.init({ appId: 'counter-app' });
    expect(typeof window.ChatableXReceive).toBe('function');

    const executed: Record<string, unknown>[] = [];
    sdk.tool.onExecute(async (params) => {
      executed.push(params);
      return { success: true, data: { value: (params.value as number) + 1 } };
    });

    host.pushEvent('toolExecution', {
      action: 'increment',
      value: 5,
      _toolName: 'counter-app',
      _requestId: 'call_abc',
    });

    await vi.waitFor(() => {
      expect(executed).toHaveLength(1);
      const result = host.findByMethod('tool.executeResult');
      expect(result).toBeDefined();
      expect(result!.params).toMatchObject({
        _requestId: 'call_abc',
        success: true,
        data: { value: 6 },
      });
    });
  });

  it('message format matches Flutter bridge contract', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    await ChatableX.init({ appId: 'my-app' });

    const initMsg = host.findByMethod('sdk_init');
    expect(initMsg).toMatchObject({
      method: 'sdk_init',
      params: { appId: 'my-app' },
    });
    expect(initMsg!.id).toMatch(/^ctx_\d+_\d+$/);
    expect(typeof initMsg!.timestamp).toBe('number');
  });

  it('storage roundtrip through SDK', async () => {
    const host = createMockHost({
      responses: {
        sdk_init: DEFAULT_SDK_INIT_RESPONSE,
        'storage.set': { success: true },
        'storage.get': { success: true, data: 'stored-value' },
      },
    });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'storage-app' });

    await sdk.storage.set('key', 'stored-value');
    const val = await sdk.storage.get<string>('key');
    expect(val).toBe('stored-value');
    expect(host.findByMethod('storage.set')).toBeDefined();
    expect(host.findByMethod('storage.get')).toBeDefined();
  });

  it('ai chat error propagates from host', async () => {
    const host = createMockHost({
      responses: {
        sdk_init: DEFAULT_SDK_INIT_RESPONSE,
        'ai.chat': { success: false, error: 'Permission denied: aiChat' },
      },
    });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'ai-app' });

    await expect(sdk.ai.chat('hello')).rejects.toThrow('Permission denied: aiChat');
    expect(host.findByMethod('ai.chat')).toBeDefined();
  });
});
