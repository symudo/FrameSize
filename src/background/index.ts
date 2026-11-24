import { DEFAULT_OVERHEAD } from '../shared/defaults';
import { ext, getSessionStorage } from '../shared/ext';
import {
  computeAutoZoomForViewport,
  computeFrameOverhead,
  computePairedDevToolsLayout,
  computeTargetWindowSize,
  computeWindowPosition,
} from '../shared/geometry';
import { initializeStorageDefaults, loadAppData } from '../shared/storage';
import {
  dockDevToolsToRect,
  findDevToolsWindow,
  getDevToolsState,
  splitBrowserWithDevTools,
  toggleDevToolsMinimize,
  toggleDevToolsOpacity,
  toggleDevToolsPin,
  toggleDevToolsRollup,
} from './devtools';
import type {
  CurrentDimensions,
  FrameOverhead,
  ResizePayload,
  RuntimeMessage,
  ScreenWorkArea,
  ViewportMetrics,
  WindowSnapshot,
} from '../shared/types';

const SESSION_HISTORY_KEY = 'framesize_undo_history';
const SESSION_OVERHEAD_KEY = 'framesize_overhead_cache';
const SESSION_SCREEN_KEY = 'framesize_screen_cache';
const SESSION_AUTO_ZOOM_KEY = 'framesize_auto_zoom_tabs';
const MAX_HISTORY_PER_WINDOW = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getActiveWindowAndTab(): Promise<{
  win: chrome.windows.Window;
  tab: chrome.tabs.Tab | null;
}> {
  const win = await ext.windows.getLastFocused({ populate: true });
  const tab = win.tabs?.find((t) => t.active) ?? null;
  return { win, tab };
}

async function queryTabMetrics(tabId?: number): Promise<ViewportMetrics | null> {
  if (!tabId) return null;
  try {
    const res = await ext.tabs.sendMessage(tabId, {
      type: 'QUERY_PAGE_METRICS',
    } satisfies RuntimeMessage);
    if (res && typeof res.innerWidth === 'number' && typeof res.innerHeight === 'number') {
      return res as ViewportMetrics;
    }
  } catch {
    // chrome://, edge://, about:, 扩展商店或尚未注入内容脚本的页面会报错，静默降级
  }
  return null;
}

async function getTabZoom(tabId?: number): Promise<number> {
  if (!tabId) return 1;
  try {
    const z = await ext.tabs.getZoom(tabId);
    return Number.isFinite(z) && z > 0 ? z : 1;
  } catch {
    return 1;
  }
}

async function setTabZoomSafe(tabId: number | undefined, zoom: number): Promise<boolean> {
  if (!tabId || !ext.tabs?.setZoom) return false;
  try {
    await ext.tabs.setZoom(tabId, zoom);
    return true;
  } catch {
    return false;
  }
}

async function getAutoZoomMap(): Promise<Record<string, number>> {
  try {
    const store = await getSessionStorage().get(SESSION_AUTO_ZOOM_KEY);
    const map = store[SESSION_AUTO_ZOOM_KEY];
    if (map && typeof map === 'object') {
      return map as Record<string, number>;
    }
  } catch {
    // ignore
  }
  return {};
}

async function saveAutoZoomOrigin(tabId: number, originalZoom: number): Promise<void> {
  const map = await getAutoZoomMap();
  const key = String(tabId);
  if (map[key] === undefined) {
    map[key] = originalZoom;
    try {
      await getSessionStorage().set({ [SESSION_AUTO_ZOOM_KEY]: map });
    } catch {
      // ignore
    }
  }
}

async function popAutoZoomOrigin(tabId: number): Promise<number | null> {
  const map = await getAutoZoomMap();
  const key = String(tabId);
  const prev = map[key];
  if (prev === undefined) return null;
  delete map[key];
  try {
    await getSessionStorage().set({ [SESSION_AUTO_ZOOM_KEY]: map });
  } catch {
    // ignore
  }
  return prev;
}

