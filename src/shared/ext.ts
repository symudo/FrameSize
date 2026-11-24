/**
 * 跨浏览器扩展 API 统一入口（Chrome / Edge / Firefox MV3）。
 * 现代 Chromium MV3 与 Firefox 109+ 均原生支持 Promise 返回。
 */
const globalScope = globalThis as unknown as {
  browser?: typeof chrome;
  chrome: typeof chrome;
};

export const ext: typeof chrome = globalScope.browser ?? globalScope.chrome;

export const isFirefox =
  typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

export const isEdge =
  typeof navigator !== 'undefined' && /edg\//i.test(navigator.userAgent);

export const NATIVE_HOST_NAME = 'dev.framesize.helper';

export function getBrowserKind(): 'chrome' | 'edge' | 'firefox' {
  if (isFirefox) return 'firefox';
  if (isEdge) return 'edge';
  return 'chrome';
}

/**
 * 获取会话级存储（用于 Undo 历史、边框差值缓存），
 * 若运行环境不支持 storage.session 则平滑回退到 storage.local。
 */
export function getSessionStorage(): chrome.storage.StorageArea {
  return ext.storage.session ?? ext.storage.local;
}

export function getShortcutsPageUrl(): string {
  if (isFirefox) return 'about:addons';
  if (isEdge) return 'edge://extensions/shortcuts';
  return 'chrome://extensions/shortcuts';
}
