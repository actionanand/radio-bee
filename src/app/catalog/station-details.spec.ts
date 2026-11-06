import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { validateCatalog } from './catalog.validation';
import { fixture } from './catalog.fixture';
import { StationDetailsService } from './station-details.service';

describe('Station details overlay lifecycle', () => {
  const catalog = validateCatalog(structuredClone(fixture));
  let service: StationDetailsService;
  let buttons: HTMLButtonElement[];
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogService, useValue: { catalog: signal(structuredClone(catalog)) } }],
    });
    service = TestBed.inject(StationDetailsService);
    buttons = catalog.stations.slice(0, 3).map(station => {
      const button = document.createElement('button');
      button.append(document.createElement('span'));
      button.addEventListener('click', event => service.open(station.id, event));
      document.body.append(button);
      return button;
    });
  });
  afterEach(() => buttons.forEach(button => button.remove()));
  const token = () => service.sessions()[0].token;
  it('anchors nested-icon clicks to the button after dispatch ends', () => {
    buttons[0].firstElementChild!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(service.sessions()[0].anchor.target).toBe(buttons[0]);
  });
  it('serializes rapid A → B → C and ignores stale lifecycle callbacks', async () => {
    buttons[0].click();
    const first = token();
    service.presented(first);
    buttons[1].click();
    buttons[2].click();
    expect(service.station()?.id).toBe(catalog.stations[0].id);
    expect(service.overlayOpen()).toBe(false);
    service.dismissed(first);
    await Promise.resolve();
    const last = token();
    expect(service.station()?.id).toBe(catalog.stations[2].id);
    service.willDismiss(first);
    service.presented(first);
    service.dismissed(first);
    await Promise.resolve();
    expect(token()).toBe(last);
    expect(service.isOpen()).toBe(true);
    service.presented(last);
    service.dismiss();
    service.dismissed(last);
    await Promise.resolve();
    expect(document.activeElement).toBe(buttons[2]);
  });
  it('handles close and immediate reopen of the same station with a new instance', async () => {
    buttons[0].click();
    const first = token();
    service.presented(first);
    service.dismiss();
    buttons[0].click();
    service.dismissed(first);
    await Promise.resolve();
    expect(token()).not.toBe(first);
    expect(service.isOpen()).toBe(true);
    service.dismissed(first);
    await Promise.resolve();
    expect(service.station()?.id).toBe(catalog.stations[0].id);
  });
  it('finishes dismissal even when close occurs before the first presentation', async () => {
    buttons[0].click();
    const first = token();
    service.dismiss();
    buttons[1].click();
    expect(service.overlayOpen()).toBe(true);
    service.presented(first);
    expect(service.overlayOpen()).toBe(false);
    service.dismissed(first);
    await Promise.resolve();
    expect(service.station()?.id).toBe(catalog.stations[1].id);
  });
  for (const reason of ['backdrop', 'Escape', 'Android Back'])
    it(`cleans external ${reason} dismissal and restores focus`, async () => {
      buttons[0].click();
      const first = token();
      service.presented(first);
      service.willDismiss(first);
      expect(service.isOpen()).toBe(false);
      buttons[0].blur();
      service.dismissed(first);
      await Promise.resolve();
      expect(service.sessions()).toHaveLength(0);
      expect(document.activeElement).toBe(buttons[0]);
    });
  it('uses search as focus fallback when the original card was removed', async () => {
    const search = document.createElement('input');
    search.type = 'search';
    document.body.append(search);
    buttons[0].click();
    const first = token();
    buttons[0].remove();
    service.dismissed(first);
    await Promise.resolve();
    expect(document.activeElement).toBe(search);
    search.remove();
  });
  it('accepts a new request between didDismiss and Ionic teardown without restoring old focus', async () => {
    buttons[0].click();
    const first = token();
    service.presented(first);
    service.willDismiss(first);
    service.dismissed(first);
    buttons[1].click();
    await Promise.resolve();
    const second = token();
    expect(service.station()?.id).toBe(catalog.stations[1].id);
    expect(document.activeElement).not.toBe(buttons[0]);
    service.presented(second);
    service.dismissed(first);
    await Promise.resolve();
    expect(token()).toBe(second);
    expect(service.isOpen()).toBe(true);
  });
});
