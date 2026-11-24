# FrameSize

现代简约、零追踪的跨浏览器窗口与视口尺寸调节插件（兼容 **Chrome**、**Edge** 与 **Firefox**）。

## 核心功能
- **精准尺寸调节**：同时支持 `Viewport`（网页可视区，含高缩放与滚动条自动微调补偿）与 `Window`（整个浏览器外框）模式。
- **自定义预设与拖拽排序**：内置主流 Mobile / Tablet / Laptop / Desktop 断点，支持自由增删改、单边留空、窗口对齐（居中/四角/自定义坐标）与拖拽排序。
- **快捷操作**：一键横竖屏旋转、撤销恢复上一尺寸、最大化、捕获当前尺寸、独立无标签栏窗口打开（Pop-out）。
- **实时悬浮提示（Resize Tooltip）**：基于 Shadow DOM 样式完全隔离，手动拖拽或插件调尺寸时在角落显示实时宽高，支持位置、时长与显示模式配置。
- **双轨快捷键**：支持浏览器全局快捷键（旋转、撤销、前 4 个预设）以及任意预设的页面内自定义快捷键。
- **云同步与备份**：支持 `storage.sync` 跨设备同步，支持 JSON 一键导入/导出（覆盖或合并）。

## 开发与构建

```bash
npm install
npm run typecheck
npm test
npm run package
```

构建完成后会生成：
- `dist/chromium/` 与 `release/framesize-chromium-v*.zip` — 适用于 **Chrome** 与 **Microsoft Edge**
- `dist/firefox/` 与 `release/framesize-firefox-v*.zip` — 适用于 **Firefox**（含 `browser_specific_settings.gecko` 与 `background.scripts`）

## 云端构建（GitHub Actions）
- **CI（`.github/workflows/ci.yml`）**：每次推送到 `main` 分支或提交 PR 时自动执行类型检查、单元测试并上传双端 `.zip` 产物。
- **自动发布（`.github/workflows/release.yml`）**：推送 `v*` 标签（如 `v1.0.0`）或在 Actions 页面手动触发时，自动生成 GitHub Release 并附带 Chromium 与 Firefox 安装包。

## 本地加载方式
- **Chrome**：打开 `chrome://extensions/` → 开启「开发者模式」→ 点击「加载已解压的扩展程序」→ 选择 `dist/chromium`。
- **Edge**：打开 `edge://extensions/` → 开启「开发人员模式」→ 点击「加载解压缩的扩展」→ 选择 `dist/chromium`。
- **Firefox**：打开 `about:debugging#/runtime/this-firefox` → 点击「临时载入附加组件」→ 选择 `dist/firefox/manifest.json`。
