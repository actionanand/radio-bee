import { TestBed } from '@angular/core/testing';
import { RadioLedEqualizerComponent } from './radio-led-equalizer';

describe('Reusable LED equalizer', () => {
  it('renders twenty columns, a bee and scale; activity follows its input', () => {
    const fixture = TestBed.createComponent(RadioLedEqualizerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-active')).toBe('false');
    expect(host.querySelectorAll('.rb-leds > .rb-led')).toHaveLength(20);
    expect(host.querySelector('.rb-led-bee svg')).toBeTruthy();
    expect(host.querySelectorAll('.rb-led-scale span')).toHaveLength(5);
    expect(host.querySelector('.rb-led-panel')?.getAttribute('aria-hidden')).toBe('true');
    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();
    expect(host.getAttribute('data-active')).toBe('true');
    fixture.componentRef.setInput('playing', false);
    fixture.detectChanges();
    expect(host.getAttribute('data-active')).toBe('false');
  });
});
