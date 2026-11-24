import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS, DEFAULT_SETTINGS } from '../src/shared/defaults';
import { buildExportBundle, parseImportedConfig } from '../src/shared/storage';

describe('storage import/export', () => {
  it('round-trips standard FrameSize export bundle', () => {
    const bundle = buildExportBundle(DEFAULT_PRESETS, DEFAULT_SETTINGS);
    const parsed = parseImportedConfig(JSON.stringify(bundle));

    expect(parsed.presets).toHaveLength(DEFAULT_PRESETS.length);
    expect(parsed.presets[0].title).toBe(DEFAULT_PRESETS[0].title);
    expect(parsed.settings?.tooltipPosition).toBe('bottom-right');
  });

  it('supports legacy Window Resizer style preset arrays and deduplicates ids', () => {
    const legacy = JSON.stringify({
      resolutions: [
        { id: 'dup', name: 'iPhone', w: 375, h: 667, type: 'viewport', device: 'phone' },
        { id: 'dup', desc: 'Desktop', width: 1920, height: 1080, type: 'window', x: 10, y: 20 },
      ],
    });

    const parsed = parseImportedConfig(legacy);
    expect(parsed.presets).toHaveLength(2);
    expect(parsed.presets[0].icon).toBe('mobile');
    expect(parsed.presets[1].alignment).toBe('custom');
    expect(parsed.presets[1].left).toBe(10);
    expect(parsed.presets[0].id).not.toBe(parsed.presets[1].id);
  });

  it('rejects invalid JSON or empty payloads', () => {
    expect(() => parseImportedConfig('{bad json')).toThrow('INVALID_JSON');
    expect(() => parseImportedConfig(JSON.stringify({ presets: [] }))).toThrow('EMPTY_PRESETS');
  });
});
