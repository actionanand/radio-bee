const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const report = JSON.parse(fs.readFileSync('documentation/stage6/technical-playback-results.json'));
test('technical evidence is complete, uniquely scoped and counts actual outcomes', () => {
  assert.equal(report.results.length, report.counts.candidateStreams);
  assert.equal(new Set(report.results.map(row => row.streamId)).size, report.results.length);
  assert.equal(report.counts.technicalStreamsPlaying, report.results.filter(row => row.latest.played).length);
  assert.equal(report.counts.technicalStreamsFailing, report.results.filter(row => !row.latest.played).length);
  const ids = new Set();
  for (const attempt of report.allAttempts) {
    assert.doesNotMatch(
      attempt.playerStatus ?? '',
      /https?:\/\//,
      'Player error messages must not expose or link websites',
    );
    assert.equal(ids.has(attempt.attemptId), false);
    ids.add(attempt.attemptId);
    assert.equal(attempt.stop.audioElements, 1);
    assert.equal(attempt.stop.paused, true);
    const allowed = new Set([attempt.url, ...attempt.responses.map(response => response.url)]);
    assert.ok(attempt.events.length > 0);
    for (const event of attempt.events) {
      assert.equal(event.attemptId, attempt.attemptId);
      assert.equal(event.streamUrl, attempt.url);
      assert.ok(
        !event.src || event.src.startsWith('blob:') || allowed.has(event.src),
        `Unrelated media source ${event.src}`,
      );
      assert.ok(
        Date.parse(event.at) >= Date.parse(attempt.startedAt) && Date.parse(event.at) <= Date.parse(attempt.finishedAt),
      );
    }
    if (attempt.played) {
      assert.equal(attempt.playingConfirmed, true);
      assert.equal(attempt.pauseResume, true);
      assert.ok(attempt.continuitySeconds > 15);
      assert.ok(attempt.events.some(event => event.event === 'playing'));
      assert.ok(attempt.events.some(event => event.event === 'playing' && event.phase === 'resume'));
      if (attempt.decodedBytes.delta !== null) assert.ok(attempt.decodedBytes.delta > 0);
    }
  }
});
test('J1 Web proposal remains unconfirmed and points listeners to the official site', () => {
  const patch = JSON.parse(fs.readFileSync('documentation/stage6/catalogue-proposal.patch.json'));
  const stations = patch.filter(row => row.path === '/stations/-').map(row => row.value);
  assert.equal(stations.length, 2);
  for (const station of stations) {
    assert.equal(station.website, 'https://www.j1fm.tokyo/');
    assert.ok(station.sourceIds.includes('j1-faq-2026'));
    for (const stream of station.streams) {
      assert.equal(stream.rightsStatus, 'unconfirmed');
      assert.equal(stream.directListening.status, 'needs-review');
    }
  }
  assert.ok(patch.some(row => row.path === '/sources/-' && row.value.url === 'https://www.j1fm.tokyo/j1/developers/'));
  assert.ok(patch.some(row => row.path === '/sources/-' && row.value.url === 'https://www.j1fm.tokyo/faq/'));
});
