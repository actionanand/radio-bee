import { Station } from './catalog.models';
export type DiscoveryCategory = 'all' | 'favorites' | 'kanyakumari' | 'sriLanka' | 'chennai' | 'otherTamil';
export const discoveryCategories: DiscoveryCategory[] = [
  'all',
  'favorites',
  'kanyakumari',
  'sriLanka',
  'chennai',
  'otherTamil',
];
export function inCategory(station: Station, category: DiscoveryCategory, favorite: boolean): boolean {
  switch (category) {
    case 'favorites':
      return favorite;
    case 'kanyakumari':
      return station.countryCode === 'IN' && station.districtId === 'in-tn-kanyakumari';
    case 'sriLanka':
      return station.countryCode === 'LK' && station.broadcastLanguages.includes('ta');
    case 'chennai':
      return station.countryCode === 'IN' && station.districtId === 'in-tn-chennai';
    case 'otherTamil':
      return (
        station.broadcastLanguages.includes('ta') &&
        station.countryCode !== 'LK' &&
        !['in-tn-kanyakumari', 'in-tn-chennai'].includes(station.districtId ?? '')
      );
    default:
      return true;
  }
}
