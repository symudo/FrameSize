import type {
  FrameOverhead,
  ResizeTarget,
  ScreenWorkArea,
  WindowAlignment,
} from './types';

export const MIN_WINDOW_SIZE = 200;
export const MAX_REASONABLE_OVERHEAD_X = 240;
export const MAX_REASONABLE_OVERHEAD_Y = 360;

/**
 * 计算浏览器窗口外框（工具栏、标签栏、边框）相对网页可视区的逻辑像素开销。
 */
export function computeFrameOverhead(
  windowWidth: number,
  windowHeight: number,
  innerWidth: number,
  innerHeight: number,
  zoom = 1
): FrameOverhead {
  const safeZoom = zoom > 0.1 && zoom < 10 ? zoom : 1;
  const effectiveViewportW = Math.round(innerWidth * safeZoom);
  const effectiveViewportH = Math.round(innerHeight * safeZoom);

  const rawDx = windowWidth - effectiveViewportW;
  const rawDy = windowHeight - effectiveViewportH;

  return {
    dx: Math.max(0, Math.min(MAX_REASONABLE_OVERHEAD_X, Math.round(rawDx))),
    dy: Math.max(0, Math.min(MAX_REASONABLE_OVERHEAD_Y, Math.round(rawDy))),
  };
}

/**
 * 根据目标模式（viewport/window）、页面缩放倍率与当前窗口尺寸计算最终传给 windows.update 的宽高。
 * 当 target === 'viewport' 且页面缩放 zoom !== 1 时，按 CSS 像素换算为窗口逻辑像素，
 * 保证调整后 window.innerWidth / innerHeight 与用户设定的视口尺寸一致。
 */
export function computeTargetWindowSize(
  desiredWidth: number | null,
  desiredHeight: number | null,
  target: ResizeTarget,
  currentWindow: { width: number; height: number },
  overhead: FrameOverhead,
  zoom = 1
): { width: number; height: number } {
  const safeZoom = target === 'viewport' && zoom > 0.1 && zoom < 10 ? zoom : 1;
  const dx = target === 'viewport' ? overhead.dx : 0;
  const dy = target === 'viewport' ? overhead.dy : 0;

  const width =
    desiredWidth !== null && Number.isFinite(desiredWidth) && desiredWidth > 0
      ? Math.max(MIN_WINDOW_SIZE, Math.round(desiredWidth * safeZoom + dx))
      : Math.max(MIN_WINDOW_SIZE, Math.round(currentWindow.width));

  const height =
    desiredHeight !== null && Number.isFinite(desiredHeight) && desiredHeight > 0
      ? Math.max(MIN_WINDOW_SIZE, Math.round(desiredHeight * safeZoom + dy))
      : Math.max(MIN_WINDOW_SIZE, Math.round(currentWindow.height));

  return { width, height };
}

/**
 * 根据对齐方式与当前屏幕可用工作区计算窗口 (left, top)。
 * 返回 null 表示保持当前位置不移动。
 */
export function computeWindowPosition(
  alignment: WindowAlignment | undefined,
  targetWidth: number,
  targetHeight: number,
  workArea?: ScreenWorkArea,
  customPos?: { left?: number; top?: number }
): { left: number; top: number } | null {
  if (!alignment || alignment === 'keep') {
    return null;
  }

  if (alignment === 'custom') {
    const left = typeof customPos?.left === 'number' && Number.isFinite(customPos.left)
      ? Math.round(customPos.left)
      : workArea?.availLeft ?? 0;
    const top = typeof customPos?.top === 'number' && Number.isFinite(customPos.top)
      ? Math.round(customPos.top)
      : workArea?.availTop ?? 0;
    return { left, top };
  }

  if (!workArea || workArea.availWidth <= 0 || workArea.availHeight <= 0) {
    return null;
  }

  const { availLeft, availTop, availWidth, availHeight } = workArea;
  let left = availLeft;
  let top = availTop;

  switch (alignment) {
    case 'center':
      left = availLeft + Math.round((availWidth - targetWidth) / 2);
      top = availTop + Math.round((availHeight - targetHeight) / 2);
      break;
    case 'top-left':
      left = availLeft;
      top = availTop;
      break;
    case 'top-right':
      left = availLeft + availWidth - targetWidth;
      top = availTop;
      break;
    case 'bottom-left':
      left = availLeft;
      top = availTop + availHeight - targetHeight;
      break;
    case 'bottom-right':
      left = availLeft + availWidth - targetWidth;
      top = availTop + availHeight - targetHeight;
      break;
  }

  // 防止标题栏跑到屏幕可用区域上方不可拖动
  const clampedTop = Math.max(availTop, top);
  const clampedLeft = Math.max(availLeft, left);
  return { left: Math.round(clampedLeft), top: Math.round(clampedTop) };
}

