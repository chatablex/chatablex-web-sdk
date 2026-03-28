import type { Bridge } from '../bridge';
import type { ChatOptions, ChatResponse, SessionContext, ChatableXAI } from '../types';

export function createAIModule(bridge: Bridge): ChatableXAI {
  return {
    chat(message: string, options?: ChatOptions): Promise<ChatResponse> {
      return bridge.sendMessage('ai.chat', { message, ...options }) as Promise<ChatResponse>;
    },

    chatStream(message: string, options?: ChatOptions): Promise<unknown> {
      return bridge.sendMessage('ai.chatStream', { message, ...options });
    },

    getContext(): Promise<SessionContext> {
      return bridge.sendMessage('ai.getContext', {}) as Promise<SessionContext>;
    },
  };
}