async function getCachedOverhead(): Promise<FrameOverhead> {
  try {
    const store = await getSessionStorage().get(SESSION_OVERHEAD_KEY);
    const val = store[SESSION_OVERHEAD_KEY] as FrameOverhead | undefined;
    if (val && typeof val.dx === 'number' && typeof val.dy === 'number') {
      return val;
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_OVERHEAD };
}

async function setCachedOverhead(overhead: FrameOverhead): Promise<void> {
  try {
    await getSessionStorage().set({ [SESSION_OVERHEAD_KEY]: overhead });
  } catch {
    // ignore
  }
}

async function getCachedScreen(): Promise<ScreenWorkArea | undefined> {
  try {
    const store = await getSessionStorage().get(SESSION_SCREEN_KEY);
    return store[SESSION_SCREEN_KEY] as ScreenWorkArea | undefined;
  } catch {
    return undefined;
  }
}

async function setCachedScreen(screen?: ScreenWorkArea): Promise<void> {
  if (!screen || screen.availWidth <= 0 || screen.availHeight <= 0) return;
  try {
    await getSessionStorage().set({ [SESSION_SCREEN_KEY]: screen });
  } catch {
    // ignore
  }
}

async function getUndoMap(): Promise<Record<string, WindowSnapshot[]>> {
  try {
    const store = await getSessionStorage().get(SESSION_HISTORY_KEY);
    const map = store[SESSION_HISTORY_KEY];
    if (map && typeof map === 'object') {
      return map as Record<string, WindowSnapshot[]>;
    }
  } catch {
    // ignore
  }
  return {};
}

async function pushUndoSnapshot(
  win: chrome.windows.Window,
  tabId?: number,
  zoom?: number
): Promise<void> {
  if (win.id === undefined) return;
  const snapshot: WindowSnapshot = {
    width: win.width ?? 1280,
    height: win.height ?? 800,
    left: win.left ?? 0,
    top: win.top ?? 0,
    state: win.state ?? 'normal',
    tabId,
    zoom,
  };
  const map = await getUndoMap();
  const key = String(win.id);
  const stack = Array.isArray(map[key]) ? map[key] : [];
  const last = stack[stack.length - 1];
  // 避免连续存入完全相同的快照
  if (
    last &&
    last.width === snapshot.width &&
    last.height === snapshot.height &&
    last.left === snapshot.left &&
    last.top === snapshot.top &&
    last.state === snapshot.state &&
    last.zoom === snapshot.zoom
  ) {
    return;
  }
  stack.push(snapshot);
  if (stack.length > MAX_HISTORY_PER_WINDOW) {
    stack.shift();
  }
  map[key] = stack;
  try {
    await getSessionStorage().set({ [SESSION_HISTORY_KEY]: map });
  } catch {
    // ignore
  }
}

async function popUndoSnapshot(windowId: number): Promise<WindowSnapshot | null> {
  const map = await getUndoMap();
  const key = String(windowId);
  const stack = Array.isArray(map[key]) ? map[key] : [];
  const snap = stack.pop() ?? null;
  map[key] = stack;
  try {
    await getSessionStorage().set({ [SESSION_HISTORY_KEY]: map });
  } catch {
    // ignore
  }
  return snap;
}

async function hasUndoHistory(windowId?: number): Promise<boolean> {
  if (windowId === undefined) return false;
  const map = await getUndoMap();
  const stack = map[String(windowId)];
  return Array.isArray(stack) && stack.length > 0;
}

async function notifyTooltip(
  tabId: number | undefined,
  windowWidth?: number,
  windowHeight?: number
): Promise<void> {
  if (!tabId) return;
  try {
    await ext.tabs.sendMessage(tabId, {
      type: 'SHOW_TOOLTIP_HINT',
      windowWidth,
      windowHeight,
    } satisfies RuntimeMessage);
  } catch {
    // ignore on restricted pages
  }
}

async function getCurrentDimensions(
  hintScreen?: ScreenWorkArea,
  autoZoomApplied = false
): Promise<CurrentDimensions> {
  const { win, tab } = await getActiveWindowAndTab();
  const [metrics, zoom, canUndo, cachedScreen] = await Promise.all([
    queryTabMetrics(tab?.id),
    getTabZoom(tab?.id),
    hasUndoHistory(win.id),
    getCachedScreen(),
  ]);

  let resolvedScreen: ScreenWorkArea | undefined = hintScreen ?? cachedScreen;
  if (metrics?.screen) {
    // 网页内 devicePixelRatio 包含页面 zoom，除以 zoom 还原系统 DPI 缩放；Popup 传来的 systemDpr 本身即为 100% 纯系统缩放
    const pageSysDpr =
      metrics.screen.systemDpr && zoom > 0
        ? Number((metrics.screen.systemDpr / zoom).toFixed(2))
        : undefined;
    resolvedScreen = {
      ...metrics.screen,
      systemDpr: hintScreen?.systemDpr ?? pageSysDpr ?? cachedScreen?.systemDpr,
    };
  }
  if (resolvedScreen) {
    await setCachedScreen(resolvedScreen);
  }

  // 仅在普通非最大化窗口状态下更新边框开销缓存，避免最大化态隐形边框污染缓存
  if (metrics && win.type === 'normal' && win.state === 'normal' && win.width && win.height) {
    const overhead = computeFrameOverhead(
      win.width,
      win.height,
      metrics.innerWidth,
      metrics.innerHeight,
      zoom
    );
    await setCachedOverhead(overhead);
  }

  return {
    windowId: win.id ?? -1,
    windowWidth: win.width ?? 0,
    windowHeight: win.height ?? 0,
    windowLeft: win.left ?? 0,
    windowTop: win.top ?? 0,
    windowState: win.state ?? 'normal',
    viewportWidth: metrics ? Math.round(metrics.innerWidth) : null,
    viewportHeight: metrics ? Math.round(metrics.innerHeight) : null,
    zoom,
    autoZoomApplied,
    screen: resolvedScreen,
    canUndo,
    isRestrictedPage: metrics === null,
  };
}

async function applyResize(payload: ResizePayload): Promise<CurrentDimensions> {
  const { win, tab } = await getActiveWindowAndTab();
  if (win.id === undefined) {
    throw new Error('No active browser window');
  }

  const [metrics, zoom, cachedOverhead, cachedScreen] = await Promise.all([
    queryTabMetrics(tab?.id),
    getTabZoom(tab?.id),
    getCachedOverhead(),
    getCachedScreen(),
  ]);

  const pageSysDpr =
    metrics?.screen?.systemDpr && zoom > 0
      ? Number((metrics.screen.systemDpr / zoom).toFixed(2))
      : undefined;
  const rawWorkArea = metrics?.screen ?? payload.screen ?? cachedScreen;
  const workArea: ScreenWorkArea | undefined = rawWorkArea
    ? {
        ...rawWorkArea,
        systemDpr: payload.screen?.systemDpr ?? pageSysDpr ?? cachedScreen?.systemDpr,
      }
    : undefined;
  if (workArea) {
    await setCachedScreen(workArea);
  }

  const currentWidth = win.width ?? 1280;
  const currentHeight = win.height ?? 800;

  // 独立无标签栏弹窗（Pop-out）模式
  if (payload.popOut && tab?.id !== undefined) {
    const popupOverhead: FrameOverhead = { dx: 16, dy: 40 };
    const initialSize = computeTargetWindowSize(
      payload.width,
      payload.height,
      payload.target,
      { width: currentWidth, height: currentHeight },
      popupOverhead,
      zoom
    );
    const pos = computeWindowPosition(
      payload.alignment ?? 'center',
      initialSize.width,
      initialSize.height,
      workArea,
      { left: payload.left, top: payload.top }
    );

    const created = await ext.windows.create({
      tabId: tab.id,
      type: 'popup',
      width: initialSize.width,
      height: initialSize.height,
      ...(pos ?? {}),
      focused: true,
    });

    // 若为 viewport 模式，创建后再精准微调一次
    if (payload.target === 'viewport' && created?.id !== undefined) {
      await sleep(100);
      const afterMetrics = await queryTabMetrics(tab.id);
      if (afterMetrics) {
        const createdWin = await ext.windows.get(created.id);
        const realOverhead = computeFrameOverhead(
          createdWin.width ?? initialSize.width,
          createdWin.height ?? initialSize.height,
          afterMetrics.innerWidth,
          afterMetrics.innerHeight,
          zoom
        );
        const corrected = computeTargetWindowSize(
          payload.width,
          payload.height,
          'viewport',
          {
            width: createdWin.width ?? initialSize.width,
            height: createdWin.height ?? initialSize.height,
          },
          realOverhead,
          zoom
        );
        if (
          Math.abs(corrected.width - (createdWin.width ?? 0)) > 1 ||
          Math.abs(corrected.height - (createdWin.height ?? 0)) > 1
        ) {
          await ext.windows.update(created.id, corrected);
        }
      }
    }

    return getCurrentDimensions(workArea);
  }

  // 记录撤销快照（含当前 zoom，便于撤销时同步恢复缩放）
  await pushUndoSnapshot(win, tab?.id, zoom);

  const { settings } = await loadAppData();
  const isNormalState = !win.state || win.state === 'normal';
  const overhead: FrameOverhead =
    metrics && isNormalState && win.width && win.height
      ? computeFrameOverhead(win.width, win.height, metrics.innerWidth, metrics.innerHeight, zoom)
      : cachedOverhead;

  if (metrics && isNormalState && win.type === 'normal') {
    await setCachedOverhead(overhead);
  }

  // 超屏自动缩放模拟大屏 Viewport（例如 150% 缩放屏幕下测试 1920×1080）
  let effectiveZoom = zoom;
  let autoZoomApplied = false;
  if (tab?.id !== undefined) {
    const fitZoom =
      payload.target === 'viewport' && metrics && settings.autoZoomOversized
        ? computeAutoZoomForViewport(payload.width, payload.height, workArea, overhead)
        : null;

    if (fitZoom !== null) {
      await saveAutoZoomOrigin(tab.id, zoom);
      if (Math.abs(fitZoom - zoom) > 0.005) {
        const ok = await setTabZoomSafe(tab.id, fitZoom);
        if (ok) {
          await sleep(40);
          effectiveZoom = await getTabZoom(tab.id);
          autoZoomApplied = true;
        }
      } else {
        autoZoomApplied = true;
      }
    } else {
      // 目标尺寸未超屏或切换到 Window 模式：若此前由插件自动缩放过，平滑恢复原缩放倍率
      const originZoom = await popAutoZoomOrigin(tab.id);
      if (originZoom !== null && Math.abs(originZoom - zoom) > 0.005) {
        const ok = await setTabZoomSafe(tab.id, originZoom);
        if (ok) {
          await sleep(40);
          effectiveZoom = await getTabZoom(tab.id);
        }
      }
    }
  }

  const targetSize = computeTargetWindowSize(
    payload.width,
    payload.height,
    payload.target,
    { width: currentWidth, height: currentHeight },
    overhead,
    effectiveZoom
  );

  // 手机/平板预设 + 独立 DevTools 自动贴边联动（预览窗靠左、DevTools 紧贴右侧补满剩余屏幕）
  let pairedLayout: ReturnType<typeof computePairedDevToolsLayout> = null;
  const isCompactPreset = payload.presetIcon === 'mobile' || payload.presetIcon === 'tablet';
  if (settings.devtoolsAutoDockCompact && isCompactPreset && workArea) {
    const dtWin = await findDevToolsWindow();
    if (dtWin) {
      pairedLayout = computePairedDevToolsLayout(targetSize, workArea);
    }
  }

  const pos = pairedLayout
    ? { left: pairedLayout.main.left, top: pairedLayout.main.top }
    : computeWindowPosition(payload.alignment, targetSize.width, targetSize.height, workArea, {
        left: payload.left,
        top: payload.top,
      });

  // 最大化或全屏态必须先恢复 normal，否则 Chrome/Firefox 会报错或忽略宽高
  if (win.state && win.state !== 'normal') {
    await ext.windows.update(win.id, { state: 'normal' });
    await sleep(40);
  }

  const updateInfo: chrome.windows.UpdateInfo = {
    width: targetSize.width,
    height: targetSize.height,
    ...(pos ?? {}),
  };
  let updatedWin = await ext.windows.update(win.id, updateInfo);

  // Viewport 模式执行一次精准微调（防止工具栏折行、最大化切换或滚动条变化带来的像素偏差）
  if (payload.target === 'viewport' && metrics && tab?.id !== undefined) {
    await sleep(70);
    const afterMetrics = await queryTabMetrics(tab.id);
    if (afterMetrics) {
      const actualW = Math.round(afterMetrics.innerWidth);
      const actualH = Math.round(afterMetrics.innerHeight);
      const errCssW = payload.width !== null ? payload.width - actualW : 0;
      const errCssH = payload.height !== null ? payload.height - actualH : 0;

      if (Math.abs(errCssW) > 1 || Math.abs(errCssH) > 1) {
        const refinedW = Math.max(
          200,
          Math.round((updatedWin.width ?? targetSize.width) + errCssW * effectiveZoom)
        );
        const refinedH = Math.max(
          200,
          Math.round((updatedWin.height ?? targetSize.height) + errCssH * effectiveZoom)
        );
        if (pairedLayout && workArea) {
          pairedLayout = computePairedDevToolsLayout({ width: refinedW, height: refinedH }, workArea);
        }
        const refinedPos = pairedLayout
          ? { left: pairedLayout.main.left, top: pairedLayout.main.top }
          : computeWindowPosition(payload.alignment, refinedW, refinedH, workArea, {
              left: payload.left,
              top: payload.top,
            });
        updatedWin = await ext.windows.update(win.id, {
          width: refinedW,
          height: refinedH,
          ...(refinedPos ?? {}),
        });
      }

      if (win.type === 'normal' && updatedWin.width && updatedWin.height) {
        const finalMetrics = (await queryTabMetrics(tab.id)) ?? afterMetrics;
        const finalOverhead = computeFrameOverhead(
          updatedWin.width,
          updatedWin.height,
          finalMetrics.innerWidth,
          finalMetrics.innerHeight,
          effectiveZoom
        );
        await setCachedOverhead(finalOverhead);
      }
    }
  }

  if (pairedLayout) {
    await dockDevToolsToRect(pairedLayout.devtools);
  }

  await notifyTooltip(tab?.id, updatedWin.width, updatedWin.height);
  return getCurrentDimensions(workArea, autoZoomApplied);
}

async function rotateCurrentWindow(hintScreen?: ScreenWorkArea): Promise<CurrentDimensions> {
  const current = await getCurrentDimensions(hintScreen);
  // 优先旋转 Viewport（若可读），否则旋转 Window
  if (current.viewportWidth && current.viewportHeight) {
    return applyResize({
      width: current.viewportHeight,
      height: current.viewportWidth,
      target: 'viewport',
      alignment: 'keep',
      screen: hintScreen,
    });
  }
  return applyResize({
    width: current.windowHeight,
    height: current.windowWidth,
    target: 'window',
    alignment: 'keep',
    screen: hintScreen,
  });
}

async function undoResize(): Promise<CurrentDimensions> {
  const { win, tab } = await getActiveWindowAndTab();
  if (win.id === undefined) {
    throw new Error('No active browser window');
  }
  const snapshot = await popUndoSnapshot(win.id);
  if (!snapshot) {
    return getCurrentDimensions();
  }

  if (snapshot.tabId !== undefined && typeof snapshot.zoom === 'number') {
    await setTabZoomSafe(snapshot.tabId, snapshot.zoom);
    await popAutoZoomOrigin(snapshot.tabId);
  }

  if (snapshot.state === 'maximized' || snapshot.state === 'fullscreen') {
    await ext.windows.update(win.id, { state: snapshot.state });
  } else {
    if (win.state && win.state !== 'normal') {
      await ext.windows.update(win.id, { state: 'normal' });
      await sleep(30);
    }
    const updated = await ext.windows.update(win.id, {
      width: snapshot.width,
      height: snapshot.height,
      left: snapshot.left,
      top: snapshot.top,
    });
    await notifyTooltip(tab?.id, updated.width, updated.height);
  }
  return getCurrentDimensions();
}

async function maximizeWindow(): Promise<CurrentDimensions> {
  const { win } = await getActiveWindowAndTab();
  if (win.id === undefined) throw new Error('No active browser window');
  await pushUndoSnapshot(win);
  const nextState: chrome.windows.windowStateEnum =
    win.state === 'maximized' ? 'normal' : 'maximized';
  await ext.windows.update(win.id, { state: nextState });
  return getCurrentDimensions();
}

async function applyPresetById(
  presetId: string,
  screen?: ScreenWorkArea,
  popOut?: boolean
): Promise<CurrentDimensions> {
  const { presets } = await loadAppData();
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Preset not found: ${presetId}`);
  }
  return applyResize({
    width: preset.width,
    height: preset.height,
    target: preset.target,
    alignment: preset.alignment,
    left: preset.left,
    top: preset.top,
    screen,
    popOut,
    presetIcon: preset.icon,
  });
}

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_CURRENT_DIMENSIONS':
      return getCurrentDimensions(message.screen);
    case 'APPLY_RESIZE':
      return applyResize(message.payload);
    case 'APPLY_PRESET':
      return applyPresetById(message.presetId, message.screen, message.popOut);
    case 'ROTATE_WINDOW':
      return rotateCurrentWindow(message.screen);
    case 'UNDO_RESIZE':
      return undoResize();
    case 'MAXIMIZE_WINDOW':
      return maximizeWindow();
    case 'GET_DEVTOOLS_STATE':
      return getDevToolsState();
    case 'TOGGLE_DEVTOOLS_PIN':
      return toggleDevToolsPin();
    case 'TOGGLE_DEVTOOLS_ROLLUP':
      return toggleDevToolsRollup();
    case 'TOGGLE_DEVTOOLS_OPACITY':
      return toggleDevToolsOpacity();
    case 'TOGGLE_DEVTOOLS_MINIMIZE': {
      return toggleDevToolsMinimize();
    }
    case 'SPLIT_DEVTOOLS': {
      const workArea = message.screen ?? (await getCachedScreen());
      return splitBrowserWithDevTools(message.direction, workArea, pushUndoSnapshot);
    }
    default:
      return null;
  }
}

ext.runtime.onInstalled.addListener(() => {
  void initializeStorageDefaults();
});

// 清理已关闭标签页与窗口的会话缓存，防止长期运行残留
if (ext.tabs?.onRemoved) {
  ext.tabs.onRemoved.addListener((tabId) => {
    void popAutoZoomOrigin(tabId);
  });
}

if (ext.windows?.onRemoved) {
  ext.windows.onRemoved.addListener(async (windowId) => {
    const map = await getUndoMap();
    const key = String(windowId);
    if (key in map) {
      delete map[key];
      try {
        await getSessionStorage().set({ [SESSION_HISTORY_KEY]: map });
      } catch {
        // ignore
      }
    }
  });
}

ext.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }
  if (message.type === 'QUERY_PAGE_METRICS' || message.type === 'SHOW_TOOLTIP_HINT') {
    return false;
  }
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: msg });
    });
  return true;
});

if (ext.commands?.onCommand) {
  ext.commands.onCommand.addListener(async (command) => {
    try {
      if (command === 'rotate-window') {
        await rotateCurrentWindow();
        return;
      }
      if (command === 'undo-resize') {
        await undoResize();
        return;
      }
      if (command === 'toggle-devtools-pin') {
        await toggleDevToolsPin();
        return;
      }
      if (command === 'toggle-devtools-rollup') {
        await toggleDevToolsRollup();
        return;
      }
      if (command === 'toggle-devtools-opacity') {
        await toggleDevToolsOpacity();
        return;
      }
      if (command === 'split-devtools') {
        const workArea = await getCachedScreen();
        await splitBrowserWithDevTools('right', workArea, pushUndoSnapshot);
        return;
      }
      const match = /^apply-preset-(\d+)$/.exec(command);
      if (match) {
        const index = Number(match[1]) - 1;
        const { presets } = await loadAppData();
        const preset = presets[index];
        if (preset) {
          await applyPresetById(preset.id);
        }
      }
    } catch {
      // 快捷键在无普通窗口等极端场景下静默处理
    }
  });
}
