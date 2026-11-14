import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EllipsisTextComponent } from './ellipsis-text';

function setup(text = 'Short') {
  const fixture = TestBed.createComponent(EllipsisTextComponent);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const content = host.querySelector('.clamped') as HTMLElement;
  let height = 40,
    scroll = 40,
    width = 180;
  Object.defineProperties(content, {
    clientHeight: { get: () => height, configurable: true },
    scrollHeight: { get: () => scroll, configurable: true },
    clientWidth: { get: () => width, configurable: true },
    scrollWidth: { get: () => width, configurable: true },
  });
  const tooltip = host.querySelector('[role=tooltip]') as HTMLElement;
  const show = vi.fn(),
    hide = vi.fn();
  Object.defineProperties(tooltip, { showPopover: { value: show }, hidePopover: { value: hide } });
  fixture.componentInstance.measure();
  return {
    fixture,
    host,
    content,
    tooltip,
    show,
    hide,
    resize: (h: number, s: number, w = 180) => {
      height = h;
      scroll = s;
      width = w;
      fixture.componentInstance.measure();
      fixture.detectChanges();
    },
  };
}
describe('Reusable ellipsis text', () => {
  it('reserves two CSS lines and provides no tooltip or extra tab stop when text fits', () => {
    const { fixture, content, host, show } = setup();
    expect(content.textContent?.trim()).toBe('Short');
    expect(content.style.blockSize).toBe('2lh');
    fixture.componentInstance.show();
    expect(show).not.toHaveBeenCalled();
    expect(host.getAttribute('tabindex')).toBeNull();
  });
  for (const text of [
    'A very long English station title with details and additional geographical coverage',
    'ஆகாசவாணி எஃப்.எம். ரெயின்போ சென்னை தமிழ்நாடு நாகர்கோவில்',
    'आकाशवाणी संस्कृतप्रसारणकेन्द्रम् तिरुवनन्तपुरम्',
    'தமிழ் · English · संस्कृतम् · മലയാളം · हिंदी',
    'Nagercoil · கன்னியாகுமரி · Tamil Nadu · India',
  ])
    it('preserves complete Unicode text and exposes it only on genuine overflow: ' + text, () => {
      const { fixture, content, tooltip, resize, show, hide, host } = setup(text);
      resize(40, 80);
      expect(fixture.componentInstance.overflowing()).toBe(true);
      expect(host.getAttribute('tabindex')).toBe('0');
      expect(content.textContent?.trim()).toBe(text);
      fixture.componentInstance.show();
      fixture.detectChanges();
      expect(show).toHaveBeenCalledOnce();
      expect(tooltip.textContent?.trim()).toBe(text);
      expect(host.getAttribute('aria-describedby')).toBe(tooltip.id);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(hide).toHaveBeenCalledOnce();
      expect(host.getAttribute('aria-describedby')).toBeNull();
    });
  it('rechecks changed locale/text, configurable lines and resize; closes stale tooltips', () => {
    const { fixture, resize, content, hide } = setup('English');
    resize(40, 90);
    fixture.componentInstance.show();
    fixture.componentRef.setInput('text', 'தமிழ்');
    fixture.componentRef.setInput('lines', 3);
    fixture.detectChanges();
    expect(content.textContent?.trim()).toBe('தமிழ்');
    expect(content.style.blockSize).toBe('3lh');
    expect(hide).toHaveBeenCalled();
    resize(60, 60);
    expect(fixture.componentInstance.overflowing()).toBe(false);
    resize(60, 80);
    expect(fixture.componentInstance.overflowing()).toBe(true);
    resize(60, 80, 0);
    expect(fixture.componentInstance.overflowing()).toBe(false);
  });
  it('shows on keyboard focus and touch, dismisses on blur and outside pointer', () => {
    const { fixture, host, resize, show } = setup();
    resize(40, 80);
    host.dispatchEvent(new FocusEvent('focusin'));
    expect(show).toHaveBeenCalledOnce();
    host.dispatchEvent(new FocusEvent('focusout'));
    expect(fixture.componentInstance.opened()).toBe(false);
    const touch = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    host.dispatchEvent(touch);
    expect(fixture.componentInstance.opened()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(fixture.componentInstance.opened()).toBe(false);
  });
  it('normalizes invalid line limits', () => {
    const { fixture } = setup();
    for (const [value, expected] of [
      [0, 1],
      [-1, 1],
      [2.9, 2],
      [NaN, 2],
    ]) {
      fixture.componentRef.setInput('lines', value);
      fixture.detectChanges();
      expect(fixture.componentInstance.lineCount()).toBe(expected);
    }
  });
  it('uses the existing title link as its only keyboard stop and preserves description ownership', () => {
    @Component({
      imports: [EllipsisTextComponent],
      template:
        '<a href="/radios/air-nagercoil" aria-describedby="existing"><app-ellipsis-text text="Long title"/></a>',
    })
    class LinkedTitleComponent {}
    const fixture = TestBed.createComponent(LinkedTitleComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement,
      link = host.querySelector('a')!;
    const child = fixture.debugElement.children[0].children[0].componentInstance as EllipsisTextComponent;
    child.overflowing.set(true);
    fixture.detectChanges();
    expect(host.querySelector('app-ellipsis-text')?.hasAttribute('tabindex')).toBe(false);
    expect(link.getAttribute('href')).toBe('/radios/air-nagercoil');
    const tooltip = host.querySelector('[role=tooltip]')!;
    Object.defineProperties(tooltip, { showPopover: { value: vi.fn() }, hidePopover: { value: vi.fn() } });
    link.dispatchEvent(new FocusEvent('focus'));
    expect(child.opened()).toBe(true);
    expect(link.getAttribute('aria-describedby')).toContain(child.tooltipId);
    link.dispatchEvent(new FocusEvent('blur'));
    expect(link.getAttribute('aria-describedby')).toBe('existing');
    vi.useFakeTimers();
    try {
      const touch = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(touch, 'pointerType', { value: 'touch' });
      host.querySelector('app-ellipsis-text')!.dispatchEvent(touch);
      expect(child.opened()).toBe(false);
      vi.advanceTimersByTime(500);
      expect(child.opened()).toBe(true);
      const activation = vi.fn();
      link.addEventListener('click', activation);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(activation).not.toHaveBeenCalled();
      child.hide();
    } finally {
      vi.useRealTimers();
    }
  });
  it('rechecks observer/font/viewport changes and disconnects listeners on destroy', () => {
    let notify = () => undefined;
    const disconnect = vi.fn(),
      observe = vi.fn();
    class Observer {
      constructor(callback: () => undefined) {
        notify = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', Observer);
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const remove = vi.spyOn(window, 'removeEventListener');
    const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
    const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const { fixture } = setup();
      expect(observe).toHaveBeenCalled();
      const before = frame.mock.calls.length;
      notify();
      window.dispatchEvent(new Event('resize'));
      fonts.dispatchEvent(new Event('loadingdone'));
      expect(frame.mock.calls.length).toBeGreaterThan(before);
      fixture.destroy();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    } finally {
      frame.mockRestore();
      remove.mockRestore();
      vi.unstubAllGlobals();
      if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
});
