import { ext } from '../shared/ext';
import { createTranslator, type I18nKey } from '../shared/i18n';
import { createDeviceIcon, createUiIcon, setIconContent } from '../shared/icons';
import { loadAppData, savePresets } from '../shared/storage';
import type {
  CurrentDimensions,
  DevToolsState,
  Preset,
  ResizeTarget,
  RuntimeMessage,
  ScreenWorkArea,
  Settings,
} from '../shared/types';

let presets: Preset[] = [];
let settings!: Settings;
let currentDims: CurrentDimensions | null = null;
let devToolsState: DevToolsState | null = null;
let customTarget: ResizeTarget = 'viewport';
let t: (key: I18nKey) => string = createTranslator('auto');
let toastTimer: number | null = null;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function getPopupScreenWorkArea(): ScreenWorkArea {
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    availLeft: typeof scr.availLeft === 'number' ? scr.availLeft : 0,
    availTop: typeof scr.availTop === 'number' ? scr.availTop : 0,
    availWidth: scr.availWidth || 1920,
    availHeight: scr.availHeight || 1080,
  };
}

async function sendBg<T>(message: RuntimeMessage): Promise<T> {
  const res = (await ext.runtime.sendMessage(message)) as {
    ok: boolean;
    data?: T;
    error?: string;
  };
  if (!res?.ok) {
    throw new Error(res?.error || 'Background error');
  }
  return res.data as T;
}

function showToast(text: string): void {
  const el = $<HTMLDivElement>('toast');
  el.textContent = text;
  el.classList.add('show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('show');
    toastTimer = null;
  }, 1800);
}

function formatPresetDims(p: Preset): string {
  const w = p.width !== null ? String(p.width) : 'Auto';
  const h = p.height !== null ? String(p.height) : 'Auto';
  return `${w} × ${h}`;
}

function isPresetMatchingCurrent(p: Preset): boolean {
  if (!currentDims) return false;
  const curW = p.target === 'viewport' ? currentDims.viewportWidth : currentDims.windowWidth;
  const curH = p.target === 'viewport' ? currentDims.viewportHeight : currentDims.windowHeight;
  if (curW === null || curH === null) return false;

  const wMatch = p.width === null || Math.abs(p.width - curW) <= 2;
  const hMatch = p.height === null || Math.abs(p.height - curH) <= 2;
  return wMatch && hMatch;
}

function updateMetricsUI(dims: CurrentDimensions): void {
  currentDims = dims;
  const vpEl = $<HTMLSpanElement>('val-viewport');
  const winEl = $<HTMLSpanElement>('val-window');
  const banner = $<HTMLDivElement>('restricted-banner');
  const undoBtn = $<HTMLButtonElement>('btn-undo');

  vpEl.textContent =
    dims.viewportWidth && dims.viewportHeight
      ? `${dims.viewportWidth} × ${dims.viewportHeight}`
      : '— × —';
  winEl.textContent = `${dims.windowWidth} × ${dims.windowHeight}`;

  const zoomPill = $<HTMLSpanElement>('zoom-pill');
  const zoomPct = Math.round(dims.zoom * 100);
  zoomPill.textContent = `${zoomPct}%`;
  zoomPill.classList.toggle('hidden', zoomPct === 100 || dims.isRestrictedPage);

  banner.textContent = t('restrictedHint');
  banner.classList.toggle('hidden', !dims.isRestrictedPage);
  undoBtn.disabled = !dims.canUndo;

  // 若自定义输入框尚未填值，用当前尺寸预填 placeholder
  const wInput = $<HTMLInputElement>('input-width');
  const hInput = $<HTMLInputElement>('input-height');
  const refW = customTarget === 'viewport' ? dims.viewportWidth ?? dims.windowWidth : dims.windowWidth;
  const refH = customTarget === 'viewport' ? dims.viewportHeight ?? dims.windowHeight : dims.windowHeight;
  wInput.placeholder = String(refW);
  hInput.placeholder = String(refH);

  renderPresets();
}

