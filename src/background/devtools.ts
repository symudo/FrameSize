import { ext, getBrowserKind, NATIVE_HOST_NAME } from '../shared/ext';
import { computeSplitLayout } from '../shared/geometry';
import { loadAppData } from '../shared/storage';
import type { DevToolsState, ScreenWorkArea, SplitDirection } from '../shared/types';

interface NativeHelperRequest {
  action: 'ping' | 'get_status' | 'toggle_pin' | 'set_pin' | 'toggle_rollup' | 'toggle_opacity';
  browser?: 'chrome' | 'edge' | 'firefox';
  target?: { left: number; top: number; width: number; height: number };
  rollupHeight?: number;
  opacity?: number;
}

interface NativeHelperResponse {
  ok: boolean;
  version?: string;
  found?: boolean;
  pinned?: boolean;
  rolledUp?: boolean;
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
    // 优先选择聚焦或非最小化的独立 DevTools 窗口
    const focused = all.find((w) => w.focused);
    if (focused) return focused;
    const normal = all.find((w) => w.state !== 'minimized');
    return normal ?? all[0];
  } catch {
    return null;
  }
}

function toTargetRect(win: chrome.windows.Window | null) {
  if (!win) return undefined;
  return {
    left: win.left ?? 0,
    top: win.top ?? 0,
    width: win.width ?? 0,
    height: win.height ?? 0,
  };
}

export async function getDevToolsState(): Promise<DevToolsState> {
  const dtWin = await findDevToolsWindow();

  if (!dtWin) {
    const ping = await sendNative({ action: 'ping' });
    return {
      hasDevTools: false,
      windowId: null,
      minimized: false,
      helperConnected: Boolean(ping?.ok),
      helperVersion: ping?.version ?? null,
      pinned: false,
      rolledUp: false,
      translucent: false,
      opacity: 100,
      title: null,
    };
  }

  const nativeStatus = await sendNative({
    action: 'get_status',
    target: toTargetRect(dtWin),
  });

  return {
    hasDevTools: true,
    windowId: dtWin.id ?? null,
    minimized: dtWin.state === 'minimized',
    helperConnected: Boolean(nativeStatus?.ok),
    helperVersion: nativeStatus?.version ?? null,
    pinned: Boolean(nativeStatus?.ok && nativeStatus.found && nativeStatus.pinned),
    rolledUp: Boolean(nativeStatus?.ok && nativeStatus.found && nativeStatus.rolledUp),
    translucent: Boolean(nativeStatus?.ok && nativeStatus.found && nativeStatus.translucent),
    opacity: nativeStatus?.ok && nativeStatus.found && nativeStatus.opacity ? nativeStatus.opacity : 100,
    title: nativeStatus?.title ?? null,
  };
}

