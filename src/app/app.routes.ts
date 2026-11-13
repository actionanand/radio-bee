import { inject } from '@angular/core';
import { CanMatchFn, Routes, UrlMatcher } from '@angular/router';
import { CATALOG_URL } from './catalog/catalog.service';
import { continentCountries } from './directory/directory.model';
export const v2DirectoryGuard: CanMatchFn = () =>
  (() => {
    const url = new URL(inject(CATALOG_URL));
    return url.protocol === 'https:' && url.pathname.endsWith('/v2/');
  })();
const knownContinents = new Set([...Object.keys(continentCountries), 'other']);
/** Match real World directory scopes; unknown paths fall through to the animated 404 wildcard. */
export const worldMatcher: UrlMatcher = segments =>
  segments[0]?.path === 'world' && (segments.length === 1 || knownContinents.has(segments[1].path))
    ? { consumed: segments }
    : null;
const page = () => import('./directory/directory-page').then(m => m.DirectoryPage);
const notFound = () => import('./not-found/not-found-page').then(m => m.NotFoundPage);
export const routes: Routes = [
  {
    path: '',
    canMatch: [v2DirectoryGuard],
    loadComponent: () => import('./directory/directory-shell').then(m => m.DirectoryShellComponent),
    children: [
      { path: 'home', loadComponent: page, data: { mode: 'home' } },
      { matcher: worldMatcher, loadComponent: page, data: { mode: 'world' } },
      ...(['languages', 'genres', 'artists', 'networks', 'broadcasters'] as const).flatMap(mode => [
        { path: mode, loadComponent: page, data: { mode } },
        { path: mode + '/:facetId', loadComponent: page, data: { mode } },
      ]),
      { path: 'favorites', loadComponent: page, data: { mode: 'favorites' } },
      { path: 'listen-now', loadComponent: page, data: { mode: 'listenNow' } },
      { path: 'radios/:stationId', loadComponent: () => import('./directory/station-page').then(m => m.StationPage) },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: '**', loadComponent: notFound },
    ],
  },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage) },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', loadComponent: notFound },
];
