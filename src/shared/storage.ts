import { DEFAULT_PRESETS, DEFAULT_SETTINGS } from './defaults';
import { ext } from './ext';
import { normalizeShortcutString } from './geometry';
import type {
  DeviceType,
  ExportBundle,
  Preset,
  ResizeTarget,
  Settings,
  WindowAlignment,
} from './types';

const KEY_PRESETS = 'framesize_presets';
const KEY_SETTINGS = 'framesize_settings';
const KEY_SYNC_PREF = 'framesize_sync_enabled';

const VALID_ICONS: Set<DeviceType> = new Set(['desktop', 'laptop', 'tablet', 'mobile']);
const VALID_TARGETS: Set<ResizeTarget> = new Set(['viewport', 'window']);
const VALID_ALIGNMENTS: Set<WindowAlignment> = new Set([
  'keep',
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'custom',
]);

function generateId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizePositiveInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function mapLegacyIcon(raw: unknown): DeviceType {
  const str = String(raw ?? '').toLowerCase();
  if (VALID_ICONS.has(str as DeviceType)) return str as DeviceType;
  if (str.includes('phone') || str.includes('mobile') || str.includes('iphone')) return 'mobile';
  if (str.includes('pad') || str.includes('tablet')) return 'tablet';
  if (str.includes('lap') || str.includes('book')) return 'laptop';
  return 'desktop';
}

function mapLegacyTarget(raw: unknown): ResizeTarget {
  const str = String(raw ?? '').toLowerCase();
  if (VALID_TARGETS.has(str as ResizeTarget)) return str as ResizeTarget;
  if (str === 'window' || str === 'outer') return 'window';
  return 'viewport';
}

function mapLegacyAlignment(raw: unknown, hasCoords: boolean): WindowAlignment {
  const str = String(raw ?? '').toLowerCase();
  if (VALID_ALIGNMENTS.has(str as WindowAlignment)) return str as WindowAlignment;
  if (str.includes('center')) return 'center';
  if (hasCoords) return 'custom';
  return 'keep';
}