export async function toggleDevToolsPin(): Promise<{
  state: DevToolsState;
  changed: boolean;
  needsHelper: boolean;
}> {
  const dtWin = await findDevToolsWindow();
  if (!dtWin || dtWin.id === undefined) {
    return { state: await getDevToolsState(), changed: false, needsHelper: false };
  }

  // 若处于最小化态，先恢复为正常可见窗口以便 Win32 置顶
  let targetWin = dtWin;
  if (dtWin.state === 'minimized') {
    targetWin = await ext.windows.update(dtWin.id, { state: 'normal', focused: false });
    await sleep(60);
  }

  const res = await sendNative({
    action: 'toggle_pin',
    target: toTargetRect(targetWin),
  });

  if (!res || !res.ok) {
    return { state: await getDevToolsState(), changed: false, needsHelper: true };
  }

  return {
    state: {
      hasDevTools: true,
      windowId: targetWin.id ?? null,
      minimized: targetWin.state === 'minimized',
      helperConnected: true,
      helperVersion: res.version ?? null,
      pinned: Boolean(res.pinned),
      rolledUp: Boolean(res.rolledUp),
      translucent: Boolean(res.translucent),
      opacity: res.opacity ?? 100,
      title: res.title ?? null,
    },
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
  if (!dtWin || dtWin.id === undefined) {
    return { state: await getDevToolsState(), changed: false, needsHelper: false };
  }

  let targetWin = dtWin;
  if (dtWin.state === 'minimized') {
    targetWin = await ext.windows.update(dtWin.id, { state: 'normal', focused: false });
    await sleep(60);
  }

  const { settings } = await loadAppData();
  const res = await sendNative({
    action: 'toggle_opacity',
    target: toTargetRect(targetWin),
    opacity: settings.devtoolsOpacity,
  });

  if (!res || !res.ok) {
    return { state: await getDevToolsState(), changed: false, needsHelper: true };
  }

  return {
    state: {
      hasDevTools: true,
      windowId: targetWin.id ?? null,
      minimized: false,
      helperConnected: true,
      helperVersion: res.version ?? null,
      pinned: Boolean(res.pinned),
      rolledUp: Boolean(res.rolledUp),
      translucent: Boolean(res.translucent),
      opacity: res.opacity ?? 100,
      title: res.title ?? null,
    },
    changed: Boolean(res.found),
    needsHelper: false,
  };
}

export async function toggleDevToolsMinimize(): Promise<{
  state: DevToolsState;
  minimizedNow: boolean;
}> {
  const dtWin = await findDevToolsWindow();
  if (!dtWin || dtWin.id === undefined) {
    return { state: await getDevToolsState(), minimizedNow: false };
  }

  const willMinimize = dtWin.state !== 'minimized';
  await ext.windows.update(dtWin.id, {
    state: willMinimize ? 'minimized' : 'normal',
    ...(willMinimize ? {} : { focused: true }),
  });

  return {
    state: await getDevToolsState(),
    minimizedNow: willMinimize,
  };
}

export async function toggleDevToolsRollup(): Promise<{
  state: DevToolsState;
  mode: 'rollup' | 'minimize' | 'none';
  collapsed: boolean;
}> {
  const dtWin = await findDevToolsWindow();
  if (!dtWin || dtWin.id === undefined) {
    return { state: await getDevToolsState(), mode: 'none', collapsed: false };
  }

  const { settings } = await loadAppData();

  // 如果当前是最小化/最大化/全屏态且有 Helper，先恢复 normal 再切换卷帘，避免 DWM 最大化溢出裁切偏移
  let targetWin = dtWin;
  const ping = await sendNative({ action: 'ping' });
  if (ping?.ok) {
    if (dtWin.state && dtWin.state !== 'normal') {
      targetWin = await ext.windows.update(dtWin.id, { state: 'normal', focused: false });
      await sleep(70);
    }
    const res = await sendNative({
      action: 'toggle_rollup',
      target: toTargetRect(targetWin),
      rollupHeight: settings.devtoolsRollupHeight,
    });
    if (res?.ok && res.found) {
      return {
        state: {
          hasDevTools: true,
          windowId: targetWin.id ?? null,
          minimized: false,
          helperConnected: true,
          helperVersion: res.version ?? null,
          pinned: Boolean(res.pinned),
          rolledUp: Boolean(res.rolledUp),
          translucent: Boolean(res.translucent),
          opacity: res.opacity ?? 100,
          title: res.title ?? null,
        },
        mode: 'rollup',
        collapsed: Boolean(res.rolledUp),
      };
    }
  }

  // 未安装本地伴侣时，平滑降级为“最小化收起 ↔ 唤出”
  const minRes = await toggleDevToolsMinimize();
  return {
    state: minRes.state,
    mode: 'minimize',
    collapsed: minRes.minimizedNow,
  };
}

export async function splitBrowserWithDevTools(
  direction: SplitDirection,
  workArea: ScreenWorkArea | undefined,
  onBeforeMainResize?: (mainWin: chrome.windows.Window) => Promise<void>
): Promise<{ applied: boolean; state: DevToolsState }> {
  const dtWin = await findDevToolsWindow();
  if (!dtWin || dtWin.id === undefined) {
    return { applied: false, state: await getDevToolsState() };
  }

  // 精准查找最近活跃的普通浏览器窗口作为主窗口
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
    return { applied: false, state: await getDevToolsState() };
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
  }
  let normalizedDt = dtWin;
  if (dtWin.state && dtWin.state !== 'normal') {
    normalizedDt = await ext.windows.update(dtWin.id, { state: 'normal' });
  }
  await sleep(50);

  // 若 DevTools 正处于卷帘折叠态，在恢复 normal 后通过 Helper 展开，避免分屏后只剩标题栏
  const currentStatus = await sendNative({
    action: 'get_status',
    target: toTargetRect(normalizedDt),
  });
  if (currentStatus?.ok && currentStatus.found && currentStatus.rolledUp) {
    await sendNative({
      action: 'toggle_rollup',
      target: toTargetRect(normalizedDt),
      rollupHeight: settings.devtoolsRollupHeight,
    });
  }

  await Promise.all([
    ext.windows.update(mainWin.id, {
      left: layout.main.left,
      top: layout.main.top,
      width: layout.main.width,
      height: layout.main.height,
    }),
    ext.windows.update(dtWin.id, {
      left: layout.devtools.left,
      top: layout.devtools.top,
      width: layout.devtools.width,
      height: layout.devtools.height,
    }),
  ]);

  return { applied: true, state: await getDevToolsState() };
}

/**
 * 将独立 DevTools 窗口恢复正常态（如曾最小化或卷帘折叠）并紧贴排布到指定矩形。
 */
export async function dockDevToolsToRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Promise<boolean> {
  const dtWin = await findDevToolsWindow();
  if (!dtWin || dtWin.id === undefined) return false;

  let normalizedDt = dtWin;
  if (dtWin.state && dtWin.state !== 'normal') {
    normalizedDt = await ext.windows.update(dtWin.id, { state: 'normal', focused: false });
    await sleep(50);
  }

  const { settings } = await loadAppData();
  const status = await sendNative({
    action: 'get_status',
    target: toTargetRect(normalizedDt),
  });
  if (status?.ok && status.found && status.rolledUp) {
    await sendNative({
      action: 'toggle_rollup',
      target: toTargetRect(normalizedDt),
      rollupHeight: settings.devtoolsRollupHeight,
    });
  }

  await ext.windows.update(dtWin.id, {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  return true;
}
