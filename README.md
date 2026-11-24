# FrameSize

现代简约、零追踪的跨浏览器窗口与视口尺寸调节插件（兼容 **Chrome**、**Edge** 与 **Firefox**），内置 **独立 DevTools 窗口置顶、卷帘折叠与防遮挡分屏** 助手。

## 核心功能
- **精准尺寸调节**：同时支持 `Viewport`（网页可视区，含高缩放倍率补偿、超屏自动 Zoom 模拟大屏断点与滚动条微调）与 `Window`（整个浏览器外框）模式，Popup 实时展示屏幕逻辑可用区域与系统缩放比例。
- **CSS 响应式断点指示器**：Popup 与页面悬浮 Tooltip 实时显示当前命中的 **Tailwind CSS** 或 **Bootstrap 5** 断点徽标（可自由切换或关闭）。
- **自定义预设与拖拽排序**：内置主流 Mobile / Tablet / Laptop / Desktop 断点，支持自由增删改、单边留空、窗口对齐（居中/四角/自定义坐标）与拖拽排序。
- **快捷操作**：一键横竖屏旋转（`Alt+Shift+R`）、撤销恢复上一尺寸（`Alt+Shift+Z`）、最大化、捕获当前尺寸、独立无标签栏窗口打开（Pop-out）。
- **独立 DevTools 窗口助手**：
  - **真·始终置顶（`Alt+Shift+Y`）**：通过轻量 Windows Native Helper 调用 Win32 `HWND_TOPMOST`，置顶独立 F12 窗口且**点击网页不抢焦点**。
  - **收起为悬浮按钮 ↔ 点击秒展开（`Alt+Shift+F`）**：干净收起零残影，网页角落自动浮现可拖拽的 **`[ >_ 展开 DevTools ]`** 按钮，点击瞬间原位恢复并自动保持置顶。
  - **页面悬浮迷你控制栏**：打开独立 DevTools 时自动出现可拖拽的迷你按钮组（置顶 / 收起 / 半透明 / 分屏），无需背快捷键或点扩展图标（设置页可开关）。
  - **半透明透视模式**：一键将置顶 DevTools 切换为自定义透明度（默认 82%），边看控制台/网络请求边透视底层页面。
  - **一键防遮挡分屏 & 手机预设自动贴边联动**：支持左右/上下紧贴分屏；点击手机/平板预设时自动将预览窗靠左、独立 DevTools 紧贴右侧补满剩余屏幕。
- **实时悬浮提示（Resize Tooltip）**：基于 Shadow DOM 样式完全隔离，支持位置、时长与显示内容配置。
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
- `dist/firefox/` 与 `release/framesize-firefox-v*.zip` — 适用于 **Firefox**
- `dist/helper/` 与 `release/framesize-helper-windows-x64-v*.zip` — Windows 本地伴侣（含单文件 `framesize-helper.exe` 与免管理员权限注册脚本 `install.ps1` / `uninstall.ps1`）

## 本地加载与伴侣注册
1. **加载插件**：
   - **Chrome**：`chrome://extensions/` → 开启开发者模式 → 加载 `dist/chromium`
   - **Edge**：`edge://extensions/` → 开启开发人员模式 → 加载 `dist/chromium`
   - **Firefox**：`about:debugging#/runtime/this-firefox` → 临时载入 `dist/firefox/manifest.json`
2. **启用系统级 DevTools 置顶与卷帘折叠（Windows，可选）**：
   - 从 Release 下载并解压 `framesize-helper-windows-x64-v*.zip`（或使用本地 `dist/helper`）。
   - 打开 FrameSize 设置页 → **DevTools 助手** → 一键复制安装命令并在解压目录的 PowerShell 中执行即可（支持 Chrome / Edge / Firefox，无需管理员权限）。

## 云端构建（GitHub Actions）
- **CI（`.github/workflows/ci.yml`）**：每次推送 `main` 或 PR 自动执行 TypeScript 类型检查、Vitest 单测、Go 单测，并交叉编译打包三端 `.zip` 产物。
- **自动发布（`.github/workflows/release.yml`）**：推送 `v*` 标签或手动触发时自动生成 GitHub Release 并附带 Chromium、Firefox 与 Windows Native Helper 安装包。
