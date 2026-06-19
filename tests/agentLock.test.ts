import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';

const OVERLAY_ID = '__chatablex_agent_lock_overlay__';
const STYLE_ID = '__ctx_agent_lock_style__';

function getOverlay(): HTMLElement | null {
  return document.getElementById(OVERLAY_ID);
}

describe('sdk.agentLock', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  });

  async function initSdk(agentLock?: Record<string, unknown>) {
    createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    return ChatableX.init({ appId: 'test-app', agentLock });
  }

  // -----------------------------------------------------------------------
  // FR-01: SDK exposes agentLock module
  // -----------------------------------------------------------------------
  it('exposes agentLock with lock/unlock/isLocked/on/off', async () => {
    const sdk = await initSdk();
    expect(sdk.agentLock).toBeDefined();
    expect(typeof sdk.agentLock.lock).toBe('function');
    expect(typeof sdk.agentLock.unlock).toBe('function');
    expect(typeof sdk.agentLock.isLocked).toBe('function');
    expect(typeof sdk.agentLock.on).toBe('function');
    expect(typeof sdk.agentLock.off).toBe('function');
  });

  // -----------------------------------------------------------------------
  // FR-02: Auto lock during tool execution
  // -----------------------------------------------------------------------
  it('auto-locks when toolExecution event arrives and unlocks after result', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app' });

    sdk.tool.onExecute(async () => ({ success: true, data: 'done' }));

    expect(sdk.agentLock.isLocked()).toBe(false);

    host.pushEvent('toolExecution', { action: 'test', _requestId: 'req_1', _toolName: 'test-app' });

    // The lock should engage synchronously before dispatch
    // Need to give event handler a tick to start
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.agentLock.isLocked()).toBe(true);

    // Wait for handler to complete + debounce
    await vi.advanceTimersByTimeAsync(250);
    expect(sdk.agentLock.isLocked()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // FR-03: Overlay blocks user input
  // -----------------------------------------------------------------------
  it('injects overlay element with correct attributes when locked', async () => {
    const sdk = await initSdk();
    sdk.agentLock.lock();

    const overlay = getOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute('aria-hidden')).toBe('true');
    expect(overlay!.style.position).toBe('fixed');
    expect(overlay!.style.zIndex).toBe('2147483646');
    expect(overlay!.style.pointerEvents).toBe('all');

    sdk.agentLock.unlock();
    expect(getOverlay()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // FR-04: Brand loading indicator
  // -----------------------------------------------------------------------
  it('shows default message and logo in overlay', async () => {
    const sdk = await initSdk();
    sdk.agentLock.lock();

    const overlay = getOverlay()!;
    expect(overlay.querySelector('img')).not.toBeNull();
    expect(overlay.textContent).toContain('Agent 正在操作，请稍候…');

    sdk.agentLock.unlock();
  });

  it('supports custom message via config', async () => {
    const sdk = await initSdk({ message: 'Please wait...' });
    sdk.agentLock.lock();

    const overlay = getOverlay()!;
    expect(overlay.textContent).toContain('Please wait...');

    sdk.agentLock.unlock();
  });

  it('supports custom message via lock() opts', async () => {
    const sdk = await initSdk();
    sdk.agentLock.lock({ message: 'Generating animation...' });

    const overlay = getOverlay()!;
    expect(overlay.textContent).toContain('Generating animation...');

    sdk.agentLock.unlock();
  });

  // -----------------------------------------------------------------------
  // FR-05: Timeout auto-unlock
  // -----------------------------------------------------------------------
  it('auto-unlocks after timeout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdk = await initSdk({ timeout: 5000 });
    const timeoutHandler = vi.fn();
    sdk.agentLock.on('timeout', timeoutHandler);

    sdk.agentLock.lock();
    expect(sdk.agentLock.isLocked()).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(sdk.agentLock.isLocked()).toBe(false);
    expect(timeoutHandler).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('timeout'));

    warnSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // FR-06: Cancel button
  // -----------------------------------------------------------------------
  it('renders cancel button and emits cancel event on click', async () => {
    const sdk = await initSdk({ allowCancel: true });
    const cancelHandler = vi.fn();
    sdk.agentLock.on('cancel', cancelHandler);

    sdk.agentLock.lock();
    await vi.advanceTimersByTimeAsync(0); // let queueMicrotask run

    const btn = document.getElementById('__ctx_agent_lock_cancel__');
    expect(btn).not.toBeNull();

    btn!.click();
    expect(sdk.agentLock.isLocked()).toBe(false);
    expect(cancelHandler).toHaveBeenCalledTimes(1);
  });

  it('hides cancel button when allowCancel is false', async () => {
    const sdk = await initSdk({ allowCancel: false });
    sdk.agentLock.lock();

    const btn = document.getElementById('__ctx_agent_lock_cancel__');
    expect(btn).toBeNull();

    sdk.agentLock.unlock();
  });

  // -----------------------------------------------------------------------
  // FR-07: Manual lock/unlock API
  // -----------------------------------------------------------------------
  it('manual lock() and unlock() work correctly', async () => {
    const sdk = await initSdk();

    sdk.agentLock.lock();
    expect(sdk.agentLock.isLocked()).toBe(true);
    expect(getOverlay()).not.toBeNull();

    sdk.agentLock.unlock();
    expect(sdk.agentLock.isLocked()).toBe(false);
    expect(getOverlay()).toBeNull();
  });

  it('repeated lock() is idempotent', async () => {
    const sdk = await initSdk();
    const lockHandler = vi.fn();
    sdk.agentLock.on('lock', lockHandler);

    sdk.agentLock.lock();
    sdk.agentLock.lock();
    sdk.agentLock.lock();

    expect(lockHandler).toHaveBeenCalledTimes(1);
    expect(sdk.agentLock.isLocked()).toBe(true);

    sdk.agentLock.unlock();
  });

  it('repeated unlock() is a no-op', async () => {
    const sdk = await initSdk();
    const unlockHandler = vi.fn();
    sdk.agentLock.on('unlock', unlockHandler);

    sdk.agentLock.unlock();
    sdk.agentLock.unlock();
    expect(unlockHandler).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // FR-08: Consecutive tools don't flicker
  // -----------------------------------------------------------------------
  it('consecutive tool executions keep overlay visible (no flicker)', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app', agentLock: { debounceUnlock: 200 } });

    sdk.tool.onExecute(async () => ({ success: true, data: 'ok' }));

    // First tool execution
    host.pushEvent('toolExecution', { action: 'a', _requestId: 'req_1', _toolName: 'test-app' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.agentLock.isLocked()).toBe(true);

    // First tool completes — unlock debounced
    await vi.advanceTimersByTimeAsync(10);

    // Second tool arrives within debounce window
    host.pushEvent('toolExecution', { action: 'b', _requestId: 'req_2', _toolName: 'test-app' });
    await vi.advanceTimersByTimeAsync(0);

    // Still locked (debounce cancelled by new lock)
    expect(sdk.agentLock.isLocked()).toBe(true);

    // Second tool completes + debounce expires
    await vi.advanceTimersByTimeAsync(250);
    expect(sdk.agentLock.isLocked()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // FR-09: Events-only mode
  // -----------------------------------------------------------------------
  it('events-only mode emits events but does not inject overlay', async () => {
    const sdk = await initSdk({ mode: 'events-only' });
    const lockHandler = vi.fn();
    const unlockHandler = vi.fn();
    sdk.agentLock.on('lock', lockHandler);
    sdk.agentLock.on('unlock', unlockHandler);

    sdk.agentLock.lock();
    expect(sdk.agentLock.isLocked()).toBe(true);
    expect(getOverlay()).toBeNull();
    expect(lockHandler).toHaveBeenCalledTimes(1);

    sdk.agentLock.unlock();
    expect(sdk.agentLock.isLocked()).toBe(false);
    expect(unlockHandler).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // FR-10: Bridge communication unaffected (implicit — overlay is DOM-only)
  // -----------------------------------------------------------------------
  it('bridge communication works while locked', async () => {
    const host = createMockHost({
      responses: {
        sdk_init: DEFAULT_SDK_INIT_RESPONSE,
        'storage.get': { success: true, data: { value: 42 } },
      },
    });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app' });

    sdk.agentLock.lock();
    expect(sdk.agentLock.isLocked()).toBe(true);

    const val = await sdk.storage.get('key');
    expect(val).toEqual({ value: 42 });

    sdk.agentLock.unlock();
  });

  // -----------------------------------------------------------------------
  // FR-11: aria-hidden accessibility
  // -----------------------------------------------------------------------
  it('overlay has aria-hidden="true"', async () => {
    const sdk = await initSdk();
    sdk.agentLock.lock();

    expect(getOverlay()!.getAttribute('aria-hidden')).toBe('true');

    sdk.agentLock.unlock();
  });

  // -----------------------------------------------------------------------
  // FR-12: Backward compatibility — enabled: false disables everything
  // -----------------------------------------------------------------------
  it('does nothing when enabled: false', async () => {
    const sdk = await initSdk({ enabled: false });
    sdk.agentLock.lock();

    expect(sdk.agentLock.isLocked()).toBe(false);
    expect(getOverlay()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Event on/off
  // -----------------------------------------------------------------------
  it('on() returns unsubscribe function and off() removes handler', async () => {
    const sdk = await initSdk();
    const handler = vi.fn();

    const unsub = sdk.agentLock.on('lock', handler);

    sdk.agentLock.lock();
    expect(handler).toHaveBeenCalledTimes(1);
    sdk.agentLock.unlock();

    unsub();

    sdk.agentLock.lock();
    expect(handler).toHaveBeenCalledTimes(1); // not called again
    sdk.agentLock.unlock();
  });

  // -----------------------------------------------------------------------
  // Custom timeout via lock() opts
  // -----------------------------------------------------------------------
  it('lock() opts.timeout overrides default', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sdk = await initSdk({ timeout: 30000 });

    sdk.agentLock.lock({ timeout: 1000 });
    expect(sdk.agentLock.isLocked()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(sdk.agentLock.isLocked()).toBe(false);

    warnSpy.mockRestore();
  });
});
