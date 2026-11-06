// Supporting HEAD requests only; these never replace a failed browser outcome or download audio.
const fs = require('fs');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const file = 'documentation/stage6/technical-playback-results.json';
const report = JSON.parse(fs.readFileSync(file));
if (report.results.length !== report.counts.candidateStreams) throw Error('Finish the browser run first');
(async () => {
  report.diagnostics = await Promise.all(
    report.results
      .filter(row => !row.latest.played)
      .map(async row => {
        const result = {
          streamId: row.streamId,
          method: 'HEAD',
          at: new Date().toISOString(),
          purpose: 'Supplemental HTTP/CORS diagnosis; not playback proof',
        };
        try {
          const response = await fetch(row.latest.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(12000),
            headers: { Origin: 'http://localhost:3061', 'User-Agent': 'RadioBee-Stage6-Evidence/0.0.1' },
          });
          Object.assign(result, {
            status: response.status,
            finalUrl: response.url,
            mime: response.headers.get('content-type'),
            cors: response.headers.get('access-control-allow-origin'),
          });
        } catch (error) {
          result.error = error.message;
        }
        return result;
      }),
  );
  // Shoutcast's root can negotiate differently for browser versus utility user agents.
  const uaFile = 'tmp/stage6-review-browser-user-agent.txt';
  const legacy = report.results.find(row => row.streamId === 'sooriyan-candidate' && !row.latest.played);
  if (legacy && fs.existsSync(uaFile)) {
    const userAgent = fs.readFileSync(uaFile, 'utf8').trim();
    const row = {
      streamId: legacy.streamId,
      method: 'HEAD',
      at: new Date().toISOString(),
      purpose: 'Compare same audit-browser user agent; not playback proof',
      userAgent,
    };
    try {
      const response = await fetch(legacy.latest.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': userAgent, Origin: 'http://localhost:3061' },
      });
      Object.assign(row, {
        status: response.status,
        finalUrl: response.url,
        mime: response.headers.get('content-type'),
        cors: response.headers.get('access-control-allow-origin'),
      });
    } catch (error) {
      row.error = error.message;
    }
    report.diagnostics.push(row);
  }
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.diagnostics, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
