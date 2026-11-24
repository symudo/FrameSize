import { describe, expect, it } from 'vitest';
import {
  computeFrameOverhead,
  computeTargetWindowSize,
  computeWindowPosition,
  normalizeShortcutFromEvent,
} from '../src/shared/geometry';

describe('geometry', () => {
  it('computes frame overhead accurately at 100% and zoomed levels', () => {
    expect(computeFrameOverhead(1296, 808, 1280, 720, 1)).toEqual({ dx: 16, dy: 88 });
    // 页面 125% 缩放时，innerWidth=1024 -> 实际视口 DIP 宽度=1280
    expect(computeFrameOverhead(1296, 808, 1024, 576, 1.25)).toEqual({ dx: 16, dy: 88 });
    // 负数异常值钳制为 0
    expect(computeFrameOverhead(800, 600, 900, 700, 1)).toEqual({ dx: 0, dy: 0 });
  });

  it('computes target window size for viewport vs window targets and auto sides', () => {
    const cur = { width: 1200, height: 800 };
    const overhead = { dx: 16, dy: 88 };

    expect(computeTargetWindowSize(1024, 768, 'viewport', cur, overhead)).toEqual({
      width: 1040,
      height: 856,
    });
    expect(computeTargetWindowSize(1024, 768, 'window', cur, overhead)).toEqual({
      width: 1024,
      height: 768,
    });
    // 单边留空保持当前值
    expect(computeTargetWindowSize(390, null, 'viewport', cur, overhead)).toEqual({
      width: 406,
      height: 800,
    });
    // 低于最小值 200 时自动钳制
    expect(computeTargetWindowSize(100, 120, 'window', cur, overhead)).toEqual({
      width: 200,
      height: 200,
    });
    // 页面 125% 缩放时，要让 CSS Viewport 为 800×600，窗口逻辑尺寸需按 zoom 换算
    expect(computeTargetWindowSize(800, 600, 'viewport', cur, overhead, 1.25)).toEqual({
      width: 1016,
      height: 838,
    });
    // Window 模式不受页面 zoom 影响
    expect(computeTargetWindowSize(800, 600, 'window', cur, overhead, 1.25)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('computes window alignment including multi-monitor negative offsets', () => {
    const leftMonitor = { availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1040 };

    expect(computeWindowPosition('keep', 1000, 700, leftMonitor)).toBeNull();
    expect(computeWindowPosition('center', 1000, 700, leftMonitor)).toEqual({
      left: -1460,
      top: 170,
    });
    expect(computeWindowPosition('top-right', 1000, 700, leftMonitor)).toEqual({
      left: -1000,
      top: 0,
    });
    expect(computeWindowPosition('bottom-left', 1000, 700, leftMonitor)).toEqual({
      left: -1920,
      top: 340,
    });
    expect(computeWindowPosition('custom', 1000, 700, leftMonitor, { left: 120, top: 80 })).toEqual({
      left: 120,
      top: 80,
    });
  });

  it('normalizes keyboard shortcuts safely and ignores bare typing keys', () => {
    expect(
      normalizeShortcutFromEvent({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: 'a',
        code: 'KeyA',
      })
    ).toBeNull();

    expect(
      normalizeShortcutFromEvent({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        key: 'A',
        code: 'KeyA',
      })
    ).toBeNull();

    expect(
      normalizeShortcutFromEvent({
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        shiftKey: false,
        key: '¡', // macOS Option+1 特殊字符
        code: 'Digit1',
      })
    ).toBe('Alt+1');

    expect(
      normalizeShortcutFromEvent({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        key: 'K',
        code: 'KeyK',
      })
    ).toBe('Ctrl+Shift+K');
  });
});
