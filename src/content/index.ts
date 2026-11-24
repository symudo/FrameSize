import { DEFAULT_SETTINGS } from '../shared/defaults';
import { ext } from '../shared/ext';
import { getBreakpointBadge, normalizeShortcutFromEvent } from '../shared/geometry';
import { loadAppData, STORAGE_KEYS } from '../shared/storage';
import type { Preset, RuntimeMessage, ScreenWorkArea, Settings, ViewportMetrics } from '../shared/types';
import { FloatingDevToolsBar } from './devtoolsBar';

// 仅在顶层窗口运行且防止扩展升级自动补注时重复初始化
const winGuard = window as unknown as { __framesizeContentLoaded?: boolean };
if (window === window.top && !winGuard.__framesizeContentLoaded) {
  winGuard.__framesizeContentLoaded = true;
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let presets: Preset[] = [];
  let hostEl: HTMLDivElement | null = null;
  let tooltipEl: HTMLDivElement | null = null;
  let vpItemEl: HTMLSpanElement | null = null;
  let vpValEl: HTMLSpanElement | null = null;
  let bpEl: HTMLSpanElement | null = null;
  let sepEl: HTMLSpanElement | null = null;
  let winItemEl: HTMLSpanElement | null = null;
  let winValEl: HTMLSpanElement | null = null;
  let hideTimer: number | null = null;
  let lastInnerW = window.innerWidth;
  let lastInnerH = window.innerHeight;
  let isReady = false;

  const getScreenWorkArea = (): ScreenWorkArea => {
    const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
    return {
      availLeft: typeof scr.availLeft === 'number' ? scr.availLeft : 0,
      availTop: typeof scr.availTop === 'number' ? scr.availTop : 0,
      availWidth: scr.availWidth || window.outerWidth,
      availHeight: scr.availHeight || window.outerHeight,
      screenWidth: scr.width || undefined,
      screenHeight: scr.height || undefined,
      systemDpr: window.devicePixelRatio || 1,
    };
  };

  const getMetrics = (): ViewportMetrics => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screen: getScreenWorkArea(),
  });

  const ensureTooltipDom = (): HTMLDivElement => {
    if (tooltipEl && hostEl && document.documentElement.contains(hostEl)) {
      return tooltipEl;
    }

    document.getElementById('framesize-tooltip-host')?.remove();

    hostEl = document.createElement('div');
    hostEl.id = 'framesize-tooltip-host';
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.zIndex = '2147483647';
    hostEl.style.pointerEvents = 'none';

    const shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .fs-tip {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 13px;
        border-radius: 10px;
        background: rgba(15, 17, 23, 0.86);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 1px 3px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
        font-size: 12px;
        line-height: 1.25;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
        opacity: 0;
        transform: translateY(6px) scale(0.97);
        transition: opacity 150ms ease, transform 150ms ease;
        user-select: none;
        pointer-events: none;
      }
      .fs-tip.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .fs-tip.pos-bottom-right { right: 16px; bottom: 16px; }
      .fs-tip.pos-bottom-left { left: 16px; bottom: 16px; }
      .fs-tip.pos-top-right { right: 16px; top: 16px; }
      .fs-tip.pos-top-left { left: 16px; top: 16px; }
      .fs-item {
        display: flex;
        align-items: baseline;
        gap: 5px;
      }
      .fs-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
      }
      .fs-val {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
      }
      .fs-val.primary {
        color: #818cf8;
      }
      .fs-bp {
        padding: 1px 5px;
        border-radius: 4px;
        background: rgba(129, 140, 248, 0.22);
        color: #c7d2fe;
        font-size: 10px;
        font-weight: 700;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.02em;
      }
      .fs-sep {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.16);
      }
    `;

    tooltipEl = document.createElement('div');
    tooltipEl.className = `fs-tip pos-${settings.tooltipPosition}`;

    vpItemEl = document.createElement('span');
    vpItemEl.className = 'fs-item';
    const vpLabel = document.createElement('span');
    vpLabel.className = 'fs-label';
    vpLabel.textContent = 'VP';
    vpValEl = document.createElement('span');
    vpValEl.className = 'fs-val primary';
    bpEl = document.createElement('span');
    bpEl.className = 'fs-bp';
    vpItemEl.append(vpLabel, vpValEl, bpEl);

    sepEl = document.createElement('span');
    sepEl.className = 'fs-sep';

    winItemEl = document.createElement('span');
    winItemEl.className = 'fs-item';
    const winLabel = document.createElement('span');
    winLabel.className = 'fs-label';
    winLabel.textContent = 'WIN';
    winValEl = document.createElement('span');
    winValEl.className = 'fs-val';
    winItemEl.append(winLabel, winValEl);

    tooltipEl.append(vpItemEl, sepEl, winItemEl);

    shadow.appendChild(style);
    shadow.appendChild(tooltipEl);
    document.documentElement.appendChild(hostEl);
    return tooltipEl;
  };

  const showTooltip = (overrideWinW?: number, overrideWinH?: number) => {
    if (!settings.tooltipEnabled) return;
    const el = ensureTooltipDom();
    el.className = `fs-tip pos-${settings.tooltipPosition}`;

    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const winW = overrideWinW ?? window.outerWidth;
    const winH = overrideWinH ?? window.outerHeight;

    if (vpValEl) vpValEl.textContent = `${vpW} × ${vpH}`;
    if (bpEl) {
      const bp = getBreakpointBadge(vpW, settings.breakpointPreset);
      bpEl.textContent = bp ?? '';
      bpEl.style.display = bp ? 'inline-block' : 'none';
    }
    if (winValEl) {
      winValEl.textContent = `${winW} × ${winH}`;
      winValEl.className = settings.tooltipDisplay === 'window' ? 'fs-val primary' : 'fs-val';
    }

    const showVp = settings.tooltipDisplay !== 'window';
    const showWin = settings.tooltipDisplay !== 'viewport';
    if (vpItemEl) vpItemEl.style.display = showVp ? 'flex' : 'none';
    if (sepEl) sepEl.style.display = showVp && showWin ? 'block' : 'none';
    if (winItemEl) winItemEl.style.display = showWin ? 'flex' : 'none';

    // 触发过渡动画
    requestAnimationFrame(() => {
      el.classList.add('visible');
    });

    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
    }
    hideTimer = window.setTimeout(() => {
      el.classList.remove('visible');
      hideTimer = null;
    }, settings.tooltipDuration);
  };

  const floatingBar = new FloatingDevToolsBar(settings, getScreenWorkArea);

  const refreshState = async () => {
    try {
      const data = await loadAppData();
      settings = data.settings;
      presets = data.presets;
      floatingBar.updateSettings(settings);
    } catch {
      // ignore if extension context invalidated
    }
  };

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  };

  // 初始化数据后再启用 resize tooltip，防止页面初次加载误弹
  void refreshState().then(() => {
    lastInnerW = window.innerWidth;
    lastInnerH = window.innerHeight;
    isReady = true;
    void floatingBar.syncFromBackground();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void floatingBar.syncFromBackground();
    }
  });

  window.addEventListener(
    'resize',
    () => {
      if (!isReady) return;
      if (window.innerWidth === lastInnerW && window.innerHeight === lastInnerH) return;
      lastInnerW = window.innerWidth;
      lastInnerH = window.innerHeight;
      showTooltip();
    },
    { passive: true }
  );

  window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!settings.enablePageShortcuts || presets.length === 0) return;
    if (isEditableTarget(ev.target)) return;

    const combo = normalizeShortcutFromEvent(ev);
    if (!combo) return;

    const matched = presets.find((p) => p.shortcut && p.shortcut.toLowerCase() === combo.toLowerCase());
    if (!matched) return;

    ev.preventDefault();
    ev.stopPropagation();
    void ext.runtime.sendMessage({
      type: 'APPLY_PRESET',
      presetId: matched.id,
      screen: getScreenWorkArea(),
    } satisfies RuntimeMessage);
  });

  ext.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'QUERY_PAGE_METRICS') {
      sendResponse(getMetrics());
      return false;
    }
    if (message.type === 'SHOW_TOOLTIP_HINT') {
      lastInnerW = window.innerWidth;
      lastInnerH = window.innerHeight;
      showTooltip(message.windowWidth, message.windowHeight);
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'DEVTOOLS_STATE_UPDATED') {
      floatingBar.updateState(message.state);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  if (ext.storage?.onChanged) {
    ext.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEYS.SETTINGS] || changes[STORAGE_KEYS.PRESETS]) {
        void refreshState();
      }
    });
  }
}
