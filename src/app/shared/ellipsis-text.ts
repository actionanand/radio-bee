import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  untracked,
} from '@angular/core';

let nextTooltip = 0;
/** CSS clamps the original Unicode text. Native popovers escape card overflow clipping. */
@Component({
  selector: 'app-ellipsis-text',
  host: {
    '[attr.tabindex]': 'overflowing() && !linked() ? 0 : null',
    '[attr.aria-describedby]': 'opened() ? tooltipId : null',
    '(pointerenter)': 'show()',
    '(pointerleave)': 'leave($event)',
    '(pointerdown)': 'touch($event)',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(document:keydown.escape)': 'hide()',
    '(document:pointerdown)': 'outside($event)',
    '(window:scroll)': 'hide()',
  },
  template: `
    <span #content class="clamped" [style.-webkit-line-clamp]="lineCount()" [style.block-size]="lineCount() + 'lh'">{{
      text()
    }}</span>
    <span
      #tooltip
      class="tooltip"
      popover="manual"
      role="tooltip"
      [id]="tooltipId"
      (pointerenter)="cancelHide()"
      (pointerleave)="hide()"></span>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      line-height: inherit;
    }
    .clamped {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    :host:focus-visible {
      outline: 3px solid var(--accent-ink);
      outline-offset: 2px;
      border-radius: 3px;
    }
    .tooltip {
      position: fixed;
      inset: auto;
      margin: 0;
      border: 0;
      border-radius: 6px;
      padding: 10px 12px;
      max-inline-size: min(320px, calc(100vw - 24px));
      max-block-size: calc(100dvh - 24px);
      overflow: auto;
      background: var(--ink, #173a32);
      color: var(--paper, #faf9f5);
      font: 400 14px/1.5 sans-serif;
      overflow-wrap: anywhere;
      box-shadow: 0 4px 16px #0004;
    }
  `,
})
export class EllipsisTextComponent {
  readonly text = input.required<string>();
  readonly lines = input(2);
  readonly lineCount = computed(() => (Number.isFinite(this.lines()) ? Math.max(1, Math.floor(this.lines())) : 2));
  readonly overflowing = signal(false);
  readonly linked = signal(false);
  readonly opened = signal(false);
  readonly tooltipId = 'rb-ellipsis-' + ++nextTooltip;
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly win = this.document.defaultView;
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly tooltip = viewChild<ElementRef<HTMLElement>>('tooltip');
  private link: HTMLElement | null = null;
  private observer?: ResizeObserver;
  private fontStyles?: MutationObserver;
  private frame?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private hold?: ReturnType<typeof setTimeout>;
  private held = false;
  constructor() {
    const schedule = () => {
      if (this.frame !== undefined) this.win?.cancelAnimationFrame(this.frame);
      this.frame = this.win?.requestAnimationFrame(() => {
        this.frame = undefined;
        this.measure();
      });
    };
    const focus = () => this.show(),
      blur = () => this.hide();
    effect(() => {
      this.text();
      this.lineCount();
      untracked(() => {
        this.hide();
        schedule();
      });
    });
    afterNextRender(() => {
      this.link = this.host.closest('a,button');
      this.linked.set(!!this.link);
      this.link?.addEventListener('focus', focus);
      this.link?.addEventListener('blur', blur);
      this.link?.addEventListener('click', this.linkClick, true);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(schedule);
        this.observer.observe(this.content()!.nativeElement);
      }
      // An already-loaded font can also change through inherited theme/style classes.
      if (typeof MutationObserver !== 'undefined') {
        this.fontStyles = new MutationObserver(schedule);
        for (let node: HTMLElement | null = this.content()!.nativeElement; node; node = node.parentElement) {
          this.fontStyles.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
        }
      }
      this.win?.addEventListener('resize', schedule);
      this.document.addEventListener('scroll', blur, true);
      this.document.fonts?.addEventListener('loadingdone', schedule);
      void this.document.fonts?.ready.then(() => {
        if (!this.destroyed) schedule();
      });
      schedule();
    });
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.endTouch();
      this.destroyed = true;
      this.observer?.disconnect();
      this.fontStyles?.disconnect();
      if (this.frame !== undefined) this.win?.cancelAnimationFrame(this.frame);
      this.link?.removeEventListener('focus', focus);
      this.link?.removeEventListener('blur', blur);
      this.link?.removeEventListener('click', this.linkClick, true);
      this.win?.removeEventListener('resize', schedule);
      this.document.removeEventListener('scroll', blur, true);
      this.document.fonts?.removeEventListener('loadingdone', schedule);
    });
  }
  measure() {
    if (this.destroyed) return;
    const el = this.content()?.nativeElement;
    this.overflowing.set(
      !!el && el.clientWidth > 0 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1),
    );
    this.hide();
  }
  show() {
    this.cancelHide();
    const tip = this.tooltip()?.nativeElement;
    if (!this.overflowing() || !tip?.showPopover || this.opened()) return;
    if (this.link) {
      const ids = new Set((this.link.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      ids.add(this.tooltipId);
      this.link.setAttribute('aria-describedby', [...ids].join(' '));
    }
    tip.textContent = this.text();
    tip.showPopover();
    this.opened.set(true);
    const anchor = this.host.getBoundingClientRect(),
      rect = tip.getBoundingClientRect();
    const width = this.win?.innerWidth ?? 1024,
      height = this.win?.innerHeight ?? 768;
    tip.style.left = Math.max(12, Math.min(anchor.left, width - rect.width - 12)) + 'px';
    tip.style.top = Math.max(12, Math.min(anchor.bottom + 6, height - rect.height - 12)) + 'px';
  }
  hide() {
    this.cancelHide();
    this.endTouch();
    this.held = false;
    if (this.link) {
      const ids = (this.link.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(id => id && id !== this.tooltipId);
      if (ids.length) this.link.setAttribute('aria-describedby', ids.join(' '));
      else this.link.removeAttribute('aria-describedby');
    }
    if (this.opened()) this.tooltip()?.nativeElement.hidePopover?.();
    this.opened.set(false);
  }
  cancelHide() {
    clearTimeout(this.timer);
  }
  leave(event: PointerEvent) {
    if (event.pointerType !== 'touch') this.timer = setTimeout(() => this.hide(), 150);
  }
  touch(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !this.overflowing()) return;
    if (!this.link) this.show();
    else {
      this.held = false;
      this.hold = setTimeout(() => {
        this.held = true;
        this.show();
      }, 500);
    }
  }
  endTouch() {
    clearTimeout(this.hold);
  }
  private readonly linkClick = (event: MouseEvent) => {
    if (this.held) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.held = false;
    }
  };
  outside(event: Event) {
    if (!this.host.contains(event.target as Node)) this.hide();
  }
}
