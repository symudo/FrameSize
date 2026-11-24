import { DEFAULT_PRESETS } from '../shared/defaults';
import { ext, getShortcutsPageUrl, isFirefox } from '../shared/ext';
import { normalizeShortcutFromEvent } from '../shared/geometry';
import { createTranslator, type I18nKey } from '../shared/i18n';
import { createDeviceIcon, createUiIcon, setIconContent } from '../shared/icons';
import {
  buildExportBundle,
  loadAppData,
  parseImportedConfig,
  savePresets,
  saveSettings,
} from '../shared/storage';
import type {
  DeviceType,
  DevToolsState,
  LanguageSetting,
  Preset,
  ResizeTarget,
  RuntimeMessage,
  Settings,
  TooltipDisplayMode,
  TooltipPosition,
  WindowAlignment,
} from '../shared/types';

let presets: Preset[] = [];
let settings!: Settings;
let t: (key: I18nKey) => string = createTranslator('auto');
let editingPresetId: string | null = null;
let selectedIcon: DeviceType = 'desktop';
let dragSourceId: string | null = null;
let toastTimer: number | null = null;
let lastHelperState: DevToolsState | null = null;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function showToast(text: string): void {
  const el = $<HTMLDivElement>('toast');
  el.textContent = text;
  el.classList.add('show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('show');
    toastTimer = null;
  }, 2400);
}

function getAlignmentLabel(a: WindowAlignment): string {
  switch (a) {
    case 'center':
      return t('alignCenter');
    case 'top-left':
      return t('alignTopLeft');
    case 'top-right':
      return t('alignTopRight');
    case 'bottom-left':
      return t('alignBottomLeft');
    case 'bottom-right':
      return t('alignBottomRight');
    case 'custom':
      return t('alignCustom');
    default:
      return t('alignKeep');
  }
}

function populateSelect(
  el: HTMLSelectElement,
  options: Array<{ value: string; label: string }>,
  current: string
): void {
  el.textContent = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    el.appendChild(o);
  }
  el.value = current;
}

