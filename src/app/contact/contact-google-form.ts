import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** Google Forms prefill entry identifiers: keep the form ID in environment files. */
export const contactEntryIds = {
  name: 'entry.2005620554',
  email: 'entry.1045781291',
  phone: 'entry.1166974658',
  purpose: 'entry.1730206658',
  stationName: 'entry.1797538244',
  streamUrl: 'entry.1974010954',
  stationWebsite: 'entry.796016218',
  frequency: 'entry.728735755',
  country: 'entry.971212541',
  city: 'entry.476700365',
  language: 'entry.344147520',
  description: 'entry.2093831229',
} as const;

export const contactPurposes = [
  'Content-related question',
  'Correction in content',
  'Interested in contributing content',
  'Collaboration opportunity',
  'Suggestion or feedback',
  'General contact',
] as const;

export type ContactPurpose = (typeof contactPurposes)[number];
export const defaultContactPurpose: ContactPurpose = 'Interested in contributing content';

export interface ContactPayload {
  name: string;
  email: string;
  phone: string;
  purpose: ContactPurpose;
  stationName: string;
  streamUrl: string;
  stationWebsite: string;
  frequency: string;
  country: string;
  city: string;
  language: string;
  description: string;
}

export function googleFormBody(data: ContactPayload): URLSearchParams {
  const body = new URLSearchParams();
  for (const field of Object.keys(contactEntryIds) as (keyof ContactPayload)[]) {
    const value = data[field].trim();
    if (value) body.append(contactEntryIds[field], value);
  }
  return body;
}

/**
 * A browser can transmit data to a public Google Form without showing Google UI.
 * no-cors responses are opaque: completion is NOT a verified Google Forms receipt.
 * The form URL and entry IDs remain inspectable in a public client bundle.
 */
export async function submitContactToGoogle(data: ContactPayload): Promise<void> {
  const id = environment.contactGoogleFormId;
  if (!/^1FAIpQL[\w-]+$/.test(id)) throw new Error('Invalid contact form configuration');
  const url = `https://docs.google.com/forms/d/e/${encodeURIComponent(id)}/formResponse`;
  const response = await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: googleFormBody(data).toString(),
    signal: AbortSignal.timeout(25000),
  });
  if (response.type !== 'opaque' && !response.ok) throw new Error('Contact submission failed');
}

/** Injected to keep unit tests offline and never submit personal data in tests. */
export const CONTACT_FORM_SUBMIT = new InjectionToken<(data: ContactPayload) => Promise<void>>(
  'RadioBee Contact Submit',
  { providedIn: 'root', factory: () => submitContactToGoogle },
);
