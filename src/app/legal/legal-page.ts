import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { CATALOG_URL } from '../catalog/catalog.service';
import { radioBeeCopyright } from '../shared/copyright';
import { LegalPageId, legalDocuments, legalLinks } from './legal-content';

@Component({
  selector: 'app-legal-page',
  imports: [IonContent, NgTemplateOutlet, RouterLink],
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
      <article class="legal-page" lang="en">
        <a class="back-link" routerLink="/home">← RadioBee Home</a>
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
                @for (point of section.points ?? []; track point) {
                  <li>{{ point }}</li>
                }
              </ul>
            }
          </section>
        }
        @if (pageId === 'contact') {
          <p class="issues-note">Only use this public issue tracker for non-confidential reports. A private contact form is not yet available.</p>
          <a class="issue-link" href="https://github.com/actionanand/radio-bee/issues/new" target="_blank" rel="noopener noreferrer">
            Open RadioBee's public issue tracker
            <span aria-hidden="true">↗</span>
          </a>
        }
        <footer class="legal-end">
          <nav aria-label="RadioBee policies">
            @for (link of links; track link.path) {
              <a [routerLink]="link.path" [attr.aria-current]="link.path === routePath ? 'page' : null">{{ link.label }}</a>
            }
          </nav>
          <p>{{ copyright }}</p>
        </footer>
      </article>
    </ng-template>
  `,
  styles: `
    :host { display: block; color: var(--ink); }
    ion-content { --background: var(--paper); --color: var(--ink); }
    .legacy-shell { max-width: 960px; padding: 24px clamp(18px, 4vw, 64px) 64px; margin: 0 auto; }
    .legal-page { max-width: 890px; margin: 0 auto; padding: 0 0 40px; line-height: 1.65; }
    .back-link { display: inline-flex; min-height: 44px; align-items: center; color: var(--accent-ink); font-size: 14px; }
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
  private readonly base = inject(CATALOG_URL);
  readonly isV2 = new URL(this.base).pathname.endsWith('/v2/');
  readonly pageId = this.route.snapshot.data['legalPage'] as LegalPageId;
  readonly document = legalDocuments[this.pageId];
  readonly routePath = `/${this.pageId}`;
  readonly links = legalLinks;
  readonly copyright = radioBeeCopyright();
}