function renderI18n(): void {
  setIconContent($<HTMLSpanElement>('brand-icon'), createUiIcon('logo'));
  const ver = ext.runtime?.getManifest?.()?.version;
  if (ver) {
    $<HTMLDivElement>('brand-ver').textContent = `v${ver}`;
  }

  $<HTMLButtonElement>('nav-presets').textContent = t('navPresets');
  $<HTMLButtonElement>('nav-devtools').textContent = t('navDevtools');
  $<HTMLButtonElement>('nav-tooltip').textContent = t('navTooltip');
  $<HTMLButtonElement>('nav-general').textContent = t('navGeneral');
  $<HTMLButtonElement>('nav-backup').textContent = t('navBackup');

  $<HTMLHeadingElement>('heading-presets').textContent = t('navPresets');
  $<HTMLParagraphElement>('subtitle-drag').textContent = t('dragToReorder');
  $<HTMLButtonElement>('btn-reset-defaults').textContent = t('resetDefaults');
  $<HTMLButtonElement>('btn-add-preset').textContent = `+ ${t('addPreset')}`;

  // DevTools section
  $<HTMLHeadingElement>('heading-devtools').textContent = t('devtoolsSectionTitle');
  $<HTMLButtonElement>('btn-recheck-helper').textContent = t('helperRefresh');
  $<HTMLDivElement>('lbl-helper-status').textContent = t('helperStatusLabel');
  $<HTMLDivElement>('lbl-rollup-height').textContent = t('rollupHeightLabel');
  $<HTMLDivElement>('lbl-split-ratio').textContent = t('splitRatioLabel');
  $<HTMLHeadingElement>('lbl-helper-install-title').textContent = t('helperInstallTitle');
  $<HTMLParagraphElement>('desc-helper-install').textContent = t('helperInstallDesc');
  $<HTMLSpanElement>('lbl-ext-id').textContent = t('helperExtIdLabel');
  $<HTMLDivElement>('lbl-helper-cmd').textContent = t('helperCmdLabel');
  $<HTMLButtonElement>('btn-copy-cmd').textContent = t('copyCmd');

  const extId = ext.runtime?.id ?? '';
  $<HTMLElement>('val-ext-id').textContent = extId || '(unknown)';
  $<HTMLElement>('helper-install-cmd').textContent = isFirefox
    ? '.\\install.ps1'
    : `.\\install.ps1 -ExtensionId ${extId}`;
  renderHelperStatus();

  // Tooltip section
  $<HTMLHeadingElement>('heading-tooltip').textContent = t('tooltipSectionTitle');
  $<HTMLDivElement>('lbl-tooltip-enabled').textContent = t('tooltipEnabledLabel');
  $<HTMLDivElement>('desc-tooltip-enabled').textContent = t('tooltipEnabledDesc');
  $<HTMLDivElement>('lbl-tooltip-display').textContent = t('tooltipDisplayLabel');
  $<HTMLDivElement>('lbl-tooltip-position').textContent = t('tooltipPositionLabel');
  $<HTMLDivElement>('lbl-tooltip-duration').textContent = t('tooltipDurationLabel');

  populateSelect(
    $<HTMLSelectElement>('opt-tooltip-display'),
    [
      { value: 'both', label: t('displayBoth') },
      { value: 'viewport', label: t('displayViewport') },
      { value: 'window', label: t('displayWindow') },
    ],
    settings.tooltipDisplay
  );

  const posLabels: Record<TooltipPosition, string> = {
    'top-left': t('posTopLeft'),
    'top-right': t('posTopRight'),
    'bottom-left': t('posBottomLeft'),
    'bottom-right': t('posBottomRight'),
  };
  for (const cell of document.querySelectorAll<HTMLButtonElement>('.pos-cell')) {
    const p = cell.dataset.pos as TooltipPosition;
    cell.textContent = posLabels[p];
    cell.classList.toggle('active', settings.tooltipPosition === p);
  }

  // General section
  $<HTMLHeadingElement>('heading-general').textContent = t('generalSectionTitle');
  $<HTMLDivElement>('lbl-close-popup').textContent = t('closePopupLabel');
  $<HTMLDivElement>('desc-close-popup').textContent = t('closePopupDesc');
  $<HTMLDivElement>('lbl-sync-enabled').textContent = t('syncEnabledLabel');
  $<HTMLDivElement>('desc-sync-enabled').textContent = t('syncEnabledDesc');
  $<HTMLDivElement>('lbl-page-shortcuts').textContent = t('pageShortcutsLabel');
  $<HTMLDivElement>('desc-page-shortcuts').textContent = t('pageShortcutsDesc');
  $<HTMLDivElement>('lbl-auto-zoom').textContent = t('autoZoomLabel');
  $<HTMLDivElement>('desc-auto-zoom').textContent = t('autoZoomDesc');
  $<HTMLDivElement>('lbl-language').textContent = t('languageLabel');
  $<HTMLHeadingElement>('lbl-global-shortcuts').textContent = t('globalShortcutsTitle');
  $<HTMLParagraphElement>('desc-global-shortcuts').textContent = t('globalShortcutsDesc');
  $<HTMLElement>('shortcuts-url').textContent = getShortcutsPageUrl();
  $<HTMLButtonElement>('btn-copy-url').textContent = t('copyPath');

  populateSelect(
    $<HTMLSelectElement>('opt-language'),
    [
      { value: 'auto', label: t('langAuto') },
      { value: 'zh', label: t('langZh') },
      { value: 'en', label: t('langEn') },
    ],
    settings.language
  );

  // Backup section
  $<HTMLHeadingElement>('heading-backup').textContent = t('backupSectionTitle');
  $<HTMLHeadingElement>('lbl-export-title').textContent = t('exportTitle');
  $<HTMLParagraphElement>('desc-export').textContent = t('exportDesc');
  $<HTMLButtonElement>('btn-export').textContent = t('exportBtn');
  $<HTMLHeadingElement>('lbl-import-title').textContent = t('importTitle');
  $<HTMLParagraphElement>('desc-import').textContent = t('importDesc');
  $<HTMLSpanElement>('lbl-import-replace').textContent = t('importModeReplace');
  $<HTMLSpanElement>('lbl-import-merge').textContent = t('importModeMerge');
  $<HTMLButtonElement>('btn-import').textContent = t('importBtn');

  // Modal static labels
  $<HTMLLabelElement>('lbl-f-title').textContent = t('presetTitle');
  $<HTMLInputElement>('f-title').placeholder = t('presetTitlePlaceholder');
  $<HTMLLabelElement>('lbl-f-width').textContent = t('presetWidth');
  $<HTMLLabelElement>('lbl-f-height').textContent = t('presetHeight');
  $<HTMLParagraphElement>('lbl-f-blank-hint').textContent = t('keepBlankHint');
  $<HTMLLabelElement>('lbl-f-target').textContent = t('presetTarget');
  $<HTMLLabelElement>('lbl-f-alignment').textContent = t('presetAlignment');
  $<HTMLLabelElement>('lbl-f-left').textContent = t('posLeft');
  $<HTMLLabelElement>('lbl-f-top').textContent = t('posTop');
  $<HTMLLabelElement>('lbl-f-icon').textContent = t('presetIcon');
  $<HTMLLabelElement>('lbl-f-shortcut').textContent = t('presetShortcut');
  $<HTMLInputElement>('f-shortcut').placeholder = t('shortcutPlaceholder');
  $<HTMLButtonElement>('btn-clear-shortcut').textContent = t('shortcutClear');
  $<HTMLButtonElement>('btn-cancel-modal').textContent = t('cancel');
  $<HTMLButtonElement>('btn-save-modal').textContent = t('save');

  populateSelect(
    $<HTMLSelectElement>('f-target'),
    [
      { value: 'viewport', label: t('targetViewport') },
      { value: 'window', label: t('targetWindow') },
    ],
    'viewport'
  );

  populateSelect(
    $<HTMLSelectElement>('f-alignment'),
    [
      { value: 'keep', label: t('alignKeep') },
      { value: 'center', label: t('alignCenter') },
      { value: 'top-left', label: t('alignTopLeft') },
      { value: 'top-right', label: t('alignTopRight') },
      { value: 'bottom-left', label: t('alignBottomLeft') },
      { value: 'bottom-right', label: t('alignBottomRight') },
      { value: 'custom', label: t('alignCustom') },
    ],
    'center'
  );

  renderIconPicker();
}

