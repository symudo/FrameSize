import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const DIST_CHROMIUM = path.join(ROOT, 'dist', 'chromium');
const DIST_FIREFOX = path.join(ROOT, 'dist', 'firefox');
const isWatch = process.argv.includes('--watch');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyStaticAssets(targetDir) {
  copyDir(path.join(ROOT, 'public'), targetDir);

  for (const page of ['popup', 'options']) {
    const pageOut = path.join(targetDir, page);
    fs.mkdirSync(pageOut, { recursive: true });
    for (const file of ['index.html', 'style.css']) {
      const src = path.join(ROOT, 'src', page, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(pageOut, file));
      }
    }
  }
}

function writeManifests() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.base.json'), 'utf8'));
  base.version = pkg.version;

  const chromiumManifest = {
    ...base,
    background: {
      service_worker: 'background.js',
    },
  };

  const firefoxManifest = {
    ...base,
    background: {
      scripts: ['background.js'],
    },
    browser_specific_settings: {
      gecko: {
        id: 'framesize@framesize.dev',
        strict_min_version: '109.0',
      },
    },
  };

  fs.mkdirSync(DIST_CHROMIUM, { recursive: true });
  fs.mkdirSync(DIST_FIREFOX, { recursive: true });

  fs.writeFileSync(
    path.join(DIST_CHROMIUM, 'manifest.json'),
    JSON.stringify(chromiumManifest, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(DIST_FIREFOX, 'manifest.json'),
    JSON.stringify(firefoxManifest, null, 2) + '\n',
    'utf8'
  );
}

const entryPoints = {
  background: 'src/background/index.ts',
  content: 'src/content/index.ts',
  'popup/index': 'src/popup/index.ts',
  'options/index': 'src/options/index.ts',
};

function syncOutputs() {
  copyStaticAssets(DIST_CHROMIUM);
  copyStaticAssets(DIST_FIREFOX);
  writeManifests();
}

async function runBuild() {
  for (const dir of [DIST_CHROMIUM, DIST_FIREFOX]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  const commonOptions = {
    entryPoints,
    bundle: true,
    format: 'iife',
    target: ['chrome114', 'edge114', 'firefox109'],
    sourcemap: false,
    minify: !isWatch,
    logLevel: 'info',
  };

  if (isWatch) {
    const ctx1 = await esbuild.context({ ...commonOptions, outdir: DIST_CHROMIUM });
    const ctx2 = await esbuild.context({ ...commonOptions, outdir: DIST_FIREFOX });
    syncOutputs();
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build({ ...commonOptions, outdir: DIST_CHROMIUM }),
      esbuild.build({ ...commonOptions, outdir: DIST_FIREFOX }),
    ]);
    syncOutputs();
    console.log('Build complete: dist/chromium & dist/firefox');
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
