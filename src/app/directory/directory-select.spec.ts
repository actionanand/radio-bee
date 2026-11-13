import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { IonSelect } from '@ionic/angular';
import { directoryText } from './directory.labels';
import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { DirectorySelectComponent } from './directory-select';

function setup(
  options = [
    { id: 'en', name: 'English' },
    { id: 'ta', name: 'தமிழ்' },
  ],
) {
  const locale = signal('en');
  TestBed.configureTestingModule({
    providers: [provideIonicAngular({ animated: false }), { provide: CatalogService, useValue: { locale } }],
  });
  const fixture = TestBed.createComponent(DirectorySelectComponent);
  fixture.componentRef.setInput('label', 'Language');
  fixture.componentRef.setInput('value', 'en');
  fixture.componentRef.setInput('options', options);
  fixture.detectChanges();
  return { fixture, control: fixture.componentInstance, locale };
}
describe('Directory Ionic select', () => {
  for (const locale of ['en', 'ta', 'sa'])
    it(locale + ': keeps the visible external label and Ionic accessible label in sync', async () => {
      const { fixture } = setup();
      const select = fixture.debugElement.query(By.directive(IonSelect)).componentInstance as IonSelect;
      for (const key of ['uiLanguage', 'theme'] as const) {
        const label = directoryText(locale, key);
        fixture.componentRef.setInput('label', label);
        fixture.detectChanges();
        await fixture.whenStable();
        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelectorAll(':scope > .control-label')).toHaveLength(1);
        expect(host.querySelector('.control-label')?.textContent?.trim()).toBe(label);
        expect(host.querySelector('.control-label')?.nextElementSibling?.tagName).toBe('ION-SELECT');
        expect(select.label).toBe(label);
        expect(select.labelPlacement).not.toBe('stacked');
        expect(host.querySelector('ion-select .control-label')).toBeNull();
        expect(host.querySelectorAll('ion-select-option')).toHaveLength(2);
      }
    });
  it('uses a modal for long mobile lists, popovers for short lists and desktop', () => {
    const { fixture, control } = setup(
      Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: 'Language ' + i })),
    );
    control.narrow.set(false);
    expect(control.overlayInterface()).toBe('popover');
    expect(control.overlayOptions()).toHaveProperty('size', 'auto');
    control.narrow.set(true);
    expect(control.overlayInterface()).toBe('modal');
    expect(control.overlayOptions()).not.toHaveProperty('size');
    fixture.componentRef.setInput('options', [{ id: 'ta', name: 'தமிழ்' }]);
    fixture.detectChanges();
    expect(control.overlayInterface()).toBe('popover');
  });
  it('emits only known string values from ionChange detail', () => {
    const { fixture, control } = setup();
    const changed = vi.fn();
    control.changed.subscribe(changed);
    const select = (fixture.nativeElement as HTMLElement).querySelector('ion-select')!;
    for (const value of ['ta', 'unknown', 42, undefined])
      select.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('ta');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('select,option')).toHaveLength(0);
  });
  it('does not change a disabled fixed-facet control', () => {
    const { fixture, control } = setup();
    const changed = vi.fn();
    control.changed.subscribe(changed);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    control.change(new CustomEvent('ionChange', { detail: { value: 'ta' } }));
    expect(changed).not.toHaveBeenCalled();
  });
  it('updates responsive behavior and removes its resize listener when destroyed', () => {
    const { fixture, control } = setup();
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(control.narrow()).toBe(true);
    fixture.destroy();
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(control.narrow()).toBe(true);
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  });
  it('passes a scoped overlay class, header, locale and localized Close text', () => {
    const { control, locale } = setup();
    locale.set('ta');
    expect(control.overlayOptions()).toEqual(
      expect.objectContaining({
        cssClass: 'rb-directory-select-overlay',
        header: 'Language',
        showBackdrop: true,
        htmlAttributes: expect.objectContaining({ lang: 'ta', role: 'dialog', 'aria-label': 'Language' }),
      }),
    );
    expect(control.cancelText()).toBe('மூடு');
    locale.set('sa');
    expect(control.cancelText()).toBe('पिधेहि');
  });
  it('corrects only its owned overlay structural list, retaining the named radiogroup', async () => {
    const { control } = setup();
    const overlay = document.createElement('div');
    overlay.setAttribute(
      'data-directory-select-owner',
      control.overlayOptions().htmlAttributes['data-directory-select-owner'],
    );
    overlay.innerHTML =
      '<ion-select-popover><ion-list role="list"><ion-radio-group><ion-item role="listitem"><ion-radio role="radio"></ion-radio></ion-item></ion-radio-group></ion-list></ion-select-popover>';
    const list = overlay.querySelector('ion-list')!;
    Object.defineProperty(list, 'componentOnReady', { value: async () => list, configurable: true });
    const item = overlay.querySelector('ion-item')!;
    Object.defineProperty(item, 'componentOnReady', { value: async () => item, configurable: true });
    document.body.append(overlay);
    const event = new Event('ionPopoverWillPresent');
    Object.defineProperty(event, 'target', { value: overlay });
    await control.prepareOverlay(event);
    expect(list.getAttribute('role')).toBe('presentation');
    expect(item.getAttribute('role')).toBe('presentation');
    expect(overlay.querySelector('ion-radio')?.getAttribute('role')).toBe('radio');
    expect(overlay.querySelector('ion-radio-group')?.getAttribute('aria-label')).toBe('Language');
    overlay.remove();
  });
  it('does not modify an unrelated Ionic overlay', async () => {
    const { control } = setup(),
      overlay = document.createElement('div');
    overlay.innerHTML = '<ion-list role="list"></ion-list>';
    const event = new Event('ionPopoverWillPresent');
    Object.defineProperty(event, 'target', { value: overlay });
    await control.prepareOverlay(event);
    expect(overlay.querySelector('ion-list')?.getAttribute('role')).toBe('list');
  });
  it('supplies fresh ARIA attributes for every reopen when Ionic consumes the previous bag', () => {
    const { control } = setup();
    const previous = control.overlayOptions().htmlAttributes;
    Reflect.deleteProperty(previous, 'aria-label');
    expect(control.overlayOptions().htmlAttributes['aria-label']).toBe('Language');
    expect(control.overlayOptions().htmlAttributes).not.toBe(previous);
  });
  it('focuses the selected native radio when its popover finishes opening', () => {
    const { control } = setup(),
      overlay = document.createElement('div');
    overlay.setAttribute(
      'data-directory-select-owner',
      control.overlayOptions().htmlAttributes['data-directory-select-owner'],
    );
    overlay.innerHTML = '<ion-radio></ion-radio><ion-radio aria-checked="true"></ion-radio>';
    const selected = overlay.querySelector('ion-radio[aria-checked=true]')!;
    const focus = vi.fn(async () => undefined);
    Object.defineProperty(selected, 'setFocus', { value: focus, configurable: true });
    document.body.append(overlay);
    document.body.focus();
    const event = new Event('ionPopoverDidPresent');
    Object.defineProperty(event, 'target', { value: overlay });
    control.focusOverlay(event);
    expect(focus).toHaveBeenCalledOnce();
    overlay.remove();
  });
});
