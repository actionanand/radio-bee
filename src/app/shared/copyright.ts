export const RADIOBEE_START_YEAR = 2026;

/** Copyright year range updates from the visitor's local calendar year. */
export function radioBeeCopyright(currentYear = new Date().getFullYear(), locale = 'en'): string {
  const startYear = RADIOBEE_START_YEAR;
  const endYear = Number.isFinite(currentYear) ? Math.max(startYear, Math.trunc(currentYear)) : startYear;
  const years = endYear === startYear ? String(startYear) : `${startYear} - ${endYear}`;
  const rights = locale === 'ta' ? 'அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.' : locale === 'sa' ? 'सर्वे अधिकाराः सुरक्षिताः।' : 'All rights reserved.';
  return `© ${years} RadioBee. ${rights}`;
}