export function sanitizePreset(raw: unknown): Preset | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const width = sanitizePositiveInt(obj.width ?? obj.w);
  const height = sanitizePositiveInt(obj.height ?? obj.h);
  if (width === null && height === null) return null;

  const rawLeft = obj.left ?? obj.x;
  const rawTop = obj.top ?? obj.y;
  const left = rawLeft !== undefined && rawLeft !== '' && Number.isFinite(Number(rawLeft))
    ? Math.round(Number(rawLeft))
    : undefined;
  const top = rawTop !== undefined && rawTop !== '' && Number.isFinite(Number(rawTop))
    ? Math.round(Number(rawTop))
    : undefined;

  const titleRaw = String(obj.title ?? obj.name ?? obj.desc ?? '').trim();
  const fallbackTitle = `${width ?? 'Auto'} × ${height ?? 'Auto'}`;

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : generateId(),
    title: titleRaw || fallbackTitle,
    width,
    height,
    target: mapLegacyTarget(obj.target ?? obj.type),
    icon: mapLegacyIcon(obj.icon ?? obj.device),
    alignment: mapLegacyAlignment(obj.alignment ?? obj.pos, left !== undefined || top !== undefined),
    left,
    top,
    shortcut: normalizeShortcutString(typeof obj.shortcut === 'string' ? obj.shortcut : undefined),
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;

  const pos = obj.tooltipPosition;
  const display = obj.tooltipDisplay;
  const lang = obj.language;
  const dur = Number(obj.tooltipDuration);

  return {
    syncEnabled: typeof obj.syncEnabled === 'boolean' ? obj.syncEnabled : DEFAULT_SETTINGS.syncEnabled,
    closePopupOnResize:
      typeof obj.closePopupOnResize === 'boolean'
        ? obj.closePopupOnResize
        : DEFAULT_SETTINGS.closePopupOnResize,
    tooltipEnabled:
      typeof obj.tooltipEnabled === 'boolean' ? obj.tooltipEnabled : DEFAULT_SETTINGS.tooltipEnabled,
    tooltipDuration: Number.isFinite(dur) && dur >= 500 && dur <= 10000 ? Math.round(dur) : DEFAULT_SETTINGS.tooltipDuration,
    tooltipPosition:
      pos === 'bottom-right' || pos === 'bottom-left' || pos === 'top-right' || pos === 'top-left'
        ? pos
        : DEFAULT_SETTINGS.tooltipPosition,
    tooltipDisplay:
      display === 'both' || display === 'viewport' || display === 'window'
        ? display
        : DEFAULT_SETTINGS.tooltipDisplay,
    breakpointPreset:
      obj.breakpointPreset === 'tailwind' ||
      obj.breakpointPreset === 'bootstrap' ||
      obj.breakpointPreset === 'off'
        ? obj.breakpointPreset
        : DEFAULT_SETTINGS.breakpointPreset,
    enablePageShortcuts:
      typeof obj.enablePageShortcuts === 'boolean'
        ? obj.enablePageShortcuts
        : DEFAULT_SETTINGS.enablePageShortcuts,
    autoZoomOversized:
      typeof obj.autoZoomOversized === 'boolean'
        ? obj.autoZoomOversized
        : DEFAULT_SETTINGS.autoZoomOversized,
    language: lang === 'auto' || lang === 'zh' || lang === 'en' ? lang : DEFAULT_SETTINGS.language,
    devtoolsRollupHeight:
      Number.isFinite(Number(obj.devtoolsRollupHeight)) &&
      Number(obj.devtoolsRollupHeight) >= 28 &&
      Number(obj.devtoolsRollupHeight) <= 64
        ? Math.round(Number(obj.devtoolsRollupHeight))
        : DEFAULT_SETTINGS.devtoolsRollupHeight,
    devtoolsSplitRatio:
      Number.isFinite(Number(obj.devtoolsSplitRatio)) &&
      Number(obj.devtoolsSplitRatio) >= 0.35 &&
      Number(obj.devtoolsSplitRatio) <= 0.8
        ? Number(Number(obj.devtoolsSplitRatio).toFixed(2))
        : DEFAULT_SETTINGS.devtoolsSplitRatio,
    devtoolsOpacity:
      Number.isFinite(Number(obj.devtoolsOpacity)) &&
      Number(obj.devtoolsOpacity) >= 50 &&
      Number(obj.devtoolsOpacity) <= 95
        ? Math.round(Number(obj.devtoolsOpacity))
        : DEFAULT_SETTINGS.devtoolsOpacity,
    devtoolsAutoDockCompact:
      typeof obj.devtoolsAutoDockCompact === 'boolean'
        ? obj.devtoolsAutoDockCompact
        : DEFAULT_SETTINGS.devtoolsAutoDockCompact,
  };
}

