import { ext, getBrowserKind, NATIVE_HOST_NAME } from '../shared/ext';
import { computeSplitLayout } from '../shared/geometry';
import { loadAppData } from '../shared/storage';
import type {
  DevToolsState,
  RuntimeMessage,
  ScreenWorkArea,
  SplitDirection,
} from '../shared/types';

interface NativeHelperRequest {
  action: 'ping' | 'get_status' | 'toggle_pin' | 'toggle_collapse' | 'expand' | 'toggle_opacity' | 'move_resize';
  browser?: 'chrome' | 'edge' | 'firefox';
  target?: { left: number; top: number; width: number; height: number };
  moveRect?: { left: number; top: number; width: number; height: number };
  opacity?: number;
}

interface NativeHelperResponse {
  ok: boolean;
  version?: string;
  found?: boolean;
  pinned?: boolean;
  collapsed?: boolean;
  translucent?: boolean;
  opacity?: number;
  title?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendNative(req: NativeHelperRequest): Promise<NativeHelperResponse | null> {
  if (!ext.runtime?.sendNativeMessage) {
    return null;
  }
  try {
    const res = (await ext.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      ...req,
      browser: req.browser ?? getBrowserKind(),
    })) as NativeHelperResponse | undefined;
    return res ?? null;
  } catch {
    return null;
  }
}

export async function findDevToolsWindow(): Promise<chrome.windows.Window | null> {
  try {
    const all = await ext.windows.getAll({ windowTypes: ['devtools'] });
    if (!all || all.length === 0) return null;
    const focused = all.find((w) => w.focused);
    if (focused) return focused;
    const normal = all.find((w) => w.state !== 'minimized');
    return normal ?? all[0];
  } catch {
    return null;
  }
}

function toTargetRect(win: chrome.windows.Window | null) {
  if (!win || win.state === 'minimized') return undefined;
  return {
    left: win.left ?? 0,
    top: win.top ?? 0,
    width: win.width ?? 0,
    height: win.height ?? 0,
  };
}

function buildStateFromNative(
  dtWin: chrome.windows.Window | null,
  native: NativeHelperResponse | null
): DevToolsState {
  const helperConnected = Boolean(native?.ok);
  const foundByNative = Boolean(native?.ok && native.found);
  const hasDevTools = Boolean(dtWin) || foundByNative;

  return {
    hasDevTools,
    windowId: dtWin?.id ?? null,
    helperConnected,
    helperVersion: native?.version ?? null,
    pinned: foundByNative ? Boolean(native?.pinned) : false,
    collapsed: foundByNative
      ? Boolean(native?.collapsed)
      : dtWin?.state === 'minimized',
    translucent: foundByNative ? Boolean(native?.translucent) : false,
    opacity: foundByNative && native?.opacity ? native.opacity : 100,
    title: native?.title ?? null,
  };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 防抖同步广播 DevTools 状态，避免快速切换窗口/标签页时短时间多次拉起本地 Helper 进程。
 */
export function scheduleDevToolsBroadcast(delayMs = 220): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    try {
      const { settings } = await loadAppData();
      if (!settings.devtoolsFloatingBar) return;
      const state = await getDevToolsState();
      await broadcastDevToolsState(state);
    } catch {
      // ignore
    }
  }, delayMs);
}

