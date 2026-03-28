import type { Bridge } from '../bridge';
import type { NotificationType, FilePickerOptions, TabConfig, StateUpdate, ChatableXUI } from '../types';

export function createUIModule(bridge: Bridge): ChatableXUI {
  return {
    showNotification(message: string, type: NotificationType = 'info'): Promise<void> {
      return bridge.sendMessage('ui.showNotification', { message, type }) as Promise<void>;
    },

    showConfirm(title: string, message: string): Promise<boolean> {
      return bridge.sendMessage('ui.showConfirm', { title, message }) as Promise<boolean>;
    },

    pickFile(options?: FilePickerOptions): Promise<string | null> {
      return bridge.sendMessage('ui.pickFile', options ?? {}) as Promise<string | null>;
    },

    openTab(config: TabConfig): Promise<void> {
      return bridge.sendMessage('ui.openTab', config as unknown as Record<string, unknown>) as Promise<void>;
    },

    updateState(state: StateUpdate): Promise<void> {
      return bridge.sendMessage('ui.updateState', state as Record<string, unknown>) as Promise<void>;
    },
  };
}
