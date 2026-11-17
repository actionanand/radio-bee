/** Copyright year range updates from the visitor's local calendar year. */
export function radioBeeCopyright(currentYear = new Date().getFullYear()): string {
  const startYear = 2026;
  const endYear = Number.isFinite(currentYear) ? Math.max(startYear, Math.trunc(currentYear)) : startYear;
  const years = endYear === startYear ? String(startYear) : `${startYear}–${endYear}`;
  return `© ${years} RadioBee. All rights reserved.`;
}
