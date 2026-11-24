import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const RELEASE_DIR = path.join(ROOT, 'release');

// CRC32 table
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

function collectFiles(dir, baseDir = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, baseDir));
    } else {
      const rel = path.relative(baseDir, full).split(path.sep).join('/');
      results.push({ full, rel });
    }
  }
  return results;
}

function createZipFromDir(sourceDir, outFile) {
  const files = collectFiles(sourceDir);
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.full);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(file.rel, 'utf8');
    const crc = crc32(data);

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([...localChunks, ...centralChunks, eocd]));
}

fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
fs.mkdirSync(RELEASE_DIR, { recursive: true });

const targets = [
  { name: 'chromium', dir: path.join(ROOT, 'dist', 'chromium'), ext: 'zip' },
  { name: 'firefox', dir: path.join(ROOT, 'dist', 'firefox'), ext: 'zip' },
];

for (const target of targets) {
  if (!fs.existsSync(target.dir)) {
    throw new Error(`Missing build directory: ${target.dir}. Run "npm run build" first.`);
  }
  const outPath = path.join(RELEASE_DIR, `framesize-${target.name}-v${version}.${target.ext}`);
  createZipFromDir(target.dir, outPath);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Packaged ${path.basename(outPath)} (${sizeKb} KB)`);
}

// Build and package Windows Native Helper if Go toolchain is available
const helperSrcDir = path.join(ROOT, 'native-helper');
const helperDistDir = path.join(ROOT, 'dist', 'helper');
if (fs.existsSync(path.join(helperSrcDir, 'go.mod'))) {
  fs.rmSync(helperDistDir, { recursive: true, force: true });
  fs.mkdirSync(helperDistDir, { recursive: true });

  const outExe = path.join(helperDistDir, 'framesize-helper.exe');
  execFileSync('go', ['build', `-ldflags=-s -w -X main.HelperVersion=${version}`, '-o', outExe, '.'], {
    cwd: helperSrcDir,
    env: {
      ...process.env,
      GOOS: 'windows',
      GOARCH: 'amd64',
      CGO_ENABLED: '0',
    },
    stdio: 'inherit',
  });

  for (const script of ['install.ps1', 'uninstall.ps1']) {
    fs.copyFileSync(path.join(helperSrcDir, script), path.join(helperDistDir, script));
  }

  const helperZip = path.join(RELEASE_DIR, `framesize-helper-windows-x64-v${version}.zip`);
  createZipFromDir(helperDistDir, helperZip);
  const sizeKb = (fs.statSync(helperZip).size / 1024).toFixed(1);
  console.log(`Packaged ${path.basename(helperZip)} (${sizeKb} KB)`);
}
