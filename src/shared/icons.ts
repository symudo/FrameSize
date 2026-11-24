import type { DeviceType } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ShapeSpec {
  tag: 'rect' | 'line' | 'path' | 'polyline' | 'circle';
  attrs: Record<string, string>;
}

interface IconDef {
  strokeWidth?: string;
  filled?: boolean;
  shapes: readonly ShapeSpec[];
}

const DEVICE_ICONS: Record<DeviceType, IconDef> = {
  mobile: {
    shapes: [
      { tag: 'rect', attrs: { x: '7', y: '2.5', width: '10', height: '19', rx: '2.2' } },
      { tag: 'line', attrs: { x1: '11', y1: '18', x2: '13', y2: '18' } },
    ],
  },
  tablet: {
    shapes: [
      { tag: 'rect', attrs: { x: '4.5', y: '2.5', width: '15', height: '19', rx: '2.2' } },
      { tag: 'line', attrs: { x1: '11', y1: '18', x2: '13', y2: '18' } },
    ],
  },
  laptop: {
    shapes: [
      { tag: 'rect', attrs: { x: '3.5', y: '4.5', width: '17', height: '11.5', rx: '1.8' } },
      { tag: 'path', attrs: { d: 'M2 19h20' } },
    ],
  },
  desktop: {
    shapes: [
      { tag: 'rect', attrs: { x: '2.5', y: '3.5', width: '19', height: '13', rx: '2' } },
      { tag: 'path', attrs: { d: 'M8.5 20.5h7' } },
      { tag: 'path', attrs: { d: 'M12 16.5v4' } },
    ],
  },
};

export type UiIconName =
  | 'logo'
  | 'rotate'
  | 'undo'
  | 'maximize'
  | 'plus'
  | 'bookmark'
  | 'settings'
  | 'popOut'
  | 'grip'
  | 'edit'
  | 'trash';

const UI_ICON_DEFS: Record<UiIconName, IconDef> = {
  logo: {
    strokeWidth: '2',
    shapes: [
      { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '16', rx: '3', opacity: '0.35' } },
      { tag: 'polyline', attrs: { points: '14 8 18 8 18 12' } },
      { tag: 'polyline', attrs: { points: '10 16 6 16 6 12' } },
      { tag: 'line', attrs: { x1: '18', y1: '8', x2: '6', y2: '16' } },
    ],
  },
  rotate: {
    shapes: [
      { tag: 'path', attrs: { d: 'M20 7v6h-6' } },
      { tag: 'path', attrs: { d: 'M4 17v-6h6' } },
      { tag: 'path', attrs: { d: 'M20 13a8 8 0 0 0-14.5-4.7L4 11' } },
      { tag: 'path', attrs: { d: 'M4 11a8 8 0 0 0 14.5 4.7L20 13' } },
    ],
  },
  undo: {
    shapes: [
      { tag: 'polyline', attrs: { points: '9 14 4 9 9 4' } },
      { tag: 'path', attrs: { d: 'M20 20v-7a4 4 0 0 0-4-4H4' } },
    ],
  },
  maximize: {
    shapes: [
      { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
      { tag: 'polyline', attrs: { points: '9 21 3 21 3 15' } },
      { tag: 'line', attrs: { x1: '21', y1: '3', x2: '14', y2: '10' } },
      { tag: 'line', attrs: { x1: '3', y1: '21', x2: '10', y2: '14' } },
    ],
  },
  plus: {
    strokeWidth: '1.9',
    shapes: [
      { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '19' } },
      { tag: 'line', attrs: { x1: '5', y1: '12', x2: '19', y2: '12' } },
    ],
  },
  bookmark: {
    shapes: [
      { tag: 'path', attrs: { d: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' } },
    ],
  },
  settings: {
    shapes: [
      { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } },
      {
        tag: 'path',
        attrs: {
          d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
        },
      },
    ],
  },
  popOut: {
    shapes: [
      { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
      { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
      { tag: 'line', attrs: { x1: '10', y1: '14', x2: '21', y2: '3' } },
    ],
  },
  grip: {
    filled: true,
    shapes: [
      { tag: 'circle', attrs: { cx: '9', cy: '6', r: '1.5' } },
      { tag: 'circle', attrs: { cx: '15', cy: '6', r: '1.5' } },
      { tag: 'circle', attrs: { cx: '9', cy: '12', r: '1.5' } },
      { tag: 'circle', attrs: { cx: '15', cy: '12', r: '1.5' } },
      { tag: 'circle', attrs: { cx: '9', cy: '18', r: '1.5' } },
      { tag: 'circle', attrs: { cx: '15', cy: '18', r: '1.5' } },
    ],
  },
  edit: {
    shapes: [
      { tag: 'path', attrs: { d: 'M12 20h9' } },
      { tag: 'path', attrs: { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' } },
    ],
  },
  trash: {
    shapes: [
      { tag: 'polyline', attrs: { points: '3 6 5 6 21 6' } },
      { tag: 'path', attrs: { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' } },
      { tag: 'path', attrs: { d: 'M10 11v6' } },
      { tag: 'path', attrs: { d: 'M14 11v6' } },
      { tag: 'path', attrs: { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' } },
    ],
  },
};

function buildSvg(def: IconDef): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  if (def.filled) {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', def.strokeWidth ?? '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }

  for (const shape of def.shapes) {
    const el = document.createElementNS(SVG_NS, shape.tag);
    for (const [k, v] of Object.entries(shape.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

export function createDeviceIcon(type: DeviceType): SVGSVGElement {
  return buildSvg(DEVICE_ICONS[type] ?? DEVICE_ICONS.desktop);
}

export function createUiIcon(name: UiIconName): SVGSVGElement {
  return buildSvg(UI_ICON_DEFS[name]);
}

export function setIconContent(el: HTMLElement, svg: SVGSVGElement): void {
  el.replaceChildren(svg);
}