function renderIconPicker(): void {
  const picker = $<HTMLDivElement>('icon-picker');
  picker.textContent = '';
  const items: Array<{ type: DeviceType; label: string }> = [
    { type: 'mobile', label: t('iconMobile') },
    { type: 'tablet', label: t('iconTablet') },
    { type: 'laptop', label: t('iconLaptop') },
    { type: 'desktop', label: t('iconDesktop') },
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `icon-opt${selectedIcon === item.type ? ' active' : ''}`;
    const span = document.createElement('span');
    span.textContent = item.label;
    btn.append(createDeviceIcon(item.type), span);
    btn.addEventListener('click', () => {
      selectedIcon = item.type;
      renderIconPicker();
    });
    picker.appendChild(btn);
  }
}

function renderHelperStatus(): void {
  const pill = $<HTMLSpanElement>('pill-helper-status');
  const desc = $<HTMLDivElement>('val-helper-status');
  const connected = Boolean(lastHelperState?.helperConnected);
  pill.classList.toggle('online', connected);
  pill.textContent = connected
    ? `${t('helperConnected')}${lastHelperState?.helperVersion ? ` v${lastHelperState.helperVersion}` : ''}`
    : t('helperDisconnected');
  desc.textContent = connected
    ? (lastHelperState?.hasDevTools ? (lastHelperState.title ?? 'DevTools Ready') : 'dev.framesize.helper')
    : 'dev.framesize.helper';
}

