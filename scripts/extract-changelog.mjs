import fs from 'node:fs';
import path from 'node:path';

const rawTag = process.argv[2] || '';
const version = rawTag.replace(/^v/i, '').trim();

if (!version) {
  console.error('Usage: node scripts/extract-changelog.mjs <tag-or-version>');
  process.exit(1);
}

const changelogPath = path.resolve('CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error('CHANGELOG.md not found');
  process.exit(1);
}

const content = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRegex = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, 'm');
const match = headingRegex.exec(content);

if (!match) {
  // 未找到对应条目时回退输出默认提示，避免阻断发版
  console.log(`Release v${version}`);
  process.exit(0);
}

const start = match.index + match[0].length;
const rest = content.slice(start);
const nextHeadingIdx = rest.search(/^## \[/m);
const section = (nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx)).trim();

console.log(section || `Release v${version}`);
