import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogService } from '../catalog/catalog.service';
import { SnackbarService } from '../shared/snackbar.service';
import { ContactFormComponent } from './contact-form';
import { CONTACT_FORM_SUBMIT, type ContactPayload } from './contact-google-form';

describe('RadioBee contact modal', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const setup = (submit = vi.fn(async (_payload: ContactPayload) => undefined)) => {
    const locale = signal('en');
    const snackbar = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { locale } },
        { provide: CONTACT_FORM_SUBMIT, useValue: submit },
        { provide: SnackbarService, useValue: snackbar },
      ],
    });
    const fixture = TestBed.createComponent(ContactFormComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, locale, submit, snackbar };
  };

  it('starts with the requested default purpose, but requires contact details and consent', () => {
    const { component, fixture } = setup();
    expect(component.form.controls.purpose.value).toBe('Interested in contributing content');
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.consent.value).toBe(false);
    expect(component.open()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('ion-select')).toBeNull();
    // Ionic modal content is projected into an overlay on presentation, not into the page.
    fixture.destroy();
  });

  it('opens only on explicit click and can preset a valid contact purpose', () => {
    const { component, fixture } = setup();
    expect(component.open()).toBe(false);
    component.show('Correction in content');
    expect(component.open()).toBe(true);
    expect(component.form.controls.purpose.value).toBe('Correction in content');
    component.open.set(false);
    component.show();
    expect(component.open()).toBe(true);
    expect(component.form.controls.purpose.value).toBe('Correction in content');
    fixture.destroy();
  });

  it('does not send incomplete or unconsented requests', async () => {
    const { component, submit, snackbar, fixture } = setup();
    component.form.patchValue({ name: 'Example', email: 'not-an-email', consent: true });
    await component.send();
    expect(submit).not.toHaveBeenCalled();
    expect(snackbar.show).toHaveBeenCalledWith(expect.anything(), 'warning');
    component.form.patchValue({ email: 'someone@example.test', consent: false });
    await component.send();
    expect(submit).not.toHaveBeenCalled();
    component.form.patchValue({ consent: true, name: '   ' });
    await component.send();
    expect(submit).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('sends valid values once, announces processing, and closes on transmission completion', async () => {
    const { component, submit, snackbar, fixture } = setup();
    component.form.patchValue({
      name: 'Example Contributor',
      email: 'someone@example.test',
      consent: true,
      stationName: 'Test Tamil FM',
      country: 'India',
      city: 'Chennai',
      frequency: '93.5 FM',
      language: 'Tamil',
    });
    expect(component.form.valid).toBe(true);
    await component.send();
    expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      name: 'Example Contributor',
      email: 'someone@example.test',
      purpose: 'Interested in contributing content',
      stationName: 'Test Tamil FM',
      city: 'Chennai',
    }));
    expect(submit.mock.calls[0][0]).not.toHaveProperty('consent');
    expect(snackbar.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'text', message: 'Sending message…',
    }), 'info', 30000);
    expect(snackbar.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'text', message: expect.stringContaining('Delivery confirmation is not available'),
    }), 'success', 6500);
    expect(component.open()).toBe(false);
    expect(component.form.controls.consent.value).toBe(false);
    fixture.destroy();
  });

  it('keeps the modal open and form filled for retries if request fails', async () => {
    const submit = vi.fn(async () => { throw new Error('network unavailable'); });
    const { component, snackbar, fixture } = setup(submit);
    component.show();
    component.form.patchValue({ name: 'Example', email: 'someone@example.test', consent: true });
    await component.send();
    expect(component.open()).toBe(true);
    expect(component.sending()).toBe(false);
    expect(component.form.controls.name.value).toBe('Example');
    expect(component.form.controls.consent.value).toBe(true);
    expect(snackbar.show).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'text', message: expect.stringContaining('Unable to send'),
    }), 'warning', 6500);
    fixture.destroy();
  });

  it('keeps the purpose dropdown full-width and positions its chevron at the far edge', () => {
    const { fixture } = setup();
    const styles = [...document.head.querySelectorAll('style')].map(style => style.textContent).join('\n');
    expect(styles).toContain('::part(container)');
    expect(styles).toContain('::part(icon)');
    expect(styles).toContain('margin-inline-start: auto');
    fixture.destroy();
  });

  it('keeps the modal title and close button below the Android status-bar safe area', () => {
    const { fixture } = setup();
    const styles = [...document.head.querySelectorAll('style')].map(style => style.textContent).join('\\n');
    // The contact dialog is projected into an Ionic overlay rather than the
    // directory toolbar, so it must apply the inset independently.
    expect(styles).toContain('--ion-safe-area-top');
    expect(styles).toContain('--safe-area-inset-top');
    expect(styles).toContain('padding-top: calc(clamp(18px, 3vw, 32px) +');
    expect(styles).toContain('padding-top: calc(18px +');
    fixture.destroy();
  });

  it('updates the displayed contact copy without changing canonical form values', () => {
    const { component, locale, fixture } = setup();
    locale.set('ta');
    expect(component.copy().title).toContain('RadioBee');
    expect(component.purposes()[2].value).toBe('Interested in contributing content');
    expect(component.purposes()[2].label).not.toBe('Interested in contributing content');
    locale.set('sa');
    expect(component.copy().send).toContain('प्रेषय');
    fixture.destroy();
  });
});