async function checkHelperConnection(): Promise<void> {
  try {
    const res = (await ext.runtime.sendMessage({
      type: 'GET_DEVTOOLS_STATE',
    } satisfies RuntimeMessage)) as { ok: boolean; data?: DevToolsState };
    if (res?.ok && res.data) {
      lastHelperState = res.data;
    }
  } catch {
    lastHelperState = null;
  }
  renderHelperStatus();
}

function syncSettingsControls(): void {
  $<HTMLInputElement>('opt-rollup-height').value = String(settings.devtoolsRollupHeight);
  $<HTMLSpanElement>('val-rollup-height').textContent = `${settings.devtoolsRollupHeight} px`;
  const splitPct = Math.round(settings.devtoolsSplitRatio * 100);
  $<HTMLInputElement>('opt-split-ratio').value = String(splitPct);
  $<HTMLSpanElement>('val-split-ratio').textContent = `${splitPct}%`;

  $<HTMLInputElement>('opt-tooltip-enabled').checked = settings.tooltipEnabled;
  $<HTMLSelectElement>('opt-tooltip-display').value = settings.tooltipDisplay;
  $<HTMLInputElement>('opt-tooltip-duration').value = String(settings.tooltipDuration);
  $<HTMLSpanElement>('val-tooltip-duration').textContent =
    `${(settings.tooltipDuration / 1000).toFixed(2).replace(/\.?0+$/, '')} ${t('seconds')}`;

  $<HTMLInputElement>('opt-close-popup').checked = settings.closePopupOnResize;
  $<HTMLInputElement>('opt-sync-enabled').checked = settings.syncEnabled;
  $<HTMLInputElement>('opt-page-shortcuts').checked = settings.enablePageShortcuts;
  $<HTMLInputElement>('opt-auto-zoom').checked = settings.autoZoomOversized;
  $<HTMLSelectElement>('opt-language').value = settings.language;

  for (const cell of document.querySelectorAll<HTMLButtonElement>('.pos-cell')) {
    cell.classList.toggle('active', cell.dataset.pos === settings.tooltipPosition);
  }
}

async function persistPresets(): Promise<void> {
  const res = await savePresets(presets);
  if (res.usedFallback) {
    showToast(t('syncFallbackNotice'));
  }
}

async function persistSettings(showMsg = true): Promise<void> {
  const res = await saveSettings(settings);
  if (res.usedFallback) {
    showToast(t('syncFallbackNotice'));
  } else if (showMsg) {
    showToast(t('settingsSaved'));
  }
}

function renderPresetTable(): void {
  const list = $<HTMLUListElement>('preset-table');
  list.textContent = '';

  for (const preset of presets) {
    const li = document.createElement('li');
    li.className = 'preset-row';
    li.draggable = true;
    li.dataset.id = preset.id;

    li.addEventListener('dragstart', () => {
      dragSourceId = preset.id;
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      dragSourceId = null;
      li.classList.remove('dragging');
      for (const el of list.querySelectorAll('.drag-over')) {
        el.classList.remove('drag-over');
      }
    });
    li.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      if (dragSourceId && dragSourceId !== preset.id) {
        li.classList.add('drag-over');
      }
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });
    li.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      li.classList.remove('drag-over');
      if (!dragSourceId || dragSourceId === preset.id) return;
      const fromIdx = presets.findIndex((p) => p.id === dragSourceId);
      const toIdx = presets.findIndex((p) => p.id === preset.id);
      if (fromIdx < 0 || toIdx < 0) return;

      const updated = [...presets];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      presets = updated;
      await persistPresets();
      renderPresetTable();
    });

    const grip = document.createElement('span');
    grip.className = 'drag-handle';
    setIconContent(grip, createUiIcon('grip'));

    const icon = document.createElement('span');
    icon.className = 'row-icon';
    setIconContent(icon, createDeviceIcon(preset.icon));

    const main = document.createElement('div');
    main.className = 'row-main';

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = preset.title;

    const sub = document.createElement('div');
    sub.className = 'row-sub';

    const dims = document.createElement('span');
    dims.textContent = `${preset.width ?? 'Auto'} × ${preset.height ?? 'Auto'}`;
    sub.appendChild(dims);

    const badge = document.createElement('span');
    badge.className = `badge ${preset.target === 'viewport' ? 'badge-vp' : 'badge-win'}`;
    badge.textContent = preset.target === 'viewport' ? 'Viewport' : 'Window';
    sub.appendChild(badge);

    const align = document.createElement('span');
    align.textContent =
      preset.alignment === 'custom'
        ? `${getAlignmentLabel('custom')} (${preset.left ?? 0}, ${preset.top ?? 0})`
        : getAlignmentLabel(preset.alignment);
    sub.appendChild(align);

    if (preset.shortcut) {
      const kbd = document.createElement('span');
      kbd.className = 'kbd';
      kbd.textContent = preset.shortcut;
      sub.appendChild(kbd);
    }

    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-action';
    editBtn.title = t('edit');
    setIconContent(editBtn, createUiIcon('edit'));
    editBtn.addEventListener('click', () => openPresetModal(preset));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-action danger';
    delBtn.title = t('delete');
    setIconContent(delBtn, createUiIcon('trash'));
    delBtn.addEventListener('click', async () => {
      presets = presets.filter((p) => p.id !== preset.id);
      await persistPresets();
      renderPresetTable();
    });

    actions.append(editBtn, delBtn);
    li.append(grip, icon, main, actions);
    list.appendChild(li);
  }
}

