// Manual, opt-in live checks. Never part of CI; never substitutes media events or relays audio.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(path.resolve('tmp/ci-tools/node_modules/playwright'));
const AxeBuilder = require(path.resolve('tmp/ci-tools/node_modules/@axe-core/playwright')).default;
const root = path.resolve(process.env.RADIOBEE_WEB_ROOT || 'www');
const folder = process.env.RADIOBEE_STAGE9_EVIDENCE || 'documentation/stage9';
const enabled = process.env.RADIOBEE_RECORDING_EXPECTED !== 'false';
fs.mkdirSync(folder, { recursive: true });
const catalog = JSON.parse(fs.readFileSync('tmp/stage9-catalogue.json'));
const air = catalog.stations.find(s => s.id === 'air-nagercoil');
assert.ok(air?.streams.length === 1, 'Review the current published AIR candidate before running');
const url = air.streams[0].url;
const safe = input => {
  const u = new URL(input);
  return u.origin + u.pathname;
};
const report = {
  startedAt: new Date().toISOString(),
  catalogVersion: catalog.manifest.catalogVersion,
  stations: catalog.stations.length,
  streams: catalog.stations.reduce((n, s) => n + s.streams.length, 0),
  recordingEnabled: enabled,
  attempts: [],
  audits: [],
};
const save = () => fs.writeFileSync(`${folder}/results.json`, JSON.stringify(report, null, 2) + '\n');
const server = http.createServer((req, res) => {
  let file = path.resolve(root, decodeURI(req.url.split('?')[0]).replace(/^\/radio-bee\//, '') || 'index.html');
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }[path.extname(file)] || 'text/html',
  );
  res.end(fs.readFileSync(file));
});
async function open(browser, label, injection = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const row = { label, injectedFailure: injection || null, responses: [], failures: [], played: false };
  report.attempts.push(row);
  save();
  await page.addInitScript(() => {
    const NativeAudio = Audio;
    window.audioCount = 0;
    window.mediaEvents = [];
    window.transitions = [];
    window.microphoneRequests = 0;
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.actualAudio = audio;
      window.audioCount++;
      for (const name of [
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
        audio.addEventListener(name, () =>
          window.mediaEvents.push({
            name,
            at: performance.now(),
            time: audio.currentTime,
            ready: audio.readyState,
            paused: audio.paused,
            error: audio.error?.code,
          }),
        );
      audio.addEventListener('radiobee-diagnostic', event => window.transitions.push(event.detail));
      return audio;
    };
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        window.microphoneRequests++;
        throw Error('Unexpected microphone request');
      };
  });
  if (injection) {
    let requests = 0;
    await page.route(url, route => {
      requests++;
      if (injection === 'persistent' || requests === 1) return route.abort('connectionreset');
      if (injection === 'hold') return; // Deliberately pending network request for the accessibility audit; closed with its context.
      return route.continue();
    });
  }
  const relevant = input =>
    ['radio.wavespb.com', 'radio.lotustechnologieslk.net', 'cp12.serverse.com'].includes(new URL(input).hostname) ||
    new URL(input).hostname.endsWith('.cloudfront.net');
  page.on('response', response => {
    if (relevant(response.url()))
      row.responses.push({
        url: safe(response.url()),
        status: response.status(),
        mime: response.headers()['content-type'],
        cors: response.headers()['access-control-allow-origin'],
        redirectedFrom: response.request().redirectedFrom() ? safe(response.request().redirectedFrom().url()) : null,
      });
  });
  page.on('requestfailed', request => {
    if (relevant(request.url())) row.failures.push({ url: safe(request.url()), error: request.failure()?.errorText });
  });
  await page.goto('http://localhost:3091/radio-bee/home');
  await page.waitForFunction(
    count => document.querySelectorAll('.station-card').length === count,
    catalog.stations.length,
  );
  return { context, page, row };
}
async function collect(s) {
  Object.assign(
    s.row,
    await s.page.evaluate(() => ({
      mediaEvents,
      transitions,
      audioCount,
      microphoneRequests,
      final: {
        paused: actualAudio.paused,
        ready: actualAudio.readyState,
        error: actualAudio.error?.code,
        bytes: actualAudio.webkitAudioDecodedByteCount,
        time: actualAudio.currentTime,
        engine: actualAudio.currentSrc.startsWith('blob:') ? 'MediaSource' : 'native',
      },
    })),
  );
  assert.equal(s.row.audioCount, 1);
  assert.equal(s.row.microphoneRequests, 0);
  save();
}
async function start(s, id = 'air-nagercoil') {
  await s.page.locator(`[data-station-id="${id}"] button.play`).click();
}
async function continuity(s) {
  try {
    await s.page.waitForFunction(
      () =>
        actualAudio.currentTime > 1 &&
        !actualAudio.paused &&
        actualAudio.readyState >= 2 &&
        mediaEvents.some(e => e.name === 'playing'),
      null,
      { timeout: 47000 },
    );
    const before = await s.page.evaluate(() => ({
      time: actualAudio.currentTime,
      bytes: actualAudio.webkitAudioDecodedByteCount,
    }));
    await s.page.waitForTimeout(8000);
    const after = await s.page.evaluate(() => ({
      time: actualAudio.currentTime,
      bytes: actualAudio.webkitAudioDecodedByteCount,
      paused: actualAudio.paused,
    }));
    s.row.continuitySeconds = after.time - before.time;
    s.row.decodedBytes = after.bytes - before.bytes;
    s.row.played = s.row.continuitySeconds > 6 && s.row.decodedBytes > 0 && !after.paused;
  } catch {
    s.row.outcome = 'No continuous decoded playback within the bounded observation window';
  }
  await collect(s);
}
async function audit(s, state) {
  const result = await new AxeBuilder({ page: s.page }).analyze();
  const row = { state, violations: result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })) };
  report.audits.push(row);
  save();
  assert.deepEqual(row.violations, []);
  assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(
    await s.page
      .locator('a[href^="https:"]')
      .evaluateAll(links => links.filter(a => !a.closest('app-station-details-content')).length),
    0,
  );
}
async function choose(page, selector, name) {
  await page.locator(selector).click();
  await page.getByRole('radio', { name, exact: true }).click();
  await page.locator('ion-popover.radio-select-popover').waitFor({ state: 'hidden' });
}
(async () => {
  await new Promise(resolve => server.listen(3091, '127.0.0.1', resolve));
  const bridge = await require(path.resolve('tmp/browser-bridge-stage7.cjs')).attach(chromium);
  try {
    const modes = process.env.RADIOBEE_STAGE9_CASES?.split(',') || [
      'cold1',
      'cold2',
      'cold3',
      'first-failure',
      'persistent',
      'stop',
      'pause',
      'switch',
      'sooriyan',
      'vasantham',
      'reconnecting-en',
      'reconnecting-ta',
      'reconnecting-sa',
      'accessibility',
    ];
    for (const mode of modes) {
      const injection = mode.startsWith('reconnecting-')
        ? 'hold'
        : mode === 'persistent'
          ? 'persistent'
          : ['first-failure', 'stop', 'pause', 'switch'].includes(mode)
            ? 'first'
            : '';
      const s = await open(bridge.browser, mode, injection);
      try {
        if (mode === 'accessibility') {
          for (const width of [375, 1440]) {
            await s.page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
            for (const theme of ['Light', 'Dark', 'Automatic']) {
              await choose(s.page, '.language-select', 'English');
              await choose(s.page, '.theme-select', theme);
              for (const language of ['English', 'தமிழ்', 'संस्कृतम्']) {
                await choose(s.page, '.language-select', language);
                await audit(s, { width, theme, language });
                if (width === 375 && theme !== 'Automatic')
                  await s.page.screenshot({ path: `${folder}/${theme}-${language}.png` });
              }
            }
          }
          continue;
        }
        const reconnectingLanguage = {
          'reconnecting-en': 'English',
          'reconnecting-ta': 'தமிழ்',
          'reconnecting-sa': 'संस्कृतम्',
        }[mode];
        if (reconnectingLanguage) {
          await s.page.setViewportSize({ width: 375, height: 667 });
          await choose(s.page, '.theme-select', 'Dark');
          await choose(s.page, '.language-select', reconnectingLanguage);
        }
        await start(
          s,
          mode === 'sooriyan' ? 'sooriyan-srilanka' : mode === 'vasantham' ? 'vasantham-srilanka' : 'air-nagercoil',
        );
        if (reconnectingLanguage) {
          await s.page.waitForFunction(() => transitions.filter(t => t.result === 'attempt').length === 2);
          await audit(s, { state: 'reconnecting', language: reconnectingLanguage, width: 375, theme: 'Dark' });
          assert.equal(await s.page.locator('app-player [role="alert"]').count(), 0);
          await s.page.screenshot({ path: `${folder}/${mode}.png` });
          await collect(s);
          continue;
        }
        if (['stop', 'pause', 'switch'].includes(mode)) {
          await s.page.waitForFunction(() => transitions.some(t => t.result === 'scheduled' && t.delayMs > 0));
          if (mode === 'switch') {
            await s.page.locator('[data-station-id="sooriyan-srilanka"] button.play').click();
            await continuity(s);
            assert.equal(
              s.row.transitions.filter(t => t.stationId === 'air-nagercoil' && t.result === 'attempt').length,
              1,
            );
            s.row.previousRecoveryCancelled = true;
          } else {
            await s.page
              .locator('app-player')
              .getByRole('button', { name: mode === 'stop' ? 'Stop' : 'Pause', exact: true })
              .click();
            await s.page.waitForTimeout(1500);
            await collect(s);
            assert.equal(s.row.transitions.filter(t => t.result === 'attempt').length, 1);
            assert.equal(s.row.final.paused, true);
            s.row.cancelled = true;
          }
        } else if (mode === 'persistent') {
          await s.page.locator('app-player [role="alert"]').waitFor({ timeout: 47000 });
          await s.page.waitForTimeout(1500);
          await collect(s);
          assert.equal(s.row.transitions.filter(t => t.result === 'attempt').length, 2);
          s.row.exhausted = true;
          await audit(s, 'persistent-error');
          await s.page.screenshot({ path: `${folder}/persistent-error.png` });
        } else {
          await continuity(s);
          if (s.row.played && mode === 'sooriyan') {
            await audit(s, 'playing');
            await s.page.locator('app-player input[type="range"]').fill('0.35');
            await s.page.locator('app-player').getByRole('button', { name: 'Mute', exact: true }).click();
            assert.equal(await s.page.evaluate(() => actualAudio.muted), true);
            assert.equal(await s.page.evaluate(() => actualAudio.volume), 0.35);
            await s.page.locator('app-player').getByRole('button', { name: 'Pause', exact: true }).click();
            assert.equal(await s.page.evaluate(() => actualAudio.paused), true);
            await s.page.locator('app-player').getByRole('button', { name: 'Play', exact: true }).click();
            await s.page.waitForFunction(
              () => !actualAudio.paused && mediaEvents.filter(e => e.name === 'playing').length >= 2,
            );
            s.row.pauseResume = true;
            await s.page.locator('app-player').getByRole('button', { name: 'Stop', exact: true }).click();
            assert.equal(await s.page.evaluate(() => actualAudio.getAttribute('src')), null);
            s.row.stopClearedSource = true;
          }
          if (!enabled) assert.equal(await s.page.locator('app-recording-controls').count(), 0);
        }
      } catch (error) {
        s.row.testError = error.message;
        await collect(s).catch(() => {});
      } finally {
        await s.context.close();
        save();
      }
    }
    report.completed = true;
    report.validationPassed =
      report.attempts.every(row => !row.testError) && report.audits.every(row => !row.violations.length);
    save();
    if (!report.validationPassed) throw Error('Browser assertions failed; see the individually scoped results');
    console.log(
      JSON.stringify({
        attempts: report.attempts.map(({ label, played, testError, exhausted, cancelled }) => ({
          label,
          played,
          testError,
          exhausted,
          cancelled,
        })),
        audits: report.audits.length,
      }),
    );
  } finally {
    await bridge.close();
    server.close();
  }
})()
  .then(() => process.exit(0))
  .catch(error => {
    report.error = error.message;
    save();
    console.error(error);
    process.exit(1);
  });
