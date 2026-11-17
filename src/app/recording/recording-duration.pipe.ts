import { Pipe, PipeTransform } from '@angular/core';

type UnitLabels = readonly [singular: string, plural: string];
type DurationLabels = Readonly<{
  hour: UnitLabels;
  minute: UnitLabels;
  second: UnitLabels;
}>;

const durationLabels: Record<'en' | 'ta' | 'sa', DurationLabels> = {
  en: {
    hour: ['hour', 'hours'],
    minute: ['minute', 'minutes'],
    second: ['s', 's'],
  },
  ta: {
    hour: ['மணி நேரம்', 'மணி நேரம்'],
    minute: ['நிமிடம்', 'நிமிடங்கள்'],
    second: ['விநாடி', 'விநாடிகள்'],
  },
  sa: {
    hour: ['घण्टा', 'घण्टाः'],
    minute: ['निमेषः', 'निमेषाः'],
    second: ['क्षणः', 'क्षणाः'],
  },
};

/** Formats elapsed recording seconds for display; never changes capture limits. */
@Pipe({ name: 'recordingDuration' })
export class RecordingDurationPipe implements PipeTransform {
  transform(value: number | null | undefined, locale = 'en'): string {
    const total = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const labels = durationLabels[locale === 'ta' || locale === 'sa' ? locale : 'en'];
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts: string[] = [];

    if (hours) parts.push(`${hours} ${labels.hour[hours === 1 ? 0 : 1]}`);
    if (minutes) parts.push(`${minutes} ${labels.minute[minutes === 1 ? 0 : 1]}`);
    if (seconds || parts.length === 0)
      parts.push(`${seconds} ${labels.second[seconds === 1 ? 0 : 1]}`);

    return parts.join(' ');
  }
}
