const fs = require('fs'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const catalog = JSON.parse(fs.readFileSync('tmp/stage6-catalogue.json'));
const report = JSON.parse(fs.readFileSync('documentation/stage6/technical-playback-results.json'));
assert.equal(report.results.length, catalog.manifest.counts.streams);
const clean = value =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const resultText = row => {
  const latest = row.latest;
  if (latest.played)
    return `${latest.continuitySeconds.toFixed(2)}s clock continuity, ${latest.decodedBytes.delta ?? 'not exposed'} decoded-byte increase, playing event and pause/resume confirmed`;
  const errors = [...new Set(latest.failures.map(item => item.error))].join(', ');
  const cors = latest.consoleErrors.some(message => message.includes('CORS'))
    ? 'Chrome confirms missing CORS allowance; '
    : '';
  const head = report.diagnostics?.findLast(item => item.streamId === row.streamId);
  return `FAILED after ${row.attempts} attempts: ${cors}${errors}${head?.status ? `; supplemental HEAD HTTP ${head.status} ${head.mime}` : ''}`;
};
const lines = [
  '# Catalogue v1.3.0: corrected 88-station playback audit',
  '',
  `Fresh-context verification completed ${report.generatedAt}. This replaces the prior event-contaminated report. Every attempt has its own context/page/audio, uniquely tagged media events, captured network responses and byte baseline. The new outcome is **${report.counts.technicalStreamsPlaying}/26 successful**, versus the earlier 23/26. Changes reflect this live probe; prior success is never carried forward to a failed new attempt.`,
  '',
  '| Measure | Count |',
  '| --- | ---: |',
  ...Object.entries(report.counts).map(([key, value]) => `| ${key} | ${value} |`),
  '',
  'All candidate rights remain unconfirmed; all directListening records need review. Successful technical playback is not permission, source identity certification, or a production-ready station. No original data record is changed. No on-air mismatches are newly asserted; human identity verification remains separate.',
  '',
  '| Station ID / name | Source availability / identity evidence | Fresh browser outcome | Production / remaining blocker |',
  '| --- | --- | --- | --- |',
];
for (const station of catalog.stations) {
  const network = catalog.networks.find(network => network.id === station.networkId);
  const rows = report.results.filter(row => row.stationId === station.id);
  const source = rows.length
    ? station.streams
        .map(stream => catalog.sources.find(source => source.id === stream.sourceId))
        .filter(Boolean)
        .map(source => `${source.title} (${source.url ?? 'no URL'})`)
        .join('; ')
    : `No candidate in catalogue. Metadata website: ${station.website ?? network?.website ?? 'not established'}.`;
  for (const stream of station.streams)
    assert.ok(rows.some(row => row.streamId === stream.id && row.latest.url === stream.url));
  const actual = rows.length
    ? rows.map(row => `${row.streamId}: ${resultText(row)}`).join('; ')
    : 'Not browser played; no candidate URL is present. This does not establish that the broadcaster has no online service.';
  lines.push(
    `| ${station.id} / ${clean(station.name)} | ${clean(source)}; on-air identity not automatically certified | ${clean(actual)} | NO production Play. ${rows.length ? 'Review use terms separately; reconcile exact endpoint, browser errors and dated verification.' : 'Establish an exact official station-specific listening source, identity, applicable use policy and real browser verification.'} |`,
  );
}
lines.push(
  '',
  '## Separate J1 proposal',
  '',
  'J1 HITS/GOLD are outside these 88 listings. Their earlier audible/technical results remain historical, but the Web permission conclusion is withdrawn after reading the FAQ alongside the developer policy. Both proposals now have unconfirmed rights and need review, and both listener websites point to the official J1 homepage. See ../J1-PUBLICATION-REVIEW.md. No J1 stream was used in this fresh 26-candidate run.',
  '',
  '## Reproduction and scope',
  '',
  'Build the explicit local technical configuration, capture the public catalogue, run scripts/verify-technical-playback.cjs, then scripts/diagnose-playback-failures.cjs and scripts/render-playback-audit.cjs. Run scripts/playback-evidence.test.cjs to validate attribution, completeness and actual-success counts. See ../STAGE6-REVIEW-CORRECTIONS.md for exact commands.',
  '',
  'The first failed attempt is retried once in a fresh context; both attempts are retained, and the final attempted outcome is used. Failed network requests after stop can be normal live-stream cleanup and do not override a sustained playing result. HEAD diagnostics are separately timestamped and never promote browser failure to success. No audio is recorded, mocked or proxied.',
);
fs.writeFileSync('documentation/stage6/catalogue-audit.md', lines.join('\n') + '\n');
