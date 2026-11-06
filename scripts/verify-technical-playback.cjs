// Real station audio only. Each attempt gets a fresh browser context and its own event/network collectors.
const fs = require('fs'),
  path = require('path'),
  http = require('http'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(
  path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'playwright'),
);
const catalog = JSON.parse(fs.readFileSync(process.env.RADIOBEE_CATALOG_SNAPSHOT || 'tmp/stage6-catalogue.json'));
const root = path.resolve(process.env.RADIOBEE_WEB_ROOT || 'tmp/stage6-live-corrected/browser');
const output = process.env.RADIOBEE_PLAYBACK_REPORT || 'documentation/stage6/technical-playback-results.json';
const attempts = [],
  results = [];
const server = http.createServer((req, res) => {
  let file = path.resolve(root, decodeURI(req.url.split('?')[0]).replace(/^\/radio-bee\//, '') || 'index.html');
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader(
    'Content-Type',
    { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[
      path.extname(file)
    ] || 'text/html',
  );
  res.end(fs.readFileSync(file));
});
function save() {
  const successful = results.filter(row => row.latest.played).length;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        catalogVersion: catalog.manifest.catalogVersion,
        generatedAt: new Date().toISOString(),
        method:
          'Fresh context/page/audio for EVERY attempt. No media mocks, no recording, no rights changes. Local technical configuration only.',
        counts: {
          publishedStations: catalog.stations.length,
          candidateStations: catalog.stations.filter(s => s.streams.length).length,
          candidateStreams: catalog.stations.flatMap(s => s.streams).length,
          completedStreams: results.length,
          technicalStreamsPlaying: successful,
          technicalStreamsFailing: results.length - successful,
          noStreamStations: catalog.stations.filter(s => !s.streams.length).length,
          // Zero is provable when no rights are granted. A future approved catalogue needs
          // the production client/capability check; this technical probe must not invent that count.
          productionEligibleStations: catalog.stations.some(station =>
            station.streams.some(stream => stream.rightsStatus === 'permission-granted'),
          )
            ? null
            : 0,
          streamsAwaitingUseReview: catalog.stations
            .flatMap(s => s.streams)
            .filter(s => s.rightsStatus !== 'permission-granted').length,
        },
        results,
        allAttempts: attempts,
      },
      null,
      2,
    ) + '\n',
  );
}
async function probe(browser, station, stream, number) {
  const row = {
    attemptId: `${stream.id}/${number}/${new Date().toISOString()}`,
    stationId: station.id,
    streamId: stream.id,
    name: station.name,
    url: stream.url,
    format: stream.format,
    startedAt: new Date().toISOString(),
    responses: [],
    failures: [],
    consoleErrors: [],
    played: false,
  };
  attempts.push(row);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tasks = [];
  try {
    await context.route('https://actionanand.github.io/radio-bee-data/v1/**', route => {
      const file = new URL(route.request().url()).pathname.split('/v1/')[1];
      if (file.startsWith('assets/')) return route.continue();
      return route.fulfill({
        json:
          file === 'index.json'
            ? catalog.manifest
            : file.startsWith('i18n/')
              ? catalog.localization[file.slice(5, -5)]
              : catalog[file.replace('.json', '')],
      });
    });
    const page = await context.newPage();
    const mediaRequest = url => {
      try {
        const host = new URL(url).hostname;
        return host === new URL(stream.url).hostname || host.endsWith('.cloudfront.net');
      } catch {
        return false;
      }
    };
    page.on('response', response => {
      if (!mediaRequest(response.url())) return;
      const target = row; // Capture the attempt BEFORE awaiting headers, never a mutable "current" pointer.
      tasks.push(
        (async () => {
          const headers = await response.allHeaders();
          target.responses.push({
            url: response.url(),
            status: response.status(),
            mime: headers['content-type'],
            cors: headers['access-control-allow-origin'] ?? null,
            redirectFrom: response.request().redirectedFrom()?.url() ?? null,
          });
        })(),
      );
    });
    page.on('requestfailed', request => {
      if (mediaRequest(request.url())) row.failures.push({ url: request.url(), error: request.failure()?.errorText });
    });
    page.on('console', message => {
      if (message.type() === 'error' && /CORS|ERR_|media|HLS/i.test(message.text()))
        row.consoleErrors.push(message.text());
    });
    await page.addInitScript(
      ({ attemptId, streamUrl }) => {
        const Native = Audio;
        window.auditEvents = [];
        window.auditAudioCount = 0;
        window.auditPhase = 'initialization';
        window.Audio = function (...args) {
          const audio = new Native(...args);
          window.auditAudio = audio;
          window.auditAudioCount++;
          for (const event of [
            'loadstart',
            'loadedmetadata',
            'canplay',
            'playing',
            'waiting',
            'stalled',
            'pause',
            'ended',
            'error',
            'emptied',
          ])
            audio.addEventListener(event, () =>
              window.auditEvents.push({
                attemptId,
                streamUrl,
                event,
                phase: window.auditPhase,
                at: new Date().toISOString(),
                time: audio.currentTime,
                src: audio.currentSrc,
                error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
              }),
            );
          return audio;
        };
      },
      { attemptId: row.attemptId, streamUrl: stream.url },
    );
    await page.goto('http://localhost:3061/radio-bee/home');
    await page
      .locator('.station-card')
      .nth(catalog.stations.length - 1)
      .waitFor({ state: 'attached' });
    assert.equal(await page.locator('.development-lab').isVisible(), true, 'Technical mode must be explicit/local');
    await page.locator('.development-lab > summary').click();
    await page.evaluate(() => {
      window.auditPhase = 'load';
    });
    await page.getByRole('button', { name: `Test live audio · ${station.name} · ${stream.id}`, exact: true }).click();
    try {
      await page
        .locator('app-player [role=status]')
        .filter({ hasText: /^Playing$/ })
        .waitFor({ timeout: 25000 });
      row.playingConfirmed = true;
      const before = await page.evaluate(() => ({
        time: window.auditAudio.currentTime,
        bytes: window.auditAudio.webkitAudioDecodedByteCount ?? null,
      }));
      await page.evaluate(() => {
        window.auditPhase = 'continuity';
      });
      await new Promise(resolve => setTimeout(resolve, 20000));
      const after = await page.evaluate(() => ({
        time: window.auditAudio.currentTime,
        bytes: window.auditAudio.webkitAudioDecodedByteCount ?? null,
        paused: window.auditAudio.paused,
        readyState: window.auditAudio.readyState,
        error: window.auditAudio.error
          ? { code: window.auditAudio.error.code, message: window.auditAudio.error.message }
          : null,
        src: window.auditAudio.currentSrc,
      }));
      row.continuitySeconds = after.time - before.time;
      row.decodedBytes = {
        before: before.bytes,
        after: after.bytes,
        delta: after.bytes === null ? null : after.bytes - before.bytes,
      };
      row.audio = after;
      assert.ok(
        row.continuitySeconds > 15 && !after.paused && !after.error && after.readyState >= 3,
        'Continuous real playback required',
      );
      if (row.decodedBytes.delta !== null) assert.ok(row.decodedBytes.delta > 0, 'Decoded bytes must advance');
      await page.evaluate(() => {
        window.auditPhase = 'pause';
      });
      await page.locator('app-player button').first().click();
      assert.equal(await page.evaluate(() => window.auditAudio.paused), true);
      await page.evaluate(() => {
        window.auditPhase = 'resume';
      });
      await page.locator('app-player button').first().click();
      await page
        .locator('app-player [role=status]')
        .filter({ hasText: /^Playing$/ })
        .waitFor({ timeout: 12000 });
      const resumed = await page.evaluate(() => window.auditAudio.currentTime);
      await new Promise(resolve => setTimeout(resolve, 1500));
      assert.ok(
        (await page.evaluate(() => window.auditAudio.currentTime)) > resumed,
        'Resume must advance the real clock',
      );
      row.pauseResume = true;
      row.played = true;
    } catch (error) {
      row.failure = error.message;
      row.playerStatus = await page.locator('app-player').innerText();
    }
    await page.evaluate(() => {
      window.auditPhase = 'stop';
    });
    await page.locator('app-player button').nth(1).click();
    row.stop = await page.evaluate(() => ({
      paused: window.auditAudio.paused,
      src: window.auditAudio.getAttribute('src'),
      audioElements: window.auditAudioCount,
    }));
    row.events = await page.evaluate(() => window.auditEvents);
    assert.ok(row.events.every(event => event.attemptId === row.attemptId && event.streamUrl === stream.url));
    assert.equal(row.stop.audioElements, 1);
    assert.equal(row.stop.paused, true);
  } catch (error) {
    row.played = false;
    row.failure = error.message;
  } finally {
    await Promise.allSettled(tasks);
    await context.close();
    row.finishedAt = new Date().toISOString();
  }
  console.log(
    JSON.stringify({
      stream: stream.id,
      attempt: number,
      played: row.played,
      continuity: row.continuitySeconds,
      failure: row.failure,
    }),
  );
  save();
  return row;
}
(async () => {
  await new Promise(resolve => server.listen(3061, '127.0.0.1', resolve));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.launch(),
        async close() {
          await this.browser.close();
        },
      };
  try {
    const candidates = catalog.stations
      .flatMap(station => station.streams.map(stream => ({ station, stream })))
      .sort((a, b) => ({ mp3: 0, aac: 1, hls: 2 })[a.stream.format] - { mp3: 0, aac: 1, hls: 2 }[b.stream.format]);
    for (const { station, stream } of candidates) {
      let latest = await probe(bridge.browser, station, stream, 1);
      let count = 1;
      if (!latest.played) {
        latest = await probe(bridge.browser, station, stream, 2);
        count++;
      }
      results.push({ stationId: station.id, stationName: station.name, streamId: stream.id, attempts: count, latest });
      save();
    }
  } finally {
    await bridge.close();
    server.close();
  }
  process.exit(0);
})().catch(error => {
  console.error(error);
  save();
  process.exit(1);
});
