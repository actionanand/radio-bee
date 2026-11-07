import { readFileSync } from 'node:fs';
export function recordingNotice(text) {
  const flag = /RadioRecording:\s*\{\s*Enabled:\s*(true|false)/.exec(text)?.[1];
  return `RadioBee production recording: ${flag === 'true' ? 'ENABLED — capture still requires user action and stream recording-policy checks.' : flag === 'false' ? 'disabled.' : 'configuration not detected; inspect the environment file.'}`;
}
// Informational only: no warning annotation, release gate, flag mutation or deployment changes.
if (process.argv[1]?.endsWith('report-recording-config.mjs'))
  console.log(
    recordingNotice(readFileSync(new URL('../src/environments/environment.prod.ts', import.meta.url), 'utf8')),
  );