async function isSyncEnabledLocal(): Promise<boolean> {
  try {
    const res = await ext.storage.local.get(KEY_SYNC_PREF);
    if (typeof res[KEY_SYNC_PREF] === 'boolean') {
      return res[KEY_SYNC_PREF];
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS.syncEnabled;
}

export async function loadAppData(): Promise<{ presets: Preset[]; settings: Settings }> {
  const useSync = await isSyncEnabledLocal();
  const primary = useSync && ext.storage.sync ? ext.storage.sync : ext.storage.local;

  let data: Record<string, unknown> = {};
  try {
    data = await primary.get([KEY_PRESETS, KEY_SETTINGS]);
  } catch {
    data = await ext.storage.local.get([KEY_PRESETS, KEY_SETTINGS]);
  }

  // 若 sync 中缺少某一项，按字段级回退读取 local，避免覆盖另一项已同步的数据
  if (
    primary !== ext.storage.local &&
    (!Array.isArray(data[KEY_PRESETS]) || !data[KEY_SETTINGS])
  ) {
    const localData = await ext.storage.local.get([KEY_PRESETS, KEY_SETTINGS]);
    if (!Array.isArray(data[KEY_PRESETS]) && Array.isArray(localData[KEY_PRESETS])) {
      data[KEY_PRESETS] = localData[KEY_PRESETS];
    }
    if (!data[KEY_SETTINGS] && localData[KEY_SETTINGS]) {
      data[KEY_SETTINGS] = localData[KEY_SETTINGS];
    }
  }

  const rawPresets = Array.isArray(data[KEY_PRESETS]) ? data[KEY_PRESETS] : null;
  const presets = rawPresets
    ? rawPresets.map(sanitizePreset).filter((p): p is Preset => p !== null)
    : DEFAULT_PRESETS.map((p) => ({ ...p }));

  const settings = sanitizeSettings(data[KEY_SETTINGS]);
  settings.syncEnabled = useSync;

  return { presets, settings };
}

export async function savePresets(presets: Preset[]): Promise<{ usedFallback: boolean }> {
  const useSync = await isSyncEnabledLocal();
  // 本地始终保留镜像，便于离线与快速读取
  await ext.storage.local.set({ [KEY_PRESETS]: presets });

  if (useSync && ext.storage.sync) {
    try {
      await ext.storage.sync.set({ [KEY_PRESETS]: presets });
      return { usedFallback: false };
    } catch {
      return { usedFallback: true };
    }
  }
  return { usedFallback: false };
}

export async function saveSettings(settings: Settings): Promise<{ usedFallback: boolean }> {
  await ext.storage.local.set({
    [KEY_SYNC_PREF]: settings.syncEnabled,
    [KEY_SETTINGS]: settings,
  });

  if (settings.syncEnabled && ext.storage.sync) {
    try {
      await ext.storage.sync.set({ [KEY_SETTINGS]: settings });
      return { usedFallback: false };
    } catch {
      return { usedFallback: true };
    }
  }
  return { usedFallback: false };
}

export async function initializeStorageDefaults(): Promise<void> {
  const { presets, settings } = await loadAppData();
  const localCheck = await ext.storage.local.get([KEY_PRESETS, KEY_SETTINGS]);
  if (!Array.isArray(localCheck[KEY_PRESETS])) {
    await savePresets(presets);
  }
  if (!localCheck[KEY_SETTINGS]) {
    await saveSettings(settings);
  }
}

export function buildExportBundle(presets: Preset[], settings: Settings): ExportBundle {
  return {
    schema: 'framesize-v1',
    exportedAt: new Date().toISOString(),
    presets,
    settings,
  };
}

/**
 * 解析导入的 JSON 配置。
 * 同时支持 FrameSize 标准格式、纯 Preset 数组以及常见原版 Window Resizer 导出字段。
 */
export function parseImportedConfig(rawText: string): {
  presets: Preset[];
  settings?: Settings;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('INVALID_JSON');
  }

  let candidateList: unknown[] | null = null;
  let candidateSettings: Settings | undefined;

  if (Array.isArray(parsed)) {
    candidateList = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.presets)) {
      candidateList = obj.presets;
    } else if (Array.isArray(obj.resolutions)) {
      candidateList = obj.resolutions;
    } else if (Array.isArray(obj.items)) {
      candidateList = obj.items;
    }
    if (obj.settings && typeof obj.settings === 'object') {
      candidateSettings = sanitizeSettings(obj.settings);
    }
  }

  if (!candidateList) {
    throw new Error('INVALID_SCHEMA');
  }

  const presets = candidateList
    .map(sanitizePreset)
    .filter((p): p is Preset => p !== null);

  if (presets.length === 0) {
    throw new Error('EMPTY_PRESETS');
  }

  // 确保导入项 ID 唯一
  const seen = new Set<string>();
  const deduped = presets.map((p) => {
    if (seen.has(p.id)) {
      return { ...p, id: generateId() };
    }
    seen.add(p.id);
    return p;
  });

  return { presets: deduped, settings: candidateSettings };
}

export const STORAGE_KEYS = {
  PRESETS: KEY_PRESETS,
  SETTINGS: KEY_SETTINGS,
  SYNC_PREF: KEY_SYNC_PREF,
} as const;