function renderPresets(): void {
  const list = $<HTMLUListElement>('preset-list');
  list.textContent = '';

  if (presets.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = t('emptyPresets');
    list.appendChild(empty);
    return;
  }

  for (const preset of presets) {
    const li = document.createElement('li');
    li.className = 'preset-item';
    if (isPresetMatchingCurrent(preset)) {
      li.classList.add('active');
    }

    const iconWrap = document.createElement('span');
    iconWrap.className = 'preset-icon';
    setIconContent(iconWrap, createDeviceIcon(preset.icon));

    const info = document.createElement('div');
    info.className = 'preset-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'preset-title-row';

    const title = document.createElement('span');
    title.className = 'preset-title';
    title.textContent = preset.title;
    titleRow.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'preset-meta';
    meta.textContent = formatPresetDims(preset);

    info.append(titleRow, meta);

    const right = document.createElement('div');
    right.className = 'preset-right';

    if (preset.shortcut) {
      const kbd = document.createElement('span');
      kbd.className = 'kbd';
      kbd.textContent = preset.shortcut;
      right.appendChild(kbd);
    }

    const badge = document.createElement('span');
    badge.className = `badge ${preset.target === 'viewport' ? 'badge-vp' : 'badge-win'}`;
    badge.textContent = preset.target === 'viewport' ? 'VP' : 'WIN';
    right.appendChild(badge);

    const popBtn = document.createElement('button');
    popBtn.type = 'button';
    popBtn.className = 'popout-btn';
    popBtn.title = t('popOutTitle');
    setIconContent(popBtn, createUiIcon('popOut'));
    popBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void applyPreset(preset.id, true);
    });
    right.appendChild(popBtn);

    li.append(iconWrap, info, right);
    li.addEventListener('click', () => {
      void applyPreset(preset.id, false);
    });

    list.appendChild(li);
  }
}

async function applyPreset(presetId: string, popOut: boolean): Promise<void> {
  try {
    const dims = await sendBg<CurrentDimensions>({
      type: 'APPLY_PRESET',
      presetId,
      screen: getPopupScreenWorkArea(),
      popOut,
    });
    if (settings.closePopupOnResize || popOut) {
      window.close();
      return;
    }
    updateMetricsUI(dims);
    showToast(t('appliedToast'));
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err));
  }
}

function guessIconByWidth(w: number | null): Preset['icon'] {
  if (!w) return 'desktop';
  if (w <= 500) return 'mobile';
  if (w <= 1024) return 'tablet';
  if (w <= 1600) return 'laptop';
  return 'desktop';
}

async function saveNewPreset(width: number | null, height: number | null, target: ResizeTarget): Promise<void> {
  const newPreset: Preset = {
    id: `p_${Date.now().toString(36)}`,
    title: `${width ?? 'Auto'} × ${height ?? 'Auto'}`,
    width,
    height,
    target,
    icon: guessIconByWidth(width),
    alignment: 'center',
  };
  presets = [...presets, newPreset];
  await savePresets(presets);
  renderPresets();
  showToast(t('savedToast'));
}

function applyStaticLabels(): void {
  setIconContent($<HTMLSpanElement>('brand-icon'), createUiIcon('logo'));

  const btnRotate = $<HTMLButtonElement>('btn-rotate');
  setIconContent(btnRotate, createUiIcon('rotate'));
  btnRotate.title = t('rotateTitle');

  const btnUndo = $<HTMLButtonElement>('btn-undo');
  setIconContent(btnUndo, createUiIcon('undo'));
  btnUndo.title = t('undoTitle');

  const btnMax = $<HTMLButtonElement>('btn-maximize');
  setIconContent(btnMax, createUiIcon('maximize'));
  btnMax.title = t('maximize');

  const btnCapture = $<HTMLButtonElement>('btn-capture');
  setIconContent(btnCapture, createUiIcon('bookmark'));
  btnCapture.title = t('captureTitle');

  const btnSettings = $<HTMLButtonElement>('btn-settings');
  setIconContent(btnSettings, createUiIcon('settings'));
  btnSettings.title = t('settings');

  const btnSaveCustom = $<HTMLButtonElement>('btn-save-custom');
  setIconContent(btnSaveCustom, createUiIcon('plus'));
  btnSaveCustom.title = t('savePreset');

  $<HTMLSpanElement>('lbl-viewport').textContent = t('currentViewport');
  $<HTMLSpanElement>('lbl-window').textContent = t('currentWindow');
  $<HTMLSpanElement>('lbl-presets').textContent = t('presetsHeading');
  $<HTMLSpanElement>('lbl-w').textContent = t('width');
  $<HTMLSpanElement>('lbl-h').textContent = t('height');
  $<HTMLButtonElement>('btn-apply').textContent = t('apply');

  // DevTools card static icons & labels
  setIconContent($<HTMLSpanElement>('devtools-icon'), createUiIcon('terminal'));
  $<HTMLSpanElement>('lbl-devtools').textContent = 'DevTools';

  const btnSplitR = $<HTMLButtonElement>('btn-dt-split-r');
  setIconContent(btnSplitR, createUiIcon('splitRight'));
  btnSplitR.title = t('devtoolsSplitRightTitle');

  const btnSplitB = $<HTMLButtonElement>('btn-dt-split-b');
  setIconContent(btnSplitB, createUiIcon('splitBottom'));
  btnSplitB.title = t('devtoolsSplitBottomTitle');
}

