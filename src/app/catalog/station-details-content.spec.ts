import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { validateCatalog } from './catalog.validation';
import { fixture } from './catalog.fixture';
import { CatalogService } from './catalog.service';
import { StationDetailsContentComponent } from './station-details-content';

describe('V1 public station details', () => {
  const catalogue = validateCatalog(structuredClone(fixture));
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{
        provide: CatalogService,
        useValue: {
          catalog: signal(catalogue),
          locale: signal('en'),
          stationName: (station: { name: string }) => station.name,
          t: (_category: string, _id: string, fallback: string) => fallback,
        },
      }],
    });
  });

  it('hides cached technical review notes for discovery stations', () => {
    const station = {
      ...catalogue.stations[0],
      notes: 'FFmpeg stream URL verification and rights review remain pending.',
      streams: [],
      discovery: {
        availability: 'review-pending' as const,
        reviewedOn: '2026-11-14',
        websiteKind: null,
      },
    };
    const view = TestBed.createComponent(StationDetailsContentComponent);
    view.componentRef.setInput('station', station);
    view.detectChanges();
    const content = (view.nativeElement as HTMLElement).textContent || '';
    expect(content).toContain(station.name + ' is a station listed by RadioBee.');
    expect(content).not.toContain('FFmpeg');
    expect(content).not.toContain('stream URL');
    expect(content).not.toContain('Stream review pending');
  });

  it('shows public About only for V1 discovery stations', () => {
    const station = {
      ...catalogue.stations[0],
      notes: catalogue.stations[0].name + ' is a Tamil-language FM station listed by RadioBee. Its catalogue categories include music.',
      streams: [],
      discovery: {
        availability: 'review-pending' as const,
        reviewedOn: '2026-11-14',
        websiteKind: null,
      },
    };
    const view = TestBed.createComponent(StationDetailsContentComponent);
    view.componentRef.setInput('station', station);
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).textContent).toContain(station.notes);
    view.componentRef.setInput('station', { ...station, discovery: undefined, streams: catalogue.stations[0].streams });
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).textContent).not.toContain('Tamil-language FM station listed by RadioBee');
  });
});