function openPresetModal(preset?: Preset): void {
  editingPresetId = preset ? preset.id : null;
  $<HTMLHeadingElement>('modal-title').textContent = preset ? t('editPreset') : t('addPreset');

  $<HTMLInputElement>('f-title').value = preset?.title ?? '';
  $<HTMLInputElement>('f-width').value = preset?.width !== null && preset?.width !== undefined ? String(preset.width) : '';
  $<HTMLInputElement>('f-height').value = preset?.height !== null && preset?.height !== undefined ? String(preset.height) : '';
  $<HTMLSelectElement>('f-target').value = preset?.target ?? 'viewport';
  $<HTMLSelectElement>('f-alignment').value = preset?.alignment ?? 'center';
  $<HTMLInputElement>('f-left').value = preset?.left !== undefined ? String(preset.left) : '0';
  $<HTMLInputElement>('f-top').value = preset?.top !== undefined ? String(preset.top) : '0';
  $<HTMLInputElement>('f-shortcut').value = preset?.shortcut ?? '';

  selectedIcon = preset?.icon ?? 'desktop';
  renderIconPicker();

  const isCustomPos = ($<HTMLSelectElement>('f-alignment').value as WindowAlignment) === 'custom';
  $<HTMLDivElement>('custom-pos-fields').classList.toggle('hidden', !isCustomPos);

  $<HTMLDivElement>('preset-modal').classList.remove('hidden');
  $<HTMLInputElement>('f-title').focus();
}

function closePresetModal(): void {
  $<HTMLDivElement>('preset-modal').classList.add('hidden');
  editingPresetId = null;
}

function activateTab(tabName: string): void {
  const validTab = document.querySelector<HTMLButtonElement>(`.nav-item[data-tab="${tabName}"]`);
  if (!validTab) return;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.nav-item')) {
    b.classList.toggle('active', b === validTab);
  }
  for (const p of document.querySelectorAll<HTMLElement>('.panel')) {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  }
}