export async function broadcastDevToolsState(state: DevToolsState): Promise<void> {
  try {
    const tabs = await ext.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      ext.tabs
        .sendMessage(tab.id, {
          type: 'DEVTOOLS_STATE_UPDATED',
          state,
        } satisfies RuntimeMessage)
        .catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * 双路探测：同时检查浏览器 API 与 Windows Native Helper，
 * 避免 Chrome/Edge 隔离策略隐藏独立 DevTools 窗口导致按钮不可见。
 */
export async function getDevToolsState(): Promise<DevToolsState> {
  const dtWin = await findDevToolsWindow();
  const nativeStatus = await sendNative({
    action: 'get_status',
    target: toTargetRect(dtWin),
  });
  return buildStateFromNative(dtWin, nativeStatus);
}

export async function hasUndockedDevTools(): Promise<boolean> {
  const state = await getDevToolsState();
  return state.hasDevTools;
}

export async function toggleDevToolsPin(): Promise<{
  state: DevToolsState;
  changed: boolean;
  needsHelper: boolean;
}> {
  const dtWin = await findDevToolsWindow();
  const res = await sendNative({
    action: 'toggle_pin',
    target: toTargetRect(dtWin),
  });

  if (!res || !res.ok) {
    const fallbackState = await getDevToolsState();
    return { state: fallbackState, changed: false, needsHelper: true };
  }

  const state = buildStateFromNative(dtWin, res);
  await broadcastDevToolsState(state);
  return {
    state,
    changed: Boolean(res.found),
    needsHelper: false,
  };
}

export async function toggleDevToolsOpacity(): Promise<{
  state: DevToolsState;
  changed: boolean;
  needsHelper: boolean;
}> {
  const dtWin = await findDevToolsWindow();
  const { settings } = await loadAppData();
  const res = await sendNative({
    action: 'toggle_opacity',
    target: toTargetRect(dtWin),
    opacity: settings.devtoolsOpacity,
  });

  if (!res || !res.ok) {
    const fallbackState = await getDevToolsState();
    return { state: fallbackState, changed: false, needsHelper: true };
  }

  const state = buildStateFromNative(dtWin, res);
  await broadcastDevToolsState(state);
  return {
    state,
    changed: Boolean(res.found),
    needsHelper: false,
  };
}

/**
 * 干净收起为悬浮按钮 / 原位展开（彻底替代有 DWM 边框残影的卷帘裁切）。
 * 有 Helper 时通过 Win32 原生最小化与恢复（自动保留置顶状态、不抢焦点）；
 * 未装 Helper 时平滑降级为浏览器原生 windows.update minimized/normal。
 */
export async function toggleDevToolsCollapse(): Promise<{
  state: DevToolsState;
  changed: boolean;
  collapsed: boolean;
}> {
  const dtWin = await findDevToolsWindow();

  const nativeRes = await sendNative({
    action: 'toggle_collapse',
    target: toTargetRect(dtWin),
  });

  if (nativeRes?.ok && nativeRes.found) {
    const state = buildStateFromNative(dtWin, nativeRes);
    await broadcastDevToolsState(state);
    return {
      state,
      changed: true,
      collapsed: state.collapsed,
    };
  }

  // 未安装 Helper 时使用纯插件窗口最小化/恢复
  if (dtWin && dtWin.id !== undefined) {
    const willCollapse = dtWin.state !== 'minimized';
    await ext.windows.update(dtWin.id, {
      state: willCollapse ? 'minimized' : 'normal',
      ...(willCollapse ? {} : { focused: true }),
    });
    const nextState = await getDevToolsState();
    await broadcastDevToolsState(nextState);
    return {
      state: nextState,
      changed: true,
      collapsed: willCollapse,
    };
  }

  const fallback = buildStateFromNative(null, nativeRes);
  return { state: fallback, changed: false, collapsed: false };
}

export async function dockDevToolsToRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Promise<boolean> {
  const dtWin = await findDevToolsWindow();
  if (dtWin && dtWin.id !== undefined) {
    if (dtWin.state && dtWin.state !== 'normal') {
      await ext.windows.update(dtWin.id, { state: 'normal', focused: false });
      await sleep(50);
    }
    await ext.windows.update(dtWin.id, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    const state = await getDevToolsState();
    await broadcastDevToolsState(state);
    return true;
  }

  // 若浏览器 API 屏蔽了 DevTools，直接由 Native Helper 通过 Win32 移动定位
  const res = await sendNative({
    action: 'move_resize',
    moveRect: rect,
  });
  if (res?.ok && res.found) {
    const state = buildStateFromNative(null, res);
    await broadcastDevToolsState(state);
    return true;
  }
  return false;
}

export async function splitBrowserWithDevTools(
  direction: SplitDirection,
  workArea: ScreenWorkArea | undefined,
  onBeforeMainResize?: (mainWin: chrome.windows.Window) => Promise<void>
): Promise<{ applied: boolean; state: DevToolsState }> {
  const currentState = await getDevToolsState();
  if (!currentState.hasDevTools) {
    return { applied: false, state: currentState };
  }

  let mainWin: chrome.windows.Window | null = null;
  try {
    const focusedNormal = await ext.windows.getLastFocused({ windowTypes: ['normal'] });
    if (focusedNormal && focusedNormal.id !== undefined) {
      mainWin = focusedNormal;
    }
  } catch {
    // fallback below
  }
  if (!mainWin) {
    const allNormal = await ext.windows.getAll({ windowTypes: ['normal'] });
    mainWin =
      allNormal.find((w) => w.focused) ??
      allNormal.find((w) => w.state !== 'minimized') ??
      allNormal[0] ??
      null;
  }
  if (!mainWin || mainWin.id === undefined) {
    return { applied: false, state: currentState };
  }

  if (onBeforeMainResize) {
    await onBeforeMainResize(mainWin);
  }

  const area: ScreenWorkArea =
    workArea && workArea.availWidth > 0 && workArea.availHeight > 0
      ? workArea
      : {
          availLeft: 0,
          availTop: 0,
          availWidth: Math.max(1280, mainWin.width ?? 1280),
          availHeight: Math.max(720, mainWin.height ?? 800),
        };

  const { settings } = await loadAppData();
  const layout = computeSplitLayout(area, direction, settings.devtoolsSplitRatio);

  if (mainWin.state && mainWin.state !== 'normal') {
    await ext.windows.update(mainWin.id, { state: 'normal' });
    await sleep(40);
  }

  await ext.windows.update(mainWin.id, {
    left: layout.main.left,
    top: layout.main.top,
    width: layout.main.width,
    height: layout.main.height,
  });

  const moved = await dockDevToolsToRect(layout.devtools);
  const nextState = await getDevToolsState();
  await broadcastDevToolsState(nextState);
  return { applied: moved, state: nextState };
}
