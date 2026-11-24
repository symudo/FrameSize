export type DeviceType = 'desktop' | 'laptop' | 'tablet' | 'mobile';
export type ResizeTarget = 'viewport' | 'window';
export type WindowAlignment =
  | 'keep'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'custom';

export type TooltipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type TooltipDisplayMode = 'both' | 'viewport' | 'window';
export type LanguageSetting = 'auto' | 'zh' | 'en';

export interface Preset {
  id: string;
  title: string;
  width: number | null;
  height: number | null;
  target: ResizeTarget;
  icon: DeviceType;
  alignment: WindowAlignment;
  left?: number;
  top?: number;
  shortcut?: string;
}

export interface Settings {
  syncEnabled: boolean;
  closePopupOnResize: boolean;
  tooltipEnabled: boolean;
  tooltipDuration: number; // ms
  tooltipPosition: TooltipPosition;
  tooltipDisplay: TooltipDisplayMode;
  enablePageShortcuts: boolean;
  language: LanguageSetting;
  devtoolsRollupHeight: number; // logical px for Win32 title bar rollup
  devtoolsSplitRatio: number; // 0.35 - 0.80 main browser width ratio
}

export type SplitDirection = 'right' | 'bottom';

export interface DevToolsState {
  hasDevTools: boolean;
  windowId: number | null;
  minimized: boolean;
  helperConnected: boolean;
  helperVersion: string | null;
  pinned: boolean;
  rolledUp: boolean;
  title: string | null;
}

export interface ScreenWorkArea {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}

export interface ViewportMetrics {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  screen: ScreenWorkArea;
}

export interface FrameOverhead {
  dx: number;
  dy: number;
}

export interface WindowSnapshot {
  width: number;
  height: number;
  left: number;
  top: number;
  state: chrome.windows.windowStateEnum;
}

export interface CurrentDimensions {
  windowId: number;
  windowWidth: number;
  windowHeight: number;
  windowLeft: number;
  windowTop: number;
  windowState: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
  zoom: number;
  canUndo: boolean;
  isRestrictedPage: boolean;
}

export interface ResizePayload {
  width: number | null;
  height: number | null;
  target: ResizeTarget;
  alignment?: WindowAlignment;
  left?: number;
  top?: number;
  screen?: ScreenWorkArea;
  popOut?: boolean;
}

export interface ExportBundle {
  schema: 'framesize-v1';
  exportedAt: string;
  presets: Preset[];
  settings: Settings;
}

export type RuntimeMessage =
  | { type: 'GET_CURRENT_DIMENSIONS'; screen?: ScreenWorkArea }
  | { type: 'APPLY_RESIZE'; payload: ResizePayload }
  | { type: 'APPLY_PRESET'; presetId: string; screen?: ScreenWorkArea; popOut?: boolean }
  | { type: 'ROTATE_WINDOW'; screen?: ScreenWorkArea }
  | { type: 'UNDO_RESIZE' }
  | { type: 'MAXIMIZE_WINDOW' }
  | { type: 'GET_DEVTOOLS_STATE' }
  | { type: 'TOGGLE_DEVTOOLS_PIN' }
  | { type: 'TOGGLE_DEVTOOLS_ROLLUP' }
  | { type: 'TOGGLE_DEVTOOLS_MINIMIZE' }
  | { type: 'SPLIT_DEVTOOLS'; direction: SplitDirection; screen?: ScreenWorkArea }
  | { type: 'QUERY_PAGE_METRICS' }
  | { type: 'SHOW_TOOLTIP_HINT'; windowWidth?: number; windowHeight?: number };
