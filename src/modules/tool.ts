import type { Bridge } from '../bridge';
import type { ToolInfo, ToolExecuteHandler, ChatableXToolModule } from '../types';

/**
 * Creates the `sdk.tool` module — the primary interface for LLM-driven
 * tool execution in a ChatableX WebUI app.
 */
export function createToolModule(bridge: Bridge, appId: string): ChatableXToolModule & { _setInfo(info: Partial<ToolInfo>): void } {
  let _info: ToolInfo = { id: appId, name: appId, version: '1.0.0', description: '' };
  let _handler: ToolExecuteHandler | null = null;

  const dispatch = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (!_handler) {
      return { success: false, error: 'No execute handler registered' };
    }
    try {
      return await _handler(params);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  };

  // Expose globally so Flutter can call it via runJavaScriptReturningResult
  window.__CHATABLEX_DISPATCH__ = dispatch;

  // Listen for toolExecution events pushed from Flutter.
  // If the event carries a _requestId, send the result back via the bridge
  // so Flutter can resolve its pending Completer.
  bridge.addEventListener('toolExecution', async (data) => {
    const params = data as Record<string, unknown>;
    const requestId = params._requestId as string | undefined;
    const result = await dispatch(params);
    if (requestId && window.ChatableXBridge) {
      window.ChatableXBridge.postMessage(JSON.stringify({
        method: 'tool.executeResult',
        params: { _requestId: requestId, ...result },
      }));
    }
  });

  return {
    getInfo(): ToolInfo {
      return { ..._info };
    },
    onExecute(handler: ToolExecuteHandler): void {
      _handler = handler;
    },
    /** @internal — called by SDK after handshake to fill in tool metadata */
    _setInfo(info: Partial<ToolInfo>): void {
      _info = { ..._info, ...info };
    },
  };
}
