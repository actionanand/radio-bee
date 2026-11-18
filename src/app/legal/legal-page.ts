import { Location, NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import {
  arrowBackOutline,
  arrowForwardOutline,
  mailOutline,
  pencilOutline,
  shieldCheckmarkOutline,
  radioOutline,
  chatbubblesOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { CATALOG_URL } from '../catalog/catalog.service';
import { radioBeeCopyright } from '../shared/copyright';
import { LegalPageId, legalLinks, visibleLegalDocument } from './legal-content';
import { RADIO_RECORDING } from '../recording/recording.config';
import { ContactFormComponent } from '../contact/contact-form';

@Component({
  selector: 'app-legal-page',
  imports: [IonContent, IonIcon, NgTemplateOutlet, RouterLink, ContactFormComponent],

  template: `
    @if (isV2) {
      <ng-container [ngTemplateOutlet]="body" />
    } @else {
      <ion-content>
        <div class="legacy-shell">
          <ng-container [ngTemplateOutlet]="body" />
        </div>
      </ion-content>
    }
    <ng-template #body>
      <article class="legal-page" [class.contact-page]="pageId === 'contact'" lang="en">
        <button class="back-link" type="button" (click)="goBack()">
          <ion-icon [icon]="backIcon" aria-hidden="true" />
          <span>Back</span>
        </button>
        <!-- The same modal is available on every legal page, without a route change. -->
        <app-contact-form #contactForm />
        @if (pageId === 'contact') {
          <header class="contact-hero">
            <div class="contact-brand">
              <img src="assets/icon/radio-bee.png" width="56" height="56" alt="" />
              <span>RADIOBEE · STAY TUNED. STAY BUZZING.</span>
            </div>
            <p class="eyebrow">LET'S CONNECT</p>
            <h1 tabindex="-1">{{ document.title }}</h1>
            <p class="introduction">{{ document.summary }}</p>
            <button class="contact-primary" type="button" aria-haspopup="dialog" (click)="contactForm.show()">
              <ion-icon [icon]="mailIcon" aria-hidden="true" />
              Open contact form
              <ion-icon [icon]="arrowIcon" aria-hidden="true" />
            </button>
            <p class="contact-hero-note">The form opens here in RadioBee.</p>
          </header>
          <section class="contact-topics" aria-labelledby="contact-topics-title">
            <p class="eyebrow">HOW CAN WE HELP?</p>
            <h2 id="contact-topics-title">Choose what you'd like to share</h2>
            <p class="contact-topics-intro">Pick a topic to open the form with the right category selected.</p>
            <div class="contact-topic-grid">
              <button class="contact-topic" type="button" aria-haspopup="dialog" (click)="contactForm.show('Correction in content')">
                <ion-icon [icon]="editIcon" aria-hidden="true" />
                <strong>Station corrections</strong>
                <span>Report incorrect station details, languages, or stream links.</span>
                <span class="topic-action">Report a correction <ion-icon [icon]="arrowIcon" aria-hidden="true" /></span>
              </button>
              <button class="contact-topic" type="button" aria-haspopup="dialog" (click)="contactForm.show('Content-related question')">
                <ion-icon [icon]="shieldIcon" aria-hidden="true" />
                <strong>Content &amp; rights</strong>
                <span>Ask about broadcasts, attribution, ownership, or a removal request.</span>
                <span class="topic-action">Raise a concern <ion-icon [icon]="arrowIcon" aria-hidden="true" /></span>
              </button>
              <button class="contact-topic" type="button" aria-haspopup="dialog" (click)="contactForm.show('Interested in contributing content')">
                <ion-icon [icon]="radioIcon" aria-hidden="true" />
                <strong>Contribute a station</strong>
                <span>Suggest a radio station or help us improve its information.</span>
                <span class="topic-action">Suggest a station <ion-icon [icon]="arrowIcon" aria-hidden="true" /></span>
              </button>
              <button class="contact-topic" type="button" aria-haspopup="dialog" (click)="contactForm.show('Suggestion or feedback')">
                <ion-icon [icon]="chatIcon" aria-hidden="true" />
                <strong>Feedback &amp; ideas</strong>
                <span>Share a suggestion, usability concern, or general feedback.</span>
                <span class="topic-action">Share feedback <ion-icon [icon]="arrowIcon" aria-hidden="true" /></span>
              </button>
            </div>
          </section>
          <aside class="contact-guidance" aria-label="Before submitting">
            <div class="contact-guidance-heading">
              <ion-icon [icon]="infoIcon" aria-hidden="true" />
              <h2>Before you send</h2>
            </div>
            @for (section of document.sections; track section.heading) {
              @for (paragraph of section.paragraphs ?? []; track paragraph) {
                <p>{{ paragraph }}</p>
              }
            }
            <a routerLink="/privacy">Read our Privacy Policy</a>
          </aside>
        } @else {
          <header>
            <p class="eyebrow">RadioBee · Legal information</p>
            <h1 tabindex="-1">{{ document.title }}</h1>
            <p class="introduction">{{ document.summary }}</p>
          </header>
          @for (section of document.sections; track section.heading) {
            <section>
              <h2>{{ section.heading }}</h2>
              @for (paragraph of section.paragraphs ?? []; track paragraph) {
                <p>{{ paragraph }}</p>
              }
              @if (section.points?.length) {
                <ul>
                  @for (point of section.points; track point) {
                    <li>{{ point }}</li>
                  }
                </ul>
              }
            </section>
          }
          <aside class="legal-contact-cta">
            <div>
              <h2>Questions about this policy?</h2>
              <p>Contact RadioBee directly without leaving this page.</p>
            </div>
            <button type="button" aria-haspopup="dialog" (click)="contactForm.show()">
              <ion-icon [icon]="mailIcon" aria-hidden="true" />
              Open contact form
              <ion-icon [icon]="arrowIcon" aria-hidden="true" />
            </button>
          </aside>
        }
        @if (!isV2) {
          <footer class="legal-end">
            <nav aria-label="RadioBee policies">
              @for (link of links; track link.path) {
                <a [routerLink]="link.path" [attr.aria-current]="link.path === routePath ? 'page' : null">{{ link.label }}</a>
              }
            </nav>
            <p>{{ copyright }}</p>
          </footer>
        }
      </article>
    </ng-template>
  `,
  styles: `
    :host { display: block; color: var(--ink); }
    ion-content { --background: var(--paper); --color: var(--ink); }
    .legacy-shell { max-width: 960px; padding: 24px clamp(18px, 4vw, 64px) 64px; margin: 0 auto; }
    .legal-page { max-width: 890px; margin: 0 auto; padding: 0 0 40px; line-height: 1.65; }
    .back-link {
      display: inline-flex; gap: 8px; min-height: 44px; align-items: center;
      padding: 0; border: 0; border-radius: 0;
      background: transparent; box-shadow: none; color: var(--ink); font: inherit;
      font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
    }
    .back-link ion-icon { font-size: 18px; }
    .back-link:hover { color: var(--accent-ink); }
    .back-link:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 3px; }
    header { padding-bottom: 20px; margin-bottom: 26px; border-bottom: 1px solid var(--line); }
    .eyebrow { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: clamp(25px, 4vw, 38px); line-height: 1.2; margin: 10px 0 18px; }
    .introduction { color: var(--muted); font-size: 15px; }
    section { margin: 0 0 28px; }
    h2 { font-size: 19px; line-height: 1.3; margin: 0 0 12px; }
    p, li { font-size: 14px; margin: 0 0 12px; }
    ul { padding-left: 23px; }
    li { padding-left: 3px; }
    .issues-note { font-weight: 600; }
    .issue-link { display: inline-flex; align-items: center; gap: 9px; color: var(--accent-ink); font-weight: 650; min-height: 44px; }
    .legal-end { border-top: 1px solid var(--line); margin-top: 40px; padding-top: 22px; font-size: 11px; color: var(--muted); }
    .legal-end nav { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 12px; }
    .legal-end a { color: inherit; font-size: 11px; }
    .legal-end a[aria-current="page"] { font-weight: 700; }
    .legal-end p { font-size: 11px; }
    :focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 3px; }
  `,
})
export class LegalPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly base = inject(CATALOG_URL);
  readonly isV2 = new URL(this.base).pathname.endsWith('/v2/');
  readonly backIcon = arrowBackOutline;
  readonly arrowIcon = arrowForwardOutline;
  readonly mailIcon = mailOutline;
  readonly editIcon = pencilOutline;
  readonly shieldIcon = shieldCheckmarkOutline;
  readonly radioIcon = radioOutline;
  readonly chatIcon = chatbubblesOutline;
  readonly infoIcon = informationCircleOutline;
  readonly pageId = this.route.snapshot.data['legalPage'] as LegalPageId;
  private readonly recording = inject(RADIO_RECORDING);
  readonly document = visibleLegalDocument(this.pageId, this.recording.Enabled === true);
  readonly routePath = `/${this.pageId}`;
  readonly links = legalLinks;
  readonly copyright = radioBeeCopyright();

  goBack() {
    const state = this.location.getState() as { navigationId?: number };
    if (typeof state.navigationId === 'number' && state.navigationId > 1) this.location.back();
    else void this.router.navigateByUrl('/home');
  }
}
