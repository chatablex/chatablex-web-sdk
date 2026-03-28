import type { Bridge } from '../bridge';
import type { ToolInfo, ToolResult, ChatableXTools } from '../types';

export function createToolsModule(bridge: Bridge): ChatableXTools {
  return {
    list(): Promise<ToolInfo[]> {
      return bridge.sendMessage('tools.list', {}) as Promise<ToolInfo[]>;
    },

    execute(toolId: string, params: Record<string, unknown>): Promise<ToolResult> {
      return bridge.sendMessage('tools.execute', { toolId, params }) as Promise<ToolResult>;
    },

    executeWithConfirm(toolId: string, params: Record<string, unknown>): Promise<ToolResult> {
      return bridge.sendMessage('tools.executeWithConfirm', { toolId, params }) as Promise<ToolResult>;
    },
  };
}
