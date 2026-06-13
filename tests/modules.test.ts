import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';

describe('SDK modules', () => {
  let host: ReturnType<typeof createMockHost>;

  beforeEach(async () => {
    vi.resetModules();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;

    host = createMockHost({
      responses: {
        sdk_init: DEFAULT_SDK_INIT_RESPONSE,
        'ai.chat': { success: true, data: { content: 'hi', sessionId: 's1', messageId: 'm1', finished: true } },
        'ai.chatStream': { success: true, data: { streaming: true } },
        'ai.getContext': { success: true, data: { sessionId: 's1', name: 'test', messages: [], activeTools: [], activeSkills: [], createdAt: '', updatedAt: '' } },
        'tools.list': { success: true, data: [{ id: 't1', name: 'Tool', version: '1', description: '' }] },
        'tools.execute': { success: true, data: { success: true, toolId: 't1' } },
        'tools.executeWithConfirm': { success: true, data: { success: true, toolId: 't1' } },
        'ui.showNotification': { success: true },
        'ui.showConfirm': { success: true, data: true },
        'ui.pickFile': { success: true, data: '/path/file.txt' },
        'ui.openTab': { success: true },
        'ui.updateState': { success: true },
        'storage.get': { success: true, data: { count: 1 } },
        'storage.set': { success: true },
        'storage.delete': { success: true },
        'host.openInBrowser': { success: true },
        'events.subscribe': { success: true },
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
  });

  async function initSdk() {
    const { ChatableX } = await import('../src/index');
    return ChatableX.init({ appId: 'test-app' });
  }

  describe('sdk.ai', () => {
    it('sends ai.chat with message and options', async () => {
      const sdk = await initSdk();
      const resp = await sdk.ai.chat('hello', { sessionId: 'sess-1' });
      const msg = host.findByMethod('ai.chat');
      expect(msg!.params).toEqual({ message: 'hello', sessionId: 'sess-1' });
      expect(resp.content).toBe('hi');
    });

    it('sends ai.chatStream', async () => {
      const sdk = await initSdk();
      const resp = await sdk.ai.chatStream('stream me');
      expect(host.findByMethod('ai.chatStream')!.params).toEqual({ message: 'stream me' });
      expect(resp).toEqual({ streaming: true });
    });

    it('sends ai.getContext', async () => {
      const sdk = await initSdk();
      const ctx = await sdk.ai.getContext();
      expect(host.findByMethod('ai.getContext')).toBeDefined();
      expect(ctx.sessionId).toBe('s1');
    });
  });

  describe('sdk.tools', () => {
    it('lists, executes, and executes with confirm', async () => {
      const sdk = await initSdk();
      const list = await sdk.tools.list();
      expect(list).toHaveLength(1);

      await sdk.tools.execute('t1', { x: 1 });
      expect(host.findByMethod('tools.execute')!.params).toEqual({ toolId: 't1', params: { x: 1 } });

      await sdk.tools.executeWithConfirm('t1', { y: 2 });
      expect(host.findByMethod('tools.executeWithConfirm')!.params).toEqual({ toolId: 't1', params: { y: 2 } });
    });
  });

  describe('sdk.ui', () => {
    it('wraps all UI bridge methods', async () => {
      const sdk = await initSdk();
      await sdk.ui.showNotification('done', 'success');
      expect(host.findByMethod('ui.showNotification')!.params).toEqual({ message: 'done', type: 'success' });

      const confirmed = await sdk.ui.showConfirm('Title', 'Message');
      expect(confirmed).toBe(true);

      const path = await sdk.ui.pickFile({ accept: '.txt' });
      expect(path).toBe('/path/file.txt');

      await sdk.ui.openTab({ title: 'Tab', url: 'https://example.com' });
      expect(host.findByMethod('ui.openTab')!.params).toEqual({ title: 'Tab', url: 'https://example.com' });

      await sdk.ui.updateState({ key: 'value' });
      expect(host.findByMethod('ui.updateState')!.params).toEqual({ key: 'value' });
    });
  });

  describe('sdk.storage', () => {
    it('get, set, and delete keys', async () => {
      const sdk = await initSdk();
      const val = await sdk.storage.get<{ count: number }>('counter');
      expect(val).toEqual({ count: 1 });
      expect(host.findByMethod('storage.get')!.params).toEqual({ key: 'counter' });

      await sdk.storage.set('counter', 42);
      expect(host.findByMethod('storage.set')!.params).toEqual({ key: 'counter', value: 42 });

      await sdk.storage.delete('counter');
      expect(host.findByMethod('storage.delete')!.params).toEqual({ key: 'counter' });
    });
  });

  describe('sdk.platform', () => {
    it('sends host.openInBrowser with trimmed url', async () => {
      const sdk = await initSdk();
      await sdk.platform.openInBrowser('  https://example.com  ');
      expect(host.findByMethod('host.openInBrowser')!.params).toEqual({ url: 'https://example.com' });
    });

    it('rejects empty url', async () => {
      const sdk = await initSdk();
      await expect(sdk.platform.openInBrowser('')).rejects.toThrow('openInBrowser: targetUrl is required');
      await expect(sdk.platform.openInBrowser('   ')).rejects.toThrow('openInBrowser: targetUrl is required');
    });
  });

  describe('sdk.events', () => {
    it('subscribes via events.subscribe and delivers events locally', async () => {
      const sdk = await initSdk();
      let received: unknown;
      const unsub = sdk.events.on('streamingContent', (data) => { received = data; });

      expect(host.findByMethod('events.subscribe')!.params).toEqual({ eventType: 'streamingContent' });
      host.pushEvent('streamingContent', { chunk: 'token' });
      expect(received).toEqual({ chunk: 'token' });
      unsub();
    });

    it('convenience methods subscribe to correct event types', async () => {
      const sdk = await initSdk();
      const types: string[] = [];
      sdk.events.onAiResponse(() => { types.push('aiResponse'); });
      sdk.events.onToolExecution(() => { types.push('toolExecution'); });
      sdk.events.onUserMessage(() => { types.push('userMessage'); });

      const subs = host.findAllByMethod('events.subscribe');
      expect(subs.map((s) => s.params?.eventType)).toEqual(['aiResponse', 'toolExecution', 'userMessage']);
    });
  });
});
