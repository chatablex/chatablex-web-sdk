import type { Bridge } from '../bridge';
import type {
  AgentLockConfig,
  AgentLockEventType,
  AgentLockEventData,
  AgentLockEventHandler,
  ChatableXAgentLock,
} from '../types';
import beeLogo from '../assets/bee.png';

const DEFAULT_CONFIG: Required<AgentLockConfig> = {
  enabled: true,
  mode: 'overlay',
  logoUrl: '',
  message: 'Agent 正在操作，请稍候…',
  allowCancel: true,
  opacity: 0.3,
  timeout: 30_000,
  debounceUnlock: 200,
};

const OVERLAY_ID = '__chatablex_agent_lock_overlay__';

/**
 * Blocked event types — we intercept these on the overlay to prevent user
 * interaction from reaching the app underneath.
 */
const BLOCKED_EVENTS: string[] = [
  'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
  'keydown', 'keyup', 'keypress',
  'touchstart', 'touchmove', 'touchend',
  'wheel', 'scroll',
  'pointerdown', 'pointerup',
];

const CANCEL_BTN_ID = '__ctx_agent_lock_cancel__';

function blockEvent(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (target?.id === CANCEL_BTN_ID) return;
  e.stopPropagation();
  e.preventDefault();
}

export interface AgentLockModule extends ChatableXAgentLock {
  /**
   * @internal — called by tool module to lock before dispatch and schedule
   * unlock after result. Uses ref-counting to support consecutive tools.
   */
  _autoLock(requestId: string): void;
  /** @internal */
  _autoUnlock(requestId: string): void;
  /** @internal */
  _destroy(): void;
}

export function createAgentLockModule(
  _bridge: Bridge,
  userConfig: AgentLockConfig = {},
): AgentLockModule {
  const cfg: Required<AgentLockConfig> = { ...DEFAULT_CONFIG, ...userConfig };
  const logoSrc = cfg.logoUrl || beeLogo;

  const listeners = new Map<AgentLockEventType, Set<AgentLockEventHandler>>();
  let overlayEl: HTMLDivElement | null = null;
  let locked = false;
  let lockCount = 0;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentMessage = cfg.message;

  function emit(event: AgentLockEventType, data: Partial<AgentLockEventData> = {}): void {
    const payload: AgentLockEventData = { timestamp: Date.now(), ...data };
    const handlers = listeners.get(event);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(payload); } catch (e) { console.error('[ChatableX AgentLock] event handler error:', e); }
      }
    }
  }

  function injectOverlay(message: string): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:fixed', 'inset:0', `z-index:2147483646`,
      `background:rgba(255,255,255,${cfg.opacity})`,
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'pointer-events:all', 'user-select:none',
      'backdrop-filter:blur(1px)', '-webkit-backdrop-filter:blur(1px)',
    ].join(';');

    el.innerHTML = `
      <img src="${logoSrc}" alt="" style="width:48px;height:48px;animation:__ctx_spin 1.5s linear infinite;" />
      <p style="margin:12px 0 0;font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:#666;">${message}</p>
      ${cfg.allowCancel ? '<button id="__ctx_agent_lock_cancel__" style="margin-top:16px;background:none;border:none;color:#6366f1;font:13px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;text-decoration:underline;padding:4px 8px;">取消</button>' : ''}
    `;

    if (!document.getElementById('__ctx_agent_lock_style__')) {
      const style = document.createElement('style');
      style.id = '__ctx_agent_lock_style__';
      style.textContent = '@keyframes __ctx_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }

    for (const evt of BLOCKED_EVENTS) {
      el.addEventListener(evt, blockEvent, { capture: true, passive: false });
    }

    if (cfg.allowCancel) {
      // Defer binding so the DOM is ready
      queueMicrotask(() => {
        const btn = el.querySelector('#__ctx_agent_lock_cancel__');
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleCancel();
          });
        }
      });
    }

    document.body.appendChild(el);
    overlayEl = el;
  }

  function removeOverlay(): void {
    if (overlayEl) {
      for (const evt of BLOCKED_EVENTS) {
        overlayEl.removeEventListener(evt, blockEvent, { capture: true } as EventListenerOptions);
      }
      overlayEl.remove();
      overlayEl = null;
    }
    const style = typeof document !== 'undefined' ? document.getElementById('__ctx_agent_lock_style__') : null;
    if (style) style.remove();
  }

  function startTimeout(ms: number, requestId?: string): void {
    clearTimeoutTimer();
    if (ms <= 0) return;
    timeoutTimer = setTimeout(() => {
      console.warn('[ChatableX] Agent lock timeout — auto-unlocking');
      forceUnlock();
      emit('timeout', { requestId });
    }, ms);
  }

  function clearTimeoutTimer(): void {
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  function clearDebounceTimer(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function doLock(message: string, timeout: number, requestId?: string): void {
    if (locked) return;
    locked = true;
    currentMessage = message;

    if (cfg.mode === 'overlay') {
      injectOverlay(currentMessage);
    }
    startTimeout(timeout, requestId);
    emit('lock', { requestId });
  }

  function forceUnlock(requestId?: string): void {
    if (!locked) return;
    locked = false;
    lockCount = 0;
    clearTimeoutTimer();
    clearDebounceTimer();
    if (cfg.mode === 'overlay') {
      removeOverlay();
    }
    emit('unlock', { requestId });
  }

  function handleCancel(): void {
    const rid = undefined; // auto mode tracks this externally
    forceUnlock(rid);
    emit('cancel', { requestId: rid });
  }

  // Public API -----------------------------------------------------------------

  function lock(opts?: { message?: string; timeout?: number }): void {
    if (!cfg.enabled) return;
    const msg = opts?.message ?? cfg.message;
    const timeout = opts?.timeout ?? cfg.timeout;
    doLock(msg, timeout);
  }

  function unlock(): void {
    forceUnlock();
  }

  function isLocked(): boolean {
    return locked;
  }

  function on(event: AgentLockEventType, handler: AgentLockEventHandler): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => off(event, handler);
  }

  function off(event: AgentLockEventType, handler: AgentLockEventHandler): void {
    listeners.get(event)?.delete(handler);
  }

  // Internal auto-mode API (called by tool module) ----------------------------

  function _autoLock(requestId: string): void {
    if (!cfg.enabled) return;
    clearDebounceTimer();
    lockCount++;
    if (!locked) {
      doLock(cfg.message, cfg.timeout, requestId);
    }
  }

  function _autoUnlock(requestId: string): void {
    if (!cfg.enabled) return;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      clearDebounceTimer();
      debounceTimer = setTimeout(() => {
        if (lockCount === 0) {
          forceUnlock(requestId);
        }
      }, cfg.debounceUnlock);
    }
  }

  function _destroy(): void {
    forceUnlock();
    listeners.clear();
  }

  return { lock, unlock, isLocked, on, off, _autoLock, _autoUnlock, _destroy };
}
