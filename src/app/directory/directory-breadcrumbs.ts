import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { chevronForwardOutline } from 'ionicons/icons';
import { Crumb } from './directory.model';

@Component({
  selector: 'app-directory-breadcrumbs',
  imports: [RouterLink, IonIcon],
  template: `
    <nav class="breadcrumbs" [attr.aria-label]="label()">
      <ol>
        @for (crumb of items(); track crumb.url.join('/'); let first = $first) {
          <li>
            @if (!first) {
              <ion-icon [icon]="chevron" aria-hidden="true" />
            }
            @if (crumb.current) {
              <span aria-current="page">{{ crumb.name }}</span>
            } @else {
              <a [routerLink]="crumb.url">{{ crumb.name }}</a>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 18px;
    }
    ol {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    a,
    span {
      color: var(--ink);
      overflow-wrap: anywhere;
      line-height: 1.5;
      font-size: 13px;
    }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding-inline: 6px;
      margin-inline: -6px;
      border-radius: 6px;
      text-decoration: none;
      transition: color 160ms ease, background-color 160ms ease;
    }
    a:hover,
    a:focus-visible {
      color: var(--accent-ink);
      background-color: var(--panel);
      text-decoration: none;
    }
    span {
      font-weight: 600;
    }
    ion-icon {
      color: var(--muted);
      font-size: 14px;
      flex: none;
    }
    a:focus-visible {
      outline: 3px solid var(--accent-ink);
      outline-offset: 2px;
    }
  `,
})
export class DirectoryBreadcrumbsComponent {
  readonly items = input.required<readonly Crumb[]>();
  readonly label = input.required<string>();
  readonly chevron = chevronForwardOutline;
}
