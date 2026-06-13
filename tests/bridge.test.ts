import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Bridge } from '../src/bridge';
import { createMockHost } from './helpers/mockHost';

describe('Bridge', () => {
  let host: ReturnType<typeof createMockHost>;

  beforeEach(() => {
    host = createMockHost();
  });

  afterEach(() => {
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
  });

  describe('install', () => {
    it('installs ChatableXReceive on window', () => {
      const bridge = new Bridge();
      bridge.install();
      expect(typeof window.ChatableXReceive).toBe('function');
    });

    it('routes response messages to pending requests', async () => {
      const bridge = new Bridge();
      bridge.install();

      const promise = bridge.sendMessage('test.method', { foo: 'bar' });
      const sent = host.sent[0];
      expect(sent.method).toBe('test.method');
      expect(sent.params).toEqual({ foo: 'bar' });
      expect(sent.id).toMatch(/^ctx_\d+_\d+$/);

      host.respond(sent.id!, true, { result: 42 });
      await expect(promise).resolves.toEqual({ result: 42 });
    });

    it('rejects on error response', async () => {
      const bridge = new Bridge();
      bridge.install();

      const promise = bridge.sendMessage('fail.method');
      host.respond(host.sent[0].id!, false, undefined, 'Permission denied');
      await expect(promise).rejects.toThrow('Permission denied');
    });

    it('routes event messages to listeners', () => {
      const bridge = new Bridge();
      bridge.install();
      const handler = vi.fn();
      bridge.addEventListener('aiResponse', handler);

      host.pushEvent('aiResponse', { content: 'hello' });
      expect(handler).toHaveBeenCalledWith({ content: 'hello' });
    });

    it('ignores malformed JSON without throwing', () => {
      const bridge = new Bridge();
      bridge.install();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.ChatableXReceive!('not-json{{{');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('waitForBridge', () => {
    it('resolves immediately when bridge is already available', async () => {
      const bridge = new Bridge();
      await expect(bridge.waitForBridge(1000)).resolves.toBeUndefined();
    });

    it('waits until bridge becomes available', async () => {
      delete window.ChatableXBridge;
      const bridge = new Bridge();
      const promise = bridge.waitForBridge(2000);
      setTimeout(() => {
        window.ChatableXBridge = { postMessage: () => {} };
      }, 100);
      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when bridge times out', async () => {
      delete window.ChatableXBridge;
      const bridge = new Bridge();
      await expect(bridge.waitForBridge(150)).rejects.toThrow('ChatableXBridge not available');
    });
  });

  describe('sendMessage', () => {
    it('includes timestamp in outgoing message', async () => {
      const bridge = new Bridge();
      bridge.install();
      const before = Date.now();
      const promise = bridge.sendMessage('ping');
      const sent = host.sent[0];
      expect(sent.timestamp).toBeGreaterThanOrEqual(before);
      host.respond(sent.id!, true);
      await promise;
    });

    it('rejects when bridge is not available', async () => {
      delete window.ChatableXBridge;
      const bridge = new Bridge();
      bridge.install();
      await expect(bridge.sendMessage('ping')).rejects.toThrow('ChatableXBridge not available');
    });

    it('rejects on request timeout', async () => {
      vi.useFakeTimers();
      const bridge = new Bridge();
      bridge.install();
      const promise = bridge.sendMessage('slow.method', {}, 1000);
      vi.advanceTimersByTime(1001);
      await expect(promise).rejects.toThrow('Request timeout: slow.method');
      vi.useRealTimers();
    });
  });

  describe('addEventListener', () => {
    it('unsubscribe removes the handler', () => {
      const bridge = new Bridge();
      bridge.install();
      const handler = vi.fn();
      const unsub = bridge.addEventListener('userMessage', handler);

      host.pushEvent('userMessage', { text: 'hi' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      host.pushEvent('userMessage', { text: 'again' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('isolates errors in one handler from others', () => {
      const bridge = new Bridge();
      bridge.install();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const good = vi.fn();
      bridge.addEventListener('toolExecution', () => { throw new Error('boom'); });
      bridge.addEventListener('toolExecution', good);

      host.pushEvent('toolExecution', { action: 'test' });
      expect(good).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('rejects pending requests and clears listeners', async () => {
      const bridge = new Bridge();
      bridge.install();
      const handler = vi.fn();
      bridge.addEventListener('close', handler);

      const promise = bridge.sendMessage('pending');
      bridge.destroy();

      await expect(promise).rejects.toThrow('Bridge destroyed');
      expect(window.ChatableXReceive).toBeUndefined();

      // Listeners cleared — dispatchEvent no longer invokes handlers.
      bridge.dispatchEvent('close', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
