import { ext } from '../shared/ext';
import { createTranslator } from '../shared/i18n';
import { createUiIcon, setIconContent } from '../shared/icons';
import type { DevToolsState, RuntimeMessage, ScreenWorkArea, Settings } from '../shared/types';

const POS_STORAGE_KEY = 'framesize_dt_bar_pos';

interface BarPos {
  right: number;
  bottom: number;
}

export class FloatingDevToolsBar {
  private host: HTMLDivElement | null = null;
  private barEl: HTMLDivElement | null = null;
  private expandedGroup: HTMLDivElement | null = null;
  private expandBtn: HTMLButtonElement | null = null;
  private expandText: HTMLSpanElement | null = null;
  private pinBtn: HTMLButtonElement | null = null;
  private collapseBtn: HTMLButtonElement | null = null;
  private opacityBtn: HTMLButtonElement | null = null;
  private splitBtn: HTMLButtonElement | null = null;
  private dismissBtn: HTMLButtonElement | null = null;
  private hintEl: HTMLDivElement | null = null;
  private hintTimer: number | null = null;

  private state: DevToolsState | null = null;
  private settings: Settings;
  private getScreen: () => ScreenWorkArea;
  private dismissedExpanded = false;
  // 默认位于右下角偏上，避开 bottom: 16px 的 Resize Tooltip 浮层
  private pos: BarPos = { right: 18, bottom: 58 };
  private dragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginRight = 18;
  private dragOriginBottom = 58;

  constructor(settings: Settings, getScreen: () => ScreenWorkArea) {
    this.settings = settings;
    this.getScreen = getScreen;
    void this.loadSavedPos();
  }

  public updateSettings(next: Settings): void {
    this.settings = next;
    this.render();
  }

  public updateState(next: DevToolsState): void {
    // 一旦收起为展开按钮，解除临时隐藏标记，确保用户永远能一键展开 DevTools
    if (next.collapsed) {
      this.dismissedExpanded = false;
    }
    this.state = next;
    this.render();
  }

  public async syncFromBackground(): Promise<void> {
    if (!this.settings.devtoolsFloatingBar) {
      this.hide();
      return;
    }
    try {
      const res = (await ext.runtime.sendMessage({
        type: 'GET_DEVTOOLS_STATE',
      } satisfies RuntimeMessage)) as { ok: boolean; data?: DevToolsState };
      if (res?.ok && res.data) {
        this.updateState(res.data);
      }
    } catch {
      // ignore if extension reloaded
    }
  }

