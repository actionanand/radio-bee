import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonModal, IonSelect, IonSelectOption } from '@ionic/angular';
import { closeOutline, sendOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../catalog/catalog.service';
import { SnackbarService } from '../shared/snackbar.service';
import {
  CONTACT_FORM_SUBMIT,
  contactPurposes,
  defaultContactPurpose,
  type ContactPayload,
} from './contact-google-form';
import { contactCopy, contactPurposeOptions } from './contact-copy';

/**
 * RadioBee-branded Ionic contact dialog. Google Forms is transport only and
 * never embedded; the browser does not expose Google Forms' receipt through CORS.
 */
@Component({
  selector: 'app-contact-form',
  imports: [ReactiveFormsModule, IonButton, IonContent, IonIcon, IonModal, IonSelect, IonSelectOption, RouterLink],
  template: `
    <div class="contact-entry rb-ui" [attr.lang]="catalog.locale()">
      <p>{{ copy().subtitle }}</p>
      <button class="open-form" type="button" (click)="open.set(true)">{{ copy().open }}</button>
    </div>
    <ion-modal class="rb-contact-modal" [isOpen]="open()" [backdropDismiss]="!sending()"
      [canDismiss]="!sending()" (didDismiss)="open.set(false)">
      <ng-template>
        <ion-content class="contact-modal-content">
        <div class="contact-dialog rb-ui" [attr.lang]="catalog.locale()">
          <header class="form-heading">
            <div class="contact-heading-brand">
              <img class="contact-brand-icon" src="assets/icon/radio-bee.png" width="42" height="42" alt="RadioBee app icon" />
              <div>
                <p class="eyebrow">RadioBee</p>
              <h2 id="contact-title">{{ copy().title }}</h2>
              <p>{{ copy().subtitle }}</p>
              </div>
            </div>
            <button class="dismiss-form" type="button" [attr.aria-label]="copy().close"
              [disabled]="sending()" (click)="open.set(false)">
              <ion-icon [icon]="closeIcon" aria-hidden="true" />
            </button>
          </header>
          <form [formGroup]="form" (ngSubmit)="send()" novalidate>
            <fieldset>
              <legend>{{ copy().details }}</legend>
              <div class="fields two">
                <label class="field">{{ copy().name }} <span class="required">*</span>
                  <input formControlName="name" autocomplete="name" [placeholder]="copy().nameHint"
                    maxlength="120" required />
                </label>
                <label class="field">{{ copy().email }} <span class="required">*</span>
                  <input type="email" formControlName="email" autocomplete="email"
                    [placeholder]="copy().emailHint" maxlength="254" required />
                </label>
              </div>
              <div class="fields">
                <label class="field">{{ copy().phone }}
                  <input type="tel" formControlName="phone" autocomplete="tel"
                    [placeholder]="copy().phoneHint" maxlength="40" />
                </label>
              </div>
              <div class="fields">
                <div class="field">
                  <label for="contact-purpose">{{ copy().purpose }} <span class="required">*</span></label>
                  <ion-select id="contact-purpose" mode="md" interface="popover"
                    [attr.aria-label]="copy().purpose"
                    [interfaceOptions]="{ header: copy().purpose, showBackdrop: true }"
                    formControlName="purpose" [disabled]="sending()">
                    @for (choice of purposes(); track choice.value) {
                      <ion-select-option [value]="choice.value">{{ choice.label }}</ion-select-option>
                    }
                  </ion-select>
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend>{{ copy().stationSection }}</legend>
              <p class="helper">{{ copy().optionalInfo }}</p>
              <div class="fields">
                <label class="field">{{ copy().stationName }}
                  <input formControlName="stationName" [placeholder]="copy().stationNameHint" maxlength="180" />
                </label>
                <label class="field">{{ copy().streamUrl }}
                  <input type="url" formControlName="streamUrl" [placeholder]="copy().streamUrlHint" maxlength="500" />
                </label>
                <label class="field">{{ copy().stationWebsite }}
                  <input type="url" formControlName="stationWebsite" [placeholder]="copy().stationWebsiteHint" maxlength="500" />
                </label>
              </div>
              <div class="fields two">
                <label class="field">{{ copy().country }}
                  <input formControlName="country" [placeholder]="copy().countryHint" maxlength="100" />
                </label>
                <label class="field">{{ copy().city }}
                  <input formControlName="city" [placeholder]="copy().cityHint" maxlength="100" />
                </label>
              </div>
              <div class="fields two">
                <label class="field">{{ copy().frequency }}
                  <input formControlName="frequency" [placeholder]="copy().frequencyHint" maxlength="60" />
                </label>
                <label class="field">{{ copy().language }}
                  <input formControlName="language" [placeholder]="copy().languageHint" maxlength="90" />
                </label>
              </div>
              <div class="fields">
                <label class="field">{{ copy().description }}
                  <textarea formControlName="description" [placeholder]="copy().descriptionHint"
                    maxlength="5000" rows="4"></textarea>
                </label>
              </div>
            </fieldset>
            <div class="consent">
              <label class="consent-line">
                <input type="checkbox" formControlName="consent" required />
                <span>{{ copy().consent }} <span class="required">*</span></span>
              </label>
              <a routerLink="/privacy" (click)="open.set(false)">{{ copy().privacy }}</a>
            </div>
            @if (sending()) {
              <p class="submission-status" role="status" aria-live="polite">{{ copy().sending }}</p>
            } @else if (failed()) {
              <p class="form-error" role="alert">{{ copy().failed }}</p>
            } @else if (attempted() && form.invalid) {
              <p class="form-error" role="alert">{{ copy().validation }}</p>
            }
            <div class="form-actions">
              <ion-button type="submit" [disabled]="form.invalid || sending()">
                <ion-icon [icon]="sendIcon" slot="start" aria-hidden="true" />
                {{ sending() ? copy().sending : copy().send }}
              </ion-button>
            </div>
          </form>
        </div>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    :host { display: block; }
    ion-content.contact-modal-content { --background: var(--paper); --color: var(--ink); }
    .contact-entry p { margin: 0 0 14px; }
    .open-form { border: 0; border-radius: 9px; min-height: 44px; padding: 9px 16px;
      font: inherit; color: var(--paper); background: var(--ink); cursor: pointer; }
    .contact-dialog { min-height: 100%; box-sizing: border-box; background: var(--paper); color: var(--ink);
      padding: clamp(18px, 3vw, 32px); }
    .form-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
      margin-bottom: 26px; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
    .eyebrow { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .contact-heading-brand { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
    .contact-brand-icon { width: 42px; height: 42px; flex: none; border-radius: 50%; object-fit: contain; }
    .form-heading h2 { margin: 0 0 8px; font-size: clamp(23px, 4vw, 30px); }
    .form-heading p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
    .dismiss-form { background: transparent; border: 0; color: var(--ink); cursor: pointer; min-width: 44px;
      min-height: 44px; border-radius: 9px; }
    .dismiss-form ion-icon { font-size: 23px; }
    fieldset { border: 0; margin: 0 0 22px; padding: 0; min-width: 0; }
    legend { font-size: 16px; font-weight: 750; margin: 0 0 14px; }
    .fields { display: grid; grid-template-columns: 1fr; gap: 14px; margin-bottom: 14px; }
    .fields.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .field { display: flex; flex-direction: column; gap: 6px; min-width: 0;
      font-size: 12px; font-weight: 650; color: var(--ink); }
    .field input, .field textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--line);
      border-radius: 7px; background: var(--surface); color: var(--ink); padding: 11px 12px;
      font: inherit; font-size: 14px; min-height: 44px; }
    .field textarea { resize: vertical; min-height: 96px; }
    .field input:focus-visible, .field textarea:focus-visible, .dismiss-form:focus-visible,
    .consent-line input:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 2px; }
    .field input::placeholder, .field textarea::placeholder { color: var(--muted); opacity: .8; }
    ion-select { box-sizing: border-box; width: 100%; min-height: 44px; padding-inline: 12px;
      border: 1px solid var(--line); border-radius: 7px; background: var(--surface);
      color: var(--ink); --highlight-color-focused: var(--accent-ink); }
    ion-select:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 2px; }
    .required { color: #c53729; }
    .helper { margin: -3px 0 14px; color: var(--muted); font-size: 12px; }
    .consent { border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 8px; }
    .consent-line { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; line-height: 1.6; }
    .consent-line input { margin: 3px 0 0; width: 18px; height: 18px; flex: none; accent-color: var(--accent-ink); }
    .consent a { font-size: 12px; color: var(--accent-ink); }
    .form-error { color: #b42b21; font-size: 12px; }
    .submission-status { color: var(--accent-ink); font-size: 13px; font-weight: 650; }
    .form-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
    .form-actions ion-button { min-width: 170px; text-transform: none; font-weight: 700; min-height: 44px; }
    @media (max-width: 600px) {
      .fields.two { grid-template-columns: minmax(0, 1fr); }
      .contact-dialog { padding: 18px; }
      .form-actions ion-button { width: 100%; }
    }
  `,
})
export class ContactFormComponent {
  readonly catalog = inject(CatalogService);
  private readonly snackbar = inject(SnackbarService);
  private readonly submit = inject(CONTACT_FORM_SUBMIT);
  readonly copy = computed(() => contactCopy(this.catalog.locale()));
  readonly purposes = computed(() => contactPurposeOptions(this.catalog.locale(), contactPurposes));
  readonly open = signal(true);
  readonly sending = signal(false);
  readonly attempted = signal(false);
  readonly failed = signal(false);
  readonly closeIcon = closeOutline;
  readonly sendIcon = sendOutline;
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, control => String(control.value).trim() ? null : { whitespace: true }, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    purpose: [defaultContactPurpose, Validators.required],
    stationName: [''],
    streamUrl: [''],
    stationWebsite: [''],
    frequency: [''],
    country: [''],
    city: [''],
    language: [''],
    description: [''],
    consent: [false, Validators.requiredTrue],
  });

  async send() {
    if (this.sending()) return;
    this.attempted.set(true);
    this.failed.set(false);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.snackbar.show({ kind: 'text', message: this.copy().validation }, 'warning');
      return;
    }
    this.sending.set(true);
    this.snackbar.show({ kind: 'text', message: this.copy().sending }, 'info', 30000);
    // Consent is enforced in the Angular form; Google Forms has no field for it.
    const raw = this.form.getRawValue();
    const data: ContactPayload = {
      name: raw.name, email: raw.email, phone: raw.phone, purpose: raw.purpose,
      stationName: raw.stationName, streamUrl: raw.streamUrl, stationWebsite: raw.stationWebsite,
      frequency: raw.frequency, country: raw.country, city: raw.city,
      language: raw.language, description: raw.description,
    };
    try {
      await this.submit(data);
      this.snackbar.show({ kind: 'text', message: this.copy().sent }, 'success', 6500);
      this.sending.set(false);
      this.open.set(false);
      this.form.reset({ purpose: defaultContactPurpose, consent: false });
      this.attempted.set(false);
    } catch {
      this.failed.set(true);
      this.snackbar.show({ kind: 'text', message: this.copy().failed }, 'warning', 6500);
    } finally {
      this.sending.set(false);
    }
  }
}
