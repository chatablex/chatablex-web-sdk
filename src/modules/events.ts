import type { Bridge } from '../bridge';
import type { EventType, EventCallbackMap, Unsubscribe, ChatableXEvents } from '../types';

export function createEventsModule(bridge: Bridge): ChatableXEvents {
  return {
    on<T extends EventType>(eventType: T, callback: EventCallbackMap[T]): Unsubscribe {
      bridge.sendMessage('events.subscribe', { eventType }).catch(() => {});
      return bridge.addEventListener(eventType, callback as (data: unknown) => void);
    },

    onAiResponse(callback) {
      return this.on('aiResponse', callback);
    },

    onToolExecution(callback) {
      return this.on('toolExecution', callback);
    },

    onUserMessage(callback) {
      return this.on('userMessage', callback);
    },
  };
}