function bindEvents(): void {
  // Tabs
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.nav-item')) {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      if (targetTab) {
        activateTab(targetTab);
      }
    });
  }

  // Presets actions
  $<HTMLButtonElement>('btn-add-preset').addEventListener('click', () => openPresetModal());

  $<HTMLButtonElement>('btn-reset-defaults').addEventListener('click', async () => {
    if (!window.confirm(t('resetDefaultsConfirm'))) return;
    presets = DEFAULT_PRESETS.map((p) => ({ ...p }));
    await persistPresets();
    renderPresetTable();
    showToast(t('settingsSaved'));
  });

  // Modal controls
  $<HTMLSelectElement>('f-alignment').addEventListener('change', (ev) => {
    const val = (ev.target as HTMLSelectElement).value as WindowAlignment;
    $<HTMLDivElement>('custom-pos-fields').classList.toggle('hidden', val !== 'custom');
  });

  const shortcutInput = $<HTMLInputElement>('f-shortcut');
  shortcutInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') return;
    ev.preventDefault();
    if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === 'Escape') {
      shortcutInput.value = '';
      return;
    }
    const combo = normalizeShortcutFromEvent(ev);
    if (combo) {
      shortcutInput.value = combo;
    }
  });

  $<HTMLButtonElement>('btn-clear-shortcut').addEventListener('click', () => {
    shortcutInput.value = '';
  });

  $<HTMLButtonElement>('btn-cancel-modal').addEventListener('click', closePresetModal);
  $<HTMLDivElement>('preset-modal').addEventListener('click', (ev) => {
    if (ev.target === $<HTMLDivElement>('preset-modal')) {
      closePresetModal();
    }
  });

  $<HTMLFormElement>('preset-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const title = $<HTMLInputElement>('f-title').value.trim();
    const wRaw = $<HTMLInputElement>('f-width').value.trim();
    const hRaw = $<HTMLInputElement>('f-height').value.trim();
    const width = wRaw ? Math.round(Number(wRaw)) : null;
    const height = hRaw ? Math.round(Number(hRaw)) : null;

    if (width === null && height === null) {
      showToast(t('invalidSize'));
      return;
    }
    if ((width !== null && width < 200) || (height !== null && height < 200)) {
      showToast(t('invalidSize'));
      return;
    }

    const alignment = $<HTMLSelectElement>('f-alignment').value as WindowAlignment;
    const leftVal = $<HTMLInputElement>('f-left').value.trim();
    const topVal = $<HTMLInputElement>('f-top').value.trim();
    const shortcut = $<HTMLInputElement>('f-shortcut').value.trim() || undefined;

    const item: Preset = {
      id: editingPresetId ?? `p_${Date.now().toString(36)}`,
      title: title || `${width ?? 'Auto'} × ${height ?? 'Auto'}`,
      width,
      height,
      target: $<HTMLSelectElement>('f-target').value as ResizeTarget,
      icon: selectedIcon,
      alignment,
      left: alignment === 'custom' && leftVal ? Math.round(Number(leftVal)) : undefined,
      top: alignment === 'custom' && topVal ? Math.round(Number(topVal)) : undefined,
      shortcut,
    };

    if (editingPresetId) {
      presets = presets.map((p) => (p.id === editingPresetId ? item : p));
    } else {
      presets = [...presets, item];
    }

    await persistPresets();
    renderPresetTable();
    closePresetModal();
    showToast(t('settingsSaved'));
  });

  // DevTools helper settings
  $<HTMLButtonElement>('btn-recheck-helper').addEventListener('click', async () => {
    await checkHelperConnection();
    showToast(lastHelperState?.helperConnected ? t('helperConnected') : t('helperDisconnected'));
  });

  $<HTMLInputElement>('opt-rollup-height').addEventListener('input', (ev) => {
    const val = Number((ev.target as HTMLInputElement).value);
    settings.devtoolsRollupHeight = val;
    $<HTMLSpanElement>('val-rollup-height').textContent = `${val} px`;
  });
  $<HTMLInputElement>('opt-rollup-height').addEventListener('change', async () => {
    await persistSettings();
  });

  $<HTMLInputElement>('opt-split-ratio').addEventListener('input', (ev) => {
    const pct = Number((ev.target as HTMLInputElement).value);
    settings.devtoolsSplitRatio = Number((pct / 100).toFixed(2));
    $<HTMLSpanElement>('val-split-ratio').textContent = `${pct}%`;
  });
  $<HTMLInputElement>('opt-split-ratio').addEventListener('change', async () => {
    await persistSettings();
  });

  $<HTMLButtonElement>('btn-copy-cmd').addEventListener('click', async () => {
    const cmd = $<HTMLElement>('helper-install-cmd').textContent ?? '';
    try {
      await navigator.clipboard.writeText(cmd);
      showToast(t('copied'));
    } catch {
      // ignore
    }
  });

  // Tooltip settings
  $<HTMLInputElement>('opt-tooltip-enabled').addEventListener('change', async (ev) => {
    settings.tooltipEnabled = (ev.target as HTMLInputElement).checked;
    await persistSettings();
  });

  $<HTMLSelectElement>('opt-tooltip-display').addEventListener('change', async (ev) => {
    settings.tooltipDisplay = (ev.target as HTMLSelectElement).value as TooltipDisplayMode;
    await persistSettings();
  });

  for (const cell of document.querySelectorAll<HTMLButtonElement>('.pos-cell')) {
    cell.addEventListener('click', async () => {
      settings.tooltipPosition = cell.dataset.pos as TooltipPosition;
      syncSettingsControls();
      await persistSettings();
    });
  }

  $<HTMLInputElement>('opt-tooltip-duration').addEventListener('input', (ev) => {
    const ms = Number((ev.target as HTMLInputElement).value);
    settings.tooltipDuration = ms;
    $<HTMLSpanElement>('val-tooltip-duration').textContent =
      `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')} ${t('seconds')}`;
  });
  $<HTMLInputElement>('opt-tooltip-duration').addEventListener('change', async () => {
    await persistSettings();
  });

  // General settings
  $<HTMLInputElement>('opt-close-popup').addEventListener('change', async (ev) => {
    settings.closePopupOnResize = (ev.target as HTMLInputElement).checked;
    await persistSettings();
  });

  $<HTMLInputElement>('opt-sync-enabled').addEventListener('change', async (ev) => {
    settings.syncEnabled = (ev.target as HTMLInputElement).checked;
    await persistSettings();
    if (settings.syncEnabled) {
      await persistPresets();
    }
  });

  $<HTMLInputElement>('opt-page-shortcuts').addEventListener('change', async (ev) => {
    settings.enablePageShortcuts = (ev.target as HTMLInputElement).checked;
    await persistSettings();
  });

  $<HTMLInputElement>('opt-auto-zoom').addEventListener('change', async (ev) => {
    settings.autoZoomOversized = (ev.target as HTMLInputElement).checked;
    await persistSettings();
  });

  $<HTMLSelectElement>('opt-language').addEventListener('change', async (ev) => {
    settings.language = (ev.target as HTMLSelectElement).value as LanguageSetting;
    t = createTranslator(settings.language);
    renderI18n();
    syncSettingsControls();
    renderPresetTable();
    await persistSettings();
  });

  $<HTMLButtonElement>('btn-copy-url').addEventListener('click', async () => {
    const url = getShortcutsPageUrl();
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('copied'));
    } catch {
      // ignore
    }
  });

  // Backup: Export & Import
  $<HTMLButtonElement>('btn-export').addEventListener('click', () => {
    const bundle = buildExportBundle(presets, settings);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `framesize-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const fileInput = $<HTMLInputElement>('file-import');
  $<HTMLButtonElement>('btn-import').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedConfig(text);
      const mode =
        document.querySelector<HTMLInputElement>('input[name="import-mode"]:checked')?.value ??
        'replace';

      if (mode === 'merge') {
        const existingIds = new Set(presets.map((p) => p.id));
        const appended = imported.presets.map((p) =>
          existingIds.has(p.id) ? { ...p, id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` } : p
        );
        presets = [...presets, ...appended];
      } else {
        presets = imported.presets;
        if (imported.settings) {
          settings = imported.settings;
          t = createTranslator(settings.language);
          await persistSettings(false);
        }
      }

      await persistPresets();
      renderI18n();
      syncSettingsControls();
      renderPresetTable();
      showToast(t('importSuccess'));
    } catch {
      showToast(t('importError'));
    }
  });
}

async function init(): Promise<void> {
  const data = await loadAppData();
  presets = data.presets;
  settings = data.settings;
  t = createTranslator(settings.language);

  renderI18n();
  syncSettingsControls();
  renderPresetTable();
  bindEvents();
  const initialHash = window.location.hash.replace(/^#/, '');
  if (initialHash) {
    activateTab(initialHash);
  }
  void checkHelperConnection();
}

void init();
