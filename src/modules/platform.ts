import type { Bridge } from '../bridge';
import type { ChatableXPlatform } from '../types';

export function createPlatformModule(bridge: Bridge): ChatableXPlatform {
  return {
    async openInBrowser(targetUrl: string): Promise<void> {
      const url = typeof targetUrl === 'string' ? targetUrl.trim() : '';
      if (!url) {
        throw new Error('openInBrowser: targetUrl is required');
      }
      await bridge.sendMessage('host.openInBrowser', { url });
    },
  };
}