/**
 * 将键盘事件规范化为统一的快捷键字符串，例如 "Alt+Shift+1"、"Ctrl+Shift+K"。
 * 忽略单独按下修饰键的情况。
 */
export function normalizeShortcutFromEvent(ev: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
  code?: string;
}): string | null {
  const key = ev.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta', 'Dead', 'Unidentified'].includes(key)) {
    return null;
  }

  const parts: string[] = [];
  if (ev.ctrlKey) parts.push('Ctrl');
  if (ev.metaKey) parts.push('Meta');
  if (ev.altKey) parts.push('Alt');
  if (ev.shiftKey) parts.push('Shift');

  // 至少包含一个非 Shift 的修饰键（或功能键 F1-F12），避免干扰普通打字
  const isFnKey = /^F([1-9]|1[0-2])$/i.test(key);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'Shift' && !isFnKey)) {
    return null;
  }

  let mainKey = key;
  // 处理 Alt/Option 在 macOS 上产生特殊字符的问题，优先回退到物理 code
  if (ev.code && /^Digit[0-9]$/.test(ev.code)) {
    mainKey = ev.code.slice(5);
  } else if (ev.code && /^Key[A-Z]$/.test(ev.code)) {
    mainKey = ev.code.slice(3);
  } else if (mainKey === ' ') {
    mainKey = 'Space';
  } else if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  }

  parts.push(mainKey);
  return parts.join('+');
}

export function normalizeShortcutString(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
  if (cleaned.length < 2) return undefined;
  return cleaned.join('+');
}

export interface SplitLayoutResult {
  main: { left: number; top: number; width: number; height: number };
  devtools: { left: number; top: number; width: number; height: number };
}

/**
 * 计算主浏览器窗口与独立 DevTools 窗口的防遮挡紧贴分屏布局。
 * direction='right': 主窗口在左、DevTools 在右；
 * direction='bottom': 主窗口在上、DevTools 在下。
 */
export function computeSplitLayout(
  workArea: ScreenWorkArea,
  direction: 'right' | 'bottom',
  ratio = 0.62
): SplitLayoutResult {
  const safeRatio = Math.max(0.35, Math.min(0.8, Number.isFinite(ratio) ? ratio : 0.62));
  const { availLeft, availTop, availWidth, availHeight } = workArea;

  if (direction === 'bottom') {
    const mainH = Math.max(MIN_WINDOW_SIZE, Math.round(availHeight * safeRatio));
    const dtH = Math.max(MIN_WINDOW_SIZE, availHeight - mainH);
    const adjustedMainH = Math.max(MIN_WINDOW_SIZE, availHeight - dtH);
    return {
      main: {
        left: Math.round(availLeft),
        top: Math.round(availTop),
        width: Math.max(MIN_WINDOW_SIZE, Math.round(availWidth)),
        height: adjustedMainH,
      },
      devtools: {
        left: Math.round(availLeft),
        top: Math.round(availTop + adjustedMainH),
        width: Math.max(MIN_WINDOW_SIZE, Math.round(availWidth)),
        height: dtH,
      },
    };
  }

  const mainW = Math.max(MIN_WINDOW_SIZE, Math.round(availWidth * safeRatio));
  const dtW = Math.max(MIN_WINDOW_SIZE, availWidth - mainW);
  const adjustedMainW = Math.max(MIN_WINDOW_SIZE, availWidth - dtW);
  return {
    main: {
      left: Math.round(availLeft),
      top: Math.round(availTop),
      width: adjustedMainW,
      height: Math.max(MIN_WINDOW_SIZE, Math.round(availHeight)),
    },
    devtools: {
      left: Math.round(availLeft + adjustedMainW),
      top: Math.round(availTop),
      width: dtW,
      height: Math.max(MIN_WINDOW_SIZE, Math.round(availHeight)),
    },
  };
}
