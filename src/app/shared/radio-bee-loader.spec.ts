import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from '../catalog/catalog.service';
import { RadioBeeLoaderComponent } from './radio-bee-loader';

describe('Radio Bee catalogue animation', () => {
  it('only runs while the catalogue is fetching, using the tuner state convention', () => {
    const loading = signal(false);
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogService, useValue: { loading } }],
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
    expect(loader().querySelector('.bee svg')).not.toBeNull();
    expect(loader().querySelector('.radio-body')).not.toBeNull();
    expect(loader().querySelector('.speaker-cone')).not.toBeNull();

    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(host.classList.contains('compact')).toBe(true);

    loading.set(false);
    fixture.detectChanges();
    expect(loader().dataset['fetchState']).toBe('idle');
    expect(loader().classList.contains('is-loading')).toBe(false);
  });
});
