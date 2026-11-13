import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from '../catalog/catalog.service';
import { RadioBeeLoaderComponent } from './radio-bee-loader';

describe('Radio Bee catalogue animation', () => {
  it('only runs while the catalogue is fetching, using the tuner state convention', () => {
    const loading = signal(false);
    const locale = signal('en');
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogService, useValue: { loading, locale } }],
    });
    const fixture = TestBed.createComponent(RadioBeeLoaderComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const loader = () => host.querySelector<HTMLElement>('.radio-loader')!;
    expect(loader().dataset['fetchState']).toBe('idle');
    expect(loader().classList.contains('is-loading')).toBe(false);

    loading.set(true);
    fixture.detectChanges();
    expect(loader().dataset['fetchState']).toBe('loading');
    expect(loader().classList.contains('is-loading')).toBe(true);
    expect(loader().getAttribute('aria-label')).toBe('Tuning in');
    expect(loader().querySelector('.label')?.textContent?.trim()).toBe('Tuning in');
    expect(loader().querySelector('.bee svg')).not.toBeNull();
    expect(loader().querySelector('.radio-body')).not.toBeNull();
    expect(loader().querySelector('.speaker-cone')).not.toBeNull();

    locale.set('ta');
    fixture.detectChanges();
    expect(loader().getAttribute('lang')).toBe('ta');
    expect(loader().getAttribute('aria-label')).toBe('ஒலிபரப்புடன் இணைகிறது');
    expect(loader().querySelector('.label')?.textContent?.trim()).toBe('ஒலிபரப்புடன் இணைகிறது');
    locale.set('sa');
    fixture.detectChanges();
    expect(loader().getAttribute('lang')).toBe('sa');
    expect(loader().getAttribute('aria-label')).toBe('प्रसारणेन संयुज्यते');
    expect(loader().querySelector('.label')?.textContent?.trim()).toBe('प्रसारणेन संयुज्यते');
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(host.classList.contains('compact')).toBe(true);

    loading.set(false);
    fixture.detectChanges();
    expect(loader().dataset['fetchState']).toBe('idle');
    expect(loader().classList.contains('is-loading')).toBe(false);
  });
});