function setPillContent(btn: HTMLButtonElement, icon: SVGSVGElement, label: string): void {
  const span = document.createElement('span');
  span.textContent = label;
  btn.replaceChildren(icon, span);
}

function updateDevToolsUI(state: DevToolsState): void {
  devToolsState = state;
  const card = $<HTMLElement>('devtools-card');
  card.classList.toggle('hidden', !state.hasDevTools);
  if (!state.hasDevTools) return;

  const dot = $<HTMLSpanElement>('helper-dot');
  dot.classList.toggle('online', state.helperConnected);
  dot.title = state.helperConnected
    ? `${t('helperConnected')} ${state.helperVersion ? `v${state.helperVersion}` : ''}`.trim()
    : t('helperDisconnected');

  const pinBtn = $<HTMLButtonElement>('btn-dt-pin');
  pinBtn.classList.toggle('active', state.pinned);
  pinBtn.title = t('devtoolsPinTitle');
  setPillContent(pinBtn, createUiIcon('pin'), state.pinned ? t('devtoolsPinned') : t('devtoolsPin'));

  const rollupBtn = $<HTMLButtonElement>('btn-dt-rollup');
  const isCollapsed = state.rolledUp || state.minimized;
  rollupBtn.classList.toggle('active', isCollapsed);
  rollupBtn.title = state.helperConnected ? t('devtoolsRollupTitle') : t('devtoolsMinimizeTitle');
  setPillContent(
    rollupBtn,
    createUiIcon(isCollapsed ? 'expand' : 'rollup'),
    isCollapsed ? t('devtoolsRolledUp') : t('devtoolsRollup')
  );
}

