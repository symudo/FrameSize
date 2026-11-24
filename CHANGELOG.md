# Changelog

All notable changes to **FrameSize** are documented in this file.

## [1.2.0] - 2026-11-24

### Added
- **屏幕可用逻辑分辨率与系统缩放显示**：Popup 顶部实时状态卡新增当前显示器的逻辑可用工作区尺寸与系统 DPI 缩放倍率（如 `屏幕可用 1707 × 1020 · 缩放 150%`），直观说明高分屏缩放下的逻辑窗口上限。
- **超屏自动缩放模拟大屏视口（Auto-Zoom Fit）**：当目标 `Viewport` 超出当前屏幕逻辑工作区（例如在 150% DPI 的 2560×1600 屏幕上测试 `1920 × 1080`）时，自动降低当前标签页缩放倍率以在有限屏幕内完整 1:1 呈现目标 CSS 断点；切换回普通尺寸或撤销（Undo）时自动恢复原始缩放倍率。设置页支持一键开关。
- **自动化 Release 更新日志**：GitHub Release 流水线自动提取 `CHANGELOG.md` 对应版本条目作为发布说明。

### Changed
- 默认预设中的 `Desktop Full HD (1920 × 1080)` 改为 `Viewport` 模式，搭配超屏自动缩放即可在任意高分缩放屏上直接完整预览 `1920 × 1080` 页面布局。
- 撤销（Undo）快照新增标签页缩放倍率记录，撤销时同步还原窗口尺寸、位置与页面缩放。

### Fixed
- 修复网页处于非 100% 缩放时，回传的系统缩放倍率（DPR）被页面 Zoom 污染的问题。
- 修复从超屏 `Viewport` 切换到 `Window` 模式预设时未自动恢复原页面 Zoom 的边界问题。
- 修复自定义尺寸表单提交触发超屏自动缩放时未提示实际缩放百分比的问题。
- 新增已关闭标签页与窗口的会话缓存自动清理，避免长期运行残留。

## [1.1.0] - 2026-11-24

### Added
- **独立 DevTools 窗口助手（Windows Native Helper）**：
  - 新增轻量无常驻本地伴侣 `framesize-helper.exe`（纯 Go Win32 实现，通过 Chrome / Edge / Firefox 官方 Native Messaging 通信）。
  - **系统级始终置顶（`Alt+Shift+P`）**：通过 `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)` 置顶独立 F12 窗口，操作网页绝不抢焦点。
  - **真·卷帘折叠（`Alt+Shift+F`）**：通过 `SetWindowRgn` 仅保留顶部标题栏可见（下方点击直接穿透到网页，零面板重排）；未安装伴侣时自动平滑降级为“最小化收起 ↔ 唤出”。
  - **防遮挡智能分屏**：支持主浏览器窗口与独立 DevTools 左右/上下紧贴排版，互不覆盖。
  - Options 新增「DevTools 助手」面板，支持伴侣状态检测、卷帘高度与分屏比例配置，以及带扩展 ID 的一键注册命令复制。
- 提供免管理员权限的 `install.ps1` / `uninstall.ps1` 注册脚本，支持 Chrome、Edge 与 Firefox 共存。

### Fixed
- 修复独立 DevTools 处于最大化态执行卷帘折叠时的 DWM 边框裁切偏移。
- 修复 `SetWindowRgn` 失败路径的 GDI 句柄释放问题。
- 修复 Windows PowerShell 5.1 下脚本编码兼容及多次注册覆盖已有 Chromium Origin 的问题。

## [1.0.0] - 2026-11-24

### Added
- 首个正式版本发布，全面兼容 **Chrome**、**Edge** 与 **Firefox**（Manifest V3）。
- 支持 `Viewport` 与 `Window` 双模式精准调整（含页面缩放倍率与边框开销自动补偿、单次微调校正）。
- 支持自定义预设 CRUD、拖拽排序、窗口对齐（居中/四角/自定义坐标）、横竖屏旋转、撤销历史、最大化、捕获当前尺寸与独立无标签栏窗口打开（Pop-out）。
- 内置基于 Shadow DOM 样式隔离的实时毛玻璃 Resize Tooltip，支持位置、显示内容与隐藏时长配置。
- 支持全局快捷键与页面内自定义快捷键、浏览器云同步（`storage.sync`）与 JSON 导入/导出（覆盖/合并，兼容常见旧预设结构）。
- 支持浅色/深色自动主题与中/英文双语界面，全项目零 `innerHTML`。
