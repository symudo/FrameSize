import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve('public/icons');
const SIZES = [16, 32, 48, 128];

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Sample normalized icon space [-1, 1] x [-1, 1]
 * Modern squircle badge (indigo -> cyan-blue) with crisp white window frame + diagonal resize glyph.
 */
function sampleIcon(nx, ny, pixelScale) {
  const aa = pixelScale * 1.1;

  // Outer rounded square container
  const dOuter = sdRoundedBox(nx, ny, 0.88, 0.88, 0.34);
  const bgAlpha = clamp01(0.5 - dOuter / aa);
  if (bgAlpha <= 0) return [0, 0, 0, 0];

  // Smooth diagonal gradient (#4F46E5 -> #2563EB -> #0EA5E9)
  const t = clamp01((nx + ny + 1.6) / 3.2);
  let r, g, b;
  if (t < 0.5) {
    const u = t * 2;
    r = mix(79, 37, u);
    g = mix(70, 99, u);
    b = mix(229, 235, u);
  } else {
    const u = (t - 0.5) * 2;
    r = mix(37, 14, u);
    g = mix(99, 165, u);
    b = mix(235, 233, u);
  }

  // Subtle top highlight sheen
  const sheen = clamp01((-ny - 0.1) * 0.22);
  r = mix(r, 255, sheen);
  g = mix(g, 255, sheen);
  b = mix(b, 255, sheen);

  // Subtle inner frame (translucent white stroke representing browser window)
  const dFrame = Math.abs(sdRoundedBox(nx, ny, 0.56, 0.48, 0.13)) - 0.055;
  const frameAlpha = clamp01(0.5 - dFrame / aa) * 0.32;

  // Crisp foreground: two opposing resize corner brackets + diagonal shaft
  const stroke = 0.072;
  const dTopRightH = sdSegment(nx, ny, 0.16, -0.34, 0.42, -0.34) - stroke;
  const dTopRightV = sdSegment(nx, ny, 0.42, -0.34, 0.42, -0.08) - stroke;
  const dBotLeftH = sdSegment(nx, ny, -0.42, 0.34, -0.16, 0.34) - stroke;
  const dBotLeftV = sdSegment(nx, ny, -0.42, 0.08, -0.42, 0.34) - stroke;
  const dDiag = sdSegment(nx, ny, -0.36, 0.28, 0.36, -0.28) - stroke * 0.82;

  const dGlyph = Math.min(dTopRightH, dTopRightV, dBotLeftH, dBotLeftV, dDiag);
  const glyphAlpha = clamp01(0.5 - dGlyph / aa);

  // Composite frame then glyph over gradient
  const fgA = Math.max(frameAlpha, glyphAlpha);
  r = mix(r, 255, fgA);
  g = mix(g, 255, fgA);
  b = mix(b, 255, fgA);

  return [r, g, b, bgAlpha * 255];
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // 4x4 super-sampling anti-aliasing
  const pixelScale = 2 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = ((x + (sx + 0.5) / ss) / size) * 2 - 1;
          const ny = ((y + (sy + 0.5) / ss) / size) * 2 - 1;
          const [r, g, b, a] = sampleIcon(nx, ny, pixelScale);
          sr += r * (a / 255);
          sg += g * (a / 255);
          sb += b * (a / 255);
          sa += a;
        }
      }
      const samples = ss * ss;
      const a = sa / samples;
      const idx = (y * size + x) * 4;
      if (a > 0.001) {
        const premul = a / 255;
        rgba[idx] = Math.round(Math.min(255, sr / samples / premul));
        rgba[idx + 1] = Math.round(Math.min(255, sg / samples / premul));
        rgba[idx + 2] = Math.round(Math.min(255, sb / samples / premul));
        rgba[idx + 3] = Math.round(Math.min(255, a));
      }
    }
  }
  return encodePNG(size, size, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = renderIcon(size);
  fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), png);
}
console.log(`Generated icons: ${SIZES.map((s) => `icon-${s}.png`).join(', ')}`);