function bindEvents(): void {
  $<HTMLButtonElement>('btn-rotate').addEventListener('click', async () => {
    try {
      const dims = await sendBg<CurrentDimensions>({
        type: 'ROTATE_WINDOW',
        screen: getPopupScreenWorkArea(),
      });
      updateMetricsUI(dims);
      showToast(t('rotatedToast'));
    } catch {
      // ignore
    }
  });

  $<HTMLButtonElement>('btn-undo').addEventListener('click', async () => {
    try {
      const dims = await sendBg<CurrentDimensions>({ type: 'UNDO_RESIZE' });
      updateMetricsUI(dims);
      showToast(t('undoneToast'));
    } catch {
      // ignore
    }
  });

  $<HTMLButtonElement>('btn-maximize').addEventListener('click', async () => {
    try {
      const dims = await sendBg<CurrentDimensions>({ type: 'MAXIMIZE_WINDOW' });
      updateMetricsUI(dims);
    } catch {
      // ignore
    }
  });

  $<HTMLButtonElement>('btn-capture').addEventListener('click', async () => {
    if (!currentDims) return;
    const useVp = currentDims.viewportWidth !== null && currentDims.viewportHeight !== null;
    const w = useVp ? currentDims.viewportWidth : currentDims.windowWidth;
    const h = useVp ? currentDims.viewportHeight : currentDims.windowHeight;
    await saveNewPreset(w, h, useVp ? 'viewport' : 'window');
  });

  $<HTMLButtonElement>('btn-settings').addEventListener('click', () => {
    void ext.runtime.openOptionsPage();
  });

  for (const segBtn of document.querySelectorAll<HTMLButtonElement>('.seg-btn')) {
    segBtn.addEventListener('click', () => {
      customTarget = (segBtn.dataset.target as ResizeTarget) || 'viewport';
      for (const b of document.querySelectorAll<HTMLButtonElement>('.seg-btn')) {
        b.classList.toggle('active', b === segBtn);
      }
      if (currentDims) updateMetricsUI(currentDims);
    });
  }

  const parseCustomInputs = (): { w: number | null; h: number | null } | null => {
    const wRaw = $<HTMLInputElement>('input-width').value.trim();
    const hRaw = $<HTMLInputElement>('input-height').value.trim();
    const w = wRaw ? Number(wRaw) : null;
    const h = hRaw ? Number(hRaw) : null;

    if (w === null && h === null) return null;
    if ((w !== null && (!Number.isFinite(w) || w < 200)) || (h !== null && (!Number.isFinite(h) || h < 200))) {
      return null;
    }
    return { w: w !== null ? Math.round(w) : null, h: h !== null ? Math.round(h) : null };
  };

  $<HTMLFormElement>('custom-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const parsed = parseCustomInputs();
    if (!parsed) {
      showToast(t('invalidSize'));
      return;
    }
    try {
      const dims = await sendBg<CurrentDimensions>({
        type: 'APPLY_RESIZE',
        payload: {
          width: parsed.w,
          height: parsed.h,
          target: customTarget,
          alignment: 'keep',
          screen: getPopupScreenWorkArea(),
        },
      });
      if (settings.closePopupOnResize) {
        window.close();
        return;
      }
      updateMetricsUI(dims);
      showToast(t('appliedToast'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  });

  $<HTMLButtonElement>('btn-save-custom').addEventListener('click', async () => {
    const parsed = parseCustomInputs();
    if (!parsed) {
      showToast(t('invalidSize'));
      return;
    }
    await saveNewPreset(parsed.w, parsed.h, customTarget);
  });

  // DevTools Companion controls
  const openDevToolsOptions = () => {
    const url = ext.runtime.getURL('options/index.html#devtools');
    void ext.tabs.create({ url });
  };

  $<HTMLButtonElement>('btn-dt-pin').addEventListener('click', async () => {
    try {
      const res = await sendBg<{ state: DevToolsState; changed: boolean; needsHelper: boolean }>({
        type: 'TOGGLE_DEVTOOLS_PIN',
      });
      updateDevToolsUI(res.state);
      if (res.needsHelper) {
        showToast(t('devtoolsHelperNeeded'));
        openDevToolsOptions();
      } else if (res.changed) {
        showToast(res.state.pinned ? t('devtoolsPinnedToast') : t('devtoolsUnpinnedToast'));
      } else {
        showToast(t('devtoolsNotFound'));
      }
    } catch {
      showToast(t('devtoolsHelperNeeded'));
      openDevToolsOptions();
    }
  });

  $<HTMLButtonElement>('btn-dt-rollup').addEventListener('click', async () => {
    try {
      const res = await sendBg<{
        state: DevToolsState;
        mode: 'rollup' | 'minimize' | 'none';
        collapsed: boolean;
      }>({
        type: 'TOGGLE_DEVTOOLS_ROLLUP',
      });
      updateDevToolsUI(res.state);
      if (res.mode === 'rollup') {
        showToast(res.collapsed ? t('devtoolsRolledToast') : t('devtoolsExpandedToast'));
      } else if (res.mode === 'minimize') {
        showToast(res.collapsed ? t('devtoolsMinimizedToast') : t('devtoolsRestoredToast'));
      } else {
        showToast(t('devtoolsNotFound'));
      }
    } catch {
      // ignore
    }
  });

  const handleSplit = async (direction: 'right' | 'bottom') => {
    try {
      const res = await sendBg<{ applied: boolean; state: DevToolsState }>({
        type: 'SPLIT_DEVTOOLS',
        direction,
        screen: getPopupScreenWorkArea(),
      });
      updateDevToolsUI(res.state);
      if (res.applied) {
        showToast(t('devtoolsSplitToast'));
        const dims = await sendBg<CurrentDimensions>({
          type: 'GET_CURRENT_DIMENSIONS',
          screen: getPopupScreenWorkArea(),
        });
        updateMetricsUI(dims);
      } else {
        showToast(t('devtoolsNotFound'));
      }
    } catch {
      // ignore
    }
  };

  $<HTMLButtonElement>('btn-dt-split-r').addEventListener('click', () => void handleSplit('right'));
  $<HTMLButtonElement>('btn-dt-split-b').addEventListener('click', () => void handleSplit('bottom'));
}

async function init(): Promise<void> {
  const data = await loadAppData();
  presets = data.presets;
  settings = data.settings;
  t = createTranslator(settings.language);

  applyStaticLabels();
  bindEvents();
  renderPresets();

  const [dimsRes, dtRes] = await Promise.allSettled([
    sendBg<CurrentDimensions>({
      type: 'GET_CURRENT_DIMENSIONS',
      screen: getPopupScreenWorkArea(),
    }),
    sendBg<DevToolsState>({ type: 'GET_DEVTOOLS_STATE' }),
  ]);

  if (dimsRes.status === 'fulfilled') {
    updateMetricsUI(dimsRes.value);
  }
  if (dtRes.status === 'fulfilled') {
    updateDevToolsUI(dtRes.value);
  } else if (devToolsState) {
    updateDevToolsUI(devToolsState);
  }
}

void init();
