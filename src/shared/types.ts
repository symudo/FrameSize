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
export type BreakpointPreset = 'tailwind' | 'bootstrap' | 'off';
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
  breakpointPreset: BreakpointPreset;
  enablePageShortcuts: boolean;
  autoZoomOversized: boolean; // 目标 Viewport 超出当前屏幕可用尺寸时自动降低页面 Zoom 以精准模拟
  language: LanguageSetting;
  devtoolsFloatingBar: boolean; // 检测到独立 DevTools 时在网页角落显示可拖拽的迷你控制栏/展开按钮
  devtoolsSplitRatio: number; // 0.35 - 0.80 main browser width ratio
  devtoolsOpacity: number; // 50 - 95 percentage when translucent
  devtoolsAutoDockCompact: boolean; // 点击手机/平板预设时，若存在独立 DevTools 则自动靠左并将 DevTools 紧贴右侧
}

export type SplitDirection = 'right' | 'bottom';

export interface DevToolsState {
  hasDevTools: boolean;
  windowId: number | null;
  helperConnected: boolean;
  helperVersion: string | null;
  pinned: boolean;
  collapsed: boolean;
  translucent: boolean;
  opacity: number;
  title: string | null;
}

export interface ScreenWorkArea {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  screenWidth?: number;
  screenHeight?: number;
  systemDpr?: number;
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
  tabId?: number;
  zoom?: number;
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
  autoZoomApplied?: boolean;
  screen?: ScreenWorkArea;
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
  presetIcon?: DeviceType;
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
  | { type: 'TOGGLE_DEVTOOLS_COLLAPSE' }
  | { type: 'TOGGLE_DEVTOOLS_OPACITY' }
  | { type: 'SPLIT_DEVTOOLS'; direction: SplitDirection; screen?: ScreenWorkArea }
  | { type: 'DEVTOOLS_STATE_UPDATED'; state: DevToolsState }
  | { type: 'QUERY_PAGE_METRICS' }
  | { type: 'SHOW_TOOLTIP_HINT'; windowWidth?: number; windowHeight?: number };
