import type { Bridge } from '../bridge';
import type { ChatableXStorage } from '../types';

export function createStorageModule(bridge: Bridge): ChatableXStorage {
  return {
    get<T = unknown>(key: string): Promise<T | null> {
      return bridge.sendMessage('storage.get', { key }) as Promise<T | null>;
    },

    set<T = unknown>(key: string, value: T): Promise<void> {
      return bridge.sendMessage('storage.set', { key, value: value as unknown }) as Promise<void>;
    },

    delete(key: string): Promise<void> {
      return bridge.sendMessage('storage.delete', { key }) as Promise<void>;
    },
  };
}