  private async loadSavedPos(): Promise<void> {
    try {
      const store = await ext.storage.local.get(POS_STORAGE_KEY);
      const saved = store[POS_STORAGE_KEY] as BarPos | undefined;
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) {
        this.pos = saved;
        this.applyPosition();
      }
    } catch {
      // ignore
    }
  }

  private savePos(): void {
    void ext.storage.local.set({ [POS_STORAGE_KEY]: this.pos }).catch(() => {});
  }

  private clampPos(right: number, bottom: number): BarPos {
    const barW = Math.max(120, this.barEl?.offsetWidth || 168);
    const barH = Math.max(36, this.barEl?.offsetHeight || 40);
    const maxR = Math.max(8, window.innerWidth - barW - 8);
    const maxB = Math.max(8, window.innerHeight - barH - 8);
    return {
      right: Math.max(8, Math.min(maxR, Math.round(right))),
      bottom: Math.max(8, Math.min(maxB, Math.round(bottom))),
    };
  }

  private applyPosition(): void {
    if (!this.barEl) return;
    const clamped = this.clampPos(this.pos.right, this.pos.bottom);
    this.barEl.style.right = `${clamped.right}px`;
    this.barEl.style.bottom = `${clamped.bottom}px`;
  }

  private ensureDom(): void {
    if (this.host && this.barEl && document.documentElement.contains(this.host)) {
      return;
    }

    this.host = document.createElement('div');
    this.host.id = 'framesize-devtools-bar-host';
    this.host.style.all = 'initial';
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483646';

    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .fs-dt-bar {
        position: fixed;
        display: none;
        align-items: center;
        gap: 3px;
        padding: 4px 5px;
        border-radius: 999px;
        background: rgba(15, 17, 23, 0.84);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32), 0 1px 3px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, "PingFang SC", sans-serif;
        color: #f8fafc;
        opacity: 0.78;
        transition: opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;
        user-select: none;
        touch-action: none;
      }
      .fs-dt-bar.visible {
        display: flex;
      }
      .fs-dt-bar:hover,
      .fs-dt-bar.collapsed {
        opacity: 1;
      }
      .fs-dt-bar.collapsed {
        padding: 3px;
        background: rgba(79, 70, 229, 0.92);
        border-color: rgba(165, 180, 252, 0.4);
        box-shadow: 0 8px 24px rgba(79, 70, 229, 0.42);
      }
      .fs-dt-bar.dragging {
        transition: none;
        cursor: grabbing;
      }
      .fs-grip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 26px;
        color: rgba(148, 163, 184, 0.7);
        cursor: grab;
      }
      .fs-grip svg {
        width: 12px;
        height: 12px;
      }
      .fs-expanded {
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .fs-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        padding: 0;
        transition: background 130ms ease, color 130ms ease, transform 100ms ease;
      }
      .fs-btn svg {
        width: 14px;
        height: 14px;
      }
      .fs-btn:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
      }
      .fs-btn:active {
        transform: scale(0.92);
      }
      .fs-btn.active {
        background: #4f46e5;
        color: #ffffff;
      }
      .fs-btn.dismiss {
        width: 22px;
        height: 22px;
        color: rgba(148, 163, 184, 0.75);
      }
      .fs-btn.dismiss svg {
        width: 12px;
        height: 12px;
      }
      .fs-expand-pill {
        display: none;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px 0 10px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        cursor: pointer;
        white-space: nowrap;
      }
      .fs-expand-pill svg {
        width: 14px;
        height: 14px;
      }
      .fs-dt-bar.collapsed .fs-expanded {
        display: none;
      }
      .fs-dt-bar.collapsed .fs-expand-pill {
        display: inline-flex;
      }
      .fs-inline-hint {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        padding: 5px 10px;
        border-radius: 8px;
        background: rgba(15, 17, 23, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #f8fafc;
        font-size: 11px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 140ms ease, transform 140ms ease;
      }
      .fs-inline-hint.show {
        opacity: 1;
        transform: translateY(0);
      }
    `;

    this.barEl = document.createElement('div');
    this.barEl.className = 'fs-dt-bar';

    // Expanded toolbar
    this.expandedGroup = document.createElement('div');
    this.expandedGroup.className = 'fs-expanded';

    const grip = document.createElement('span');
    grip.className = 'fs-grip';
    setIconContent(grip, createUiIcon('grip'));

    this.pinBtn = document.createElement('button');
    this.pinBtn.type = 'button';
    this.pinBtn.className = 'fs-btn';
    setIconContent(this.pinBtn, createUiIcon('pin'));
    this.pinBtn.addEventListener('click', () => void this.runAction({ type: 'TOGGLE_DEVTOOLS_PIN' }));

    this.collapseBtn = document.createElement('button');
    this.collapseBtn.type = 'button';
    this.collapseBtn.className = 'fs-btn';
    setIconContent(this.collapseBtn, createUiIcon('minimize'));
    this.collapseBtn.addEventListener('click', () =>
      void this.runAction({ type: 'TOGGLE_DEVTOOLS_COLLAPSE' })
    );

    this.opacityBtn = document.createElement('button');
    this.opacityBtn.type = 'button';
    this.opacityBtn.className = 'fs-btn';
    setIconContent(this.opacityBtn, createUiIcon('opacity'));
    this.opacityBtn.addEventListener('click', () =>
      void this.runAction({ type: 'TOGGLE_DEVTOOLS_OPACITY' })
    );

    this.splitBtn = document.createElement('button');
    this.splitBtn.type = 'button';
    this.splitBtn.className = 'fs-btn';
    setIconContent(this.splitBtn, createUiIcon('splitRight'));
    this.splitBtn.addEventListener('click', () =>
      void this.runAction({
        type: 'SPLIT_DEVTOOLS',
        direction: 'right',
        screen: this.getScreen(),
      })
    );

    this.dismissBtn = document.createElement('button');
    this.dismissBtn.type = 'button';
    this.dismissBtn.className = 'fs-btn dismiss';
    setIconContent(this.dismissBtn, createUiIcon('close'));
    this.dismissBtn.addEventListener('click', () => {
      this.dismissedExpanded = true;
      this.render();
    });

    this.expandedGroup.append(
      grip,
      this.pinBtn,
      this.collapseBtn,
      this.opacityBtn,
      this.splitBtn,
      this.dismissBtn
    );

    // Collapsed single expand button
    this.expandBtn = document.createElement('button');
    this.expandBtn.type = 'button';
    this.expandBtn.className = 'fs-expand-pill';
    this.expandText = document.createElement('span');
    this.expandBtn.append(createUiIcon('terminal'), this.expandText);
    this.expandBtn.addEventListener('click', () => {
      if (this.dragMoved) return;
      void this.runAction({ type: 'TOGGLE_DEVTOOLS_COLLAPSE' });
    });

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'fs-inline-hint';

    this.barEl.append(this.expandedGroup, this.expandBtn, this.hintEl);
    this.bindDrag(grip);
    this.bindDrag(this.expandBtn);

    shadow.append(style, this.barEl);
    document.documentElement.appendChild(this.host);
    this.applyPosition();

    window.addEventListener(
      'resize',
      () => {
        this.applyPosition();
      },
      { passive: true }
    );
  }

  private bindDrag(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (ev.button !== 0 || !this.barEl) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartX = ev.clientX;
      this.dragStartY = ev.clientY;
      this.dragOriginRight = this.pos.right;
      this.dragOriginBottom = this.pos.bottom;
      handle.setPointerCapture(ev.pointerId);
      this.barEl.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (ev: PointerEvent) => {
      if (!this.dragging) return;
      const dx = ev.clientX - this.dragStartX;
      const dy = ev.clientY - this.dragStartY;
      if (Math.hypot(dx, dy) > 5) {
        this.dragMoved = true;
      }
      if (!this.dragMoved) return;
      this.pos = this.clampPos(this.dragOriginRight - dx, this.dragOriginBottom - dy);
      this.applyPosition();
    });

    const finishDrag = (ev: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.barEl?.classList.remove('dragging');
      if (handle.hasPointerCapture(ev.pointerId)) {
        handle.releasePointerCapture(ev.pointerId);
      }
      if (this.dragMoved) {
        this.savePos();
        // 延迟一帧清除，避免松手立刻触发 click
        window.setTimeout(() => {
          this.dragMoved = false;
        }, 0);
      }
    };

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  private showInlineHint(text: string): void {
    if (!this.hintEl) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer);
    }
    this.hintTimer = window.setTimeout(() => {
      this.hintEl?.classList.remove('show');
      this.hintTimer = null;
    }, 2200);
  }

  private async runAction(msg: RuntimeMessage): Promise<void> {
    try {
      const res = (await ext.runtime.sendMessage(msg)) as {
        ok: boolean;
        data?: { state?: DevToolsState; needsHelper?: boolean };
      };
      if (res?.ok && res.data?.state) {
        this.updateState(res.data.state);
      }
      if (res?.ok && res.data?.needsHelper) {
        const t = createTranslator(this.settings.language);
        this.showInlineHint(t('devtoolsHelperNeeded'));
      }
    } catch {
      // ignore
    }
  }

  private hide(): void {
    this.barEl?.classList.remove('visible');
  }

  private render(): void {
    const st = this.state;
    if (!this.settings.devtoolsFloatingBar || !st || !st.hasDevTools) {
      this.hide();
      return;
    }
    if (!st.collapsed && this.dismissedExpanded) {
      this.hide();
      return;
    }

    this.ensureDom();
    if (!this.barEl) return;

    const t = createTranslator(this.settings.language);
    this.barEl.classList.add('visible');
    this.barEl.classList.toggle('collapsed', st.collapsed);

    if (this.pinBtn) {
      this.pinBtn.classList.toggle('active', st.pinned);
      this.pinBtn.title = t('devtoolsPinTitle');
    }
    if (this.collapseBtn) {
      this.collapseBtn.title = t('devtoolsCollapseTitle');
    }
    if (this.opacityBtn) {
      this.opacityBtn.classList.toggle('active', st.translucent);
      this.opacityBtn.title = st.translucent
        ? `${t('devtoolsOpacityTitle')} (${st.opacity}%)`
        : t('devtoolsOpacityTitle');
    }
    if (this.splitBtn) {
      this.splitBtn.title = t('devtoolsSplitRightTitle');
    }
    if (this.expandText) {
      this.expandText.textContent = t('devtoolsExpandPill');
    }
    if (this.expandBtn) {
      this.expandBtn.title = t('devtoolsCollapseTitle');
    }
  }
}
