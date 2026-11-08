// Opt-in browser acceptance against actual built data files served over HTTP. Not normal CI.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { createHash } = require('node:crypto');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(path.resolve('tmp/ci-tools/node_modules/playwright'));
const AxeBuilder = require(path.resolve('tmp/ci-tools/node_modules/@axe-core/playwright')).default;
const folder = process.env.RADIOBEE_INTEGRATION_EVIDENCE || 'documentation/integration-audit';
fs.mkdirSync(folder, { recursive: true });
const dataRoot = path.resolve(process.env.RADIOBEE_DATA_ROOT || '../radio-bee-data/dist/v1'),
  webRoot = process.env.RADIOBEE_WEB_ROOT || 'www';
const read = name => JSON.parse(fs.readFileSync(path.join(dataRoot, name)));
const discovery = read('discovery-stations.json'),
  stations = read('stations.json'),
  manifest = read('index.json');
const disabled = process.env.RADIOBEE_RECORDING_EXPECTED === 'false',
  offline = process.env.RADIOBEE_OFFLINE_EXPECTED === 'true';
const report = {
  startedAt: new Date().toISOString(),
  catalogVersion: manifest.catalogVersion,
  counts: manifest.counts,
  checks: [],
  audits: [],
  playback: [],
  requests: [],
};
const save = () => fs.writeFileSync(`${folder}/results.json`, JSON.stringify(report, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
async function choose(page, selector, label) {
  await page.locator(selector).click();
  await page.getByRole('radio', { name: label, exact: true }).click();
  await page.locator('ion-popover.radio-select-popover').waitFor({ state: 'hidden' });
}
async function audit(page, state) {
  const a = await new AxeBuilder({ page }).analyze();
  report.audits.push({ state, violations: a.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) });
  save();
  assert.equal(a.violations.length, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(
    await page
      .locator('a[href^="https:"]')
      .evaluateAll(links => links.filter(a => !a.closest('app-station-details-content')).length),
    0,
  );
}
async function fresh(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }),
    page = await context.newPage();
  await page.addInitScript(() => {
    const NativeAudio = Audio;
    window.audioCount = 0;
    window.events = [];
    window.trace = [];
    window.Audio = function (...args) {
      const a = new NativeAudio(...args);
      window.actualAudio = a;
      window.audioCount++;
      for (const name of ['playing', 'waiting', 'stalled', 'error', 'pause', 'ended'])
        a.addEventListener(name, () =>
          events.push({ name, at: performance.now(), time: a.currentTime, error: a.error?.code }),
        );
      a.addEventListener('radiobee-diagnostic', e => trace.push(e.detail));
      return a;
    };
  });
  return { context, page };
}
async function loaded(page, count) {
  // Windows localhost forwarding may appear just after WSL's listen callback.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await page.goto('http://localhost:3101/radio-bee/home');
      break;
    } catch (error) {
      if (attempt === 9 || !error.message.includes('ERR_CONNECTION_REFUSED')) throw error;
      await page.waitForTimeout(300);
    }
  }
  await page.waitForFunction(n => document.querySelectorAll('.station-card').length === n, count);
}
async function live(browser, id, injected = false) {
  const s = await fresh(browser),
    row = { id, injected, played: false, responses: [], failures: [] };
  report.playback.push(row);
  save();
  try {
    await loaded(s.page, 65);
    const stream = stations.find(s => s.id === id).streams[0];
    let aborted = false;
    if (injected)
      await s.page.route(stream.url, r => {
        if (!aborted) {
          aborted = true;
          return r.abort('connectionreset');
        }
        return r.continue();
      });
    const relevant = url =>
      ['radio.wavespb.com', 'radio.lotustechnologieslk.net', 'cp12.serverse.com'].includes(new URL(url).hostname) ||
      new URL(url).hostname.endsWith('.cloudfront.net');
    const safe = url => {
      const u = new URL(url);
      return u.origin + u.pathname;
    };
    s.page.on('response', r => {
      if (relevant(r.url()))
        row.responses.push({
          url: safe(r.url()),
          status: r.status(),
          mime: r.headers()['content-type'],
          cors: r.headers()['access-control-allow-origin'],
        });
    });
    s.page.on('requestfailed', r => {
      if (relevant(r.url())) row.failures.push({ url: safe(r.url()), error: r.failure()?.errorText });
    });
    await s.page.locator(`[data-station-id="${id}"] button.play`).click();
    try {
      await s.page.waitForFunction(
        () => actualAudio.currentTime > 1 && !actualAudio.paused && events.some(e => e.name === 'playing'),
        null,
        { timeout: 46000 },
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
      row.seconds = after.time - before.time;
      row.decodedBytes = after.bytes - before.bytes;
      row.played = row.seconds > 6 && row.decodedBytes > 0 && !after.paused;
    } catch {
      row.outcome = 'No continuous decoded playback within bounded observation';
    }
    Object.assign(
      row,
      await s.page.evaluate(() => ({
        events,
        trace,
        audioCount,
        engine: actualAudio.currentSrc.startsWith('blob:') ? 'MediaSource' : 'native',
      })),
    );
    assert.equal(row.audioCount, 1);
    if (row.played && id === 'sooriyan-srilanka') {
      if (!disabled) {
        await s.page.evaluate(() => {
          const create = URL.createObjectURL.bind(URL);
          URL.createObjectURL = blob => {
            if (blob instanceof Blob && blob.type.startsWith('audio/')) window.captureBlob = blob;
            return create(blob);
          };
        });
        const controls = s.page.locator('app-recording-controls');
        await controls.getByRole('button', { name: 'Record', exact: true }).click();
        if (await controls.locator('input[type=checkbox]').isVisible())
          await controls.locator('input[type=checkbox]').check();
        await controls.getByRole('button', { name: 'Start recording', exact: true }).click();
        await s.page.waitForFunction(
          () => document.querySelector('app-recording-controls [role=status]')?.textContent.includes('Recording ·'),
          null,
          { timeout: 15000 },
        );
        await s.page.waitForTimeout(4000);
        await controls.getByRole('button', { name: 'Stop recording', exact: true }).click();
        await controls.getByRole('button', { name: 'Export recording', exact: true }).waitFor();
        const downloading = s.page.waitForEvent('download');
        await controls.getByRole('button', { name: 'Export recording', exact: true }).click();
        await (await downloading).cancel();
        row.recording = await s.page.evaluate(async () => {
          const context = new AudioContext();
          try {
            const buffer = await context.decodeAudioData(await captureBlob.arrayBuffer());
            let squares = 0,
              samples = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              for (const value of buffer.getChannelData(ch)) {
                squares += value * value;
                samples++;
              }
            }
            return { bytes: captureBlob.size, duration: buffer.duration, rms: Math.sqrt(squares / samples) };
          } finally {
            await context.close();
          }
        });
        assert.ok(row.recording.duration > 2 && row.recording.rms > 0.001);
        await audit(s.page, 'recording-draft');
      }
      await audit(s.page, 'active-sooriyan');
      await s.page.locator('app-player input[type=range]').fill('0.35');
      await s.page.locator('app-player').getByRole('button', { name: 'Mute', exact: true }).click();
      assert.equal(await s.page.evaluate(() => actualAudio.muted && actualAudio.volume === 0.35), true);
      await s.page.locator('app-player').getByRole('button', { name: 'Pause', exact: true }).click();
      assert.equal(await s.page.evaluate(() => actualAudio.paused), true);
      await s.page.locator('app-player').getByRole('button', { name: 'Play', exact: true }).click();
      await s.page.waitForFunction(() => !actualAudio.paused && events.filter(e => e.name === 'playing').length >= 2);
      row.controls = true;
      assert.equal(await s.page.locator('app-recording-controls').count(), disabled ? 0 : 1);
      await s.page.locator('app-player').getByRole('button', { name: 'Stop', exact: true }).click();
      assert.equal(await s.page.evaluate(() => actualAudio.getAttribute('src')), null);
    }
  } finally {
    await s.context.close();
    save();
  }
}
(async () => {
  const { createPreview } = await import('./preview-discovery.mjs');
  let server;
  const start = async root => {
    server = createPreview({ webRoot, dataRoot: root, requests: report.requests });
    await new Promise(r => server.listen(3101, '127.0.0.1', r));
  };
  const close = () =>
    new Promise(r => {
      server.closeAllConnections();
      server.close(r);
    });
  const bridge = await require(path.resolve('tmp/browser-bridge-stage7.cjs')).attach(chromium);
  try {
    if (offline) {
      await start(dataRoot);
      const s = await fresh(bridge.browser);
      try {
        await s.page.route('**/__catalogue/**', r => r.abort('failed'));
        await loaded(s.page, 1);
        assert.equal(await s.page.locator('[data-station-id=offline-example]').count(), 1);
        assert.match(await s.page.locator('body').innerText(), /DEVELOPMENT SEED/);
        assert.equal(await s.page.locator('button.play').count(), 0);
        report.checks.push('tiny synthetic offline fixture works without production catalogue duplication');
        await audit(s.page, 'offline-development');
      } finally {
        await s.context.close();
      }
      return;
    }
    if (disabled) {
      await start(dataRoot);
      await live(bridge.browser, 'sooriyan-srilanka');
      assert.equal(report.playback[0].played, true);
      report.checks.push('recording-disabled real playback');
      return;
    }
    await start(path.resolve('tmp/integration-v1.4'));
    const s = await fresh(bridge.browser);
    try {
      await loaded(s.page, 24);
      assert.equal(
        report.requests.some(r => r.path === 'discovery-stations.json'),
        false,
      );
      report.checks.push('actual v1.4.0: 24 stations, 26 candidates; optional discovery absent without extra request');
      await close();
      await start(dataRoot);
      await s.page.reload();
      await s.page.waitForFunction(() => document.querySelectorAll('.station-card').length === 65);
      for (const record of discovery) {
        const card = s.page.locator(`[data-station-id="${record.id}"]`);
        assert.equal(await card.locator('h3').innerText(), record.name);
        assert.equal(await card.locator('button.play,a').count(), 0);
      }
      assert.equal(await s.page.locator('button.play').count(), 24);
      assert.equal(await s.page.locator('a[href^="https:"]').count(), 0);
      const response = await s.page.request.get('http://localhost:3101/__catalogue/v1/discovery-stations.json');
      report.discoveryHttpHash = hash(await response.body());
      report.discoveryBuiltHash = hash(fs.readFileSync(path.join(dataRoot, 'discovery-stations.json')));
      assert.equal(report.discoveryHttpHash, report.discoveryBuiltHash);
      report.checks.push(
        '65 network-loaded names; 41 discovery cards cannot play; exact built discovery bytes served over HTTP',
      );
      const annai = s.page.locator('[data-station-id=annai-kuzhithurai]');
      await annai.locator('.favorite').click();
      await annai.locator('.favorite[aria-pressed=true]').waitFor();
      await s.page.locator('[data-category=favorites]').click();
      assert.equal(await s.page.locator('.station-card').count(), 1);
      await s.page.locator('[data-category=all]').click();
      await s.page.locator('input[type=search]').fill('Kumari FM');
      assert.equal(await s.page.locator('.station-card').count(), 1);
      assert.equal(await s.page.locator('[data-station-id=air-nagercoil]').count(), 1);
      await s.page.locator('input[type=search]').fill('');
      await s.page.locator('.advanced summary').click();
      await choose(s.page, '[data-filter=country]', 'India');
      assert.equal(await s.page.locator('.filters ion-select').count(), 5);
      await choose(s.page, '[data-filter=country]', 'Sri Lanka');
      assert.equal(await s.page.locator('.filters ion-select').count(), 2);
      await choose(s.page, '[data-filter=language]', 'Tamil');
      assert.equal(await s.page.locator('[data-station-id=sooriyan-srilanka]').count(), 1);
      assert.equal(await s.page.locator('[data-station-id=vasantham-srilanka]').count(), 1);
      await s.page.locator('.filters button').click();
      assert.equal(await s.page.locator('.filters ion-select').count(), 2);
      await s.page.locator('.advanced summary').click();
      report.checks.push('data-owned AIR aliases; favorites; India hierarchy and Sri Lanka/Tamil filtering');
      await s.page.locator('.catalogue-info summary').click();
      await s.page.route('**/__catalogue/v1/discovery-stations.json', r => r.abort('failed'));
      await s.page.locator('.catalogue-info button').click();
      await s.page.locator('.notice[role=alert]').waitFor();
      assert.equal(await s.page.locator('.station-card').count(), 65);
      await s.page.unroute('**/__catalogue/v1/discovery-stations.json');
      report.checks.push('failed advertised discovery retains complete cached 65-record snapshot');
      await s.page.route('**/__catalogue/**', r => r.abort('failed'));
      await s.page.reload();
      await s.page.locator('.notice[role=alert]').waitFor();
      assert.equal(await s.page.locator('.station-card').count(), 65);
      assert.equal(await s.page.locator('[data-station-id=annai-kuzhithurai] .favorite[aria-pressed=true]').count(), 1);
      await s.page.unroute('**/__catalogue/**');
      report.checks.push('v1.5 complete snapshot and favorite survive offline reload');
      await s.page.reload();
      await s.page.waitForFunction(() => !document.querySelector('.notice[role=alert]'));
      for (const width of [375, 1440]) {
        await s.page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
        for (const theme of ['Light', 'Dark']) {
          await choose(s.page, '.language-select', 'English');
          await choose(s.page, '.theme-select', theme);
          for (const language of ['English', 'தமிழ்', 'संस्कृतम्']) {
            await choose(s.page, '.language-select', language);
            await audit(s.page, { width, theme, language });
            if (width === 375) await s.page.screenshot({ path: `${folder}/${theme}-${language}.png` });
            await s.page.locator('[data-station-id=annai-kuzhithurai] .details-button').click();
            await s.page.locator('app-station-details-content').waitFor();
            const link = s.page.locator('app-station-details-content a');
            assert.equal(await link.getAttribute('href'), 'https://zeno.fm/radio/annai-fm/');
            assert.equal(await link.getAttribute('target'), '_blank');
            assert.match(await link.getAttribute('rel'), /noopener/);
            await audit(s.page, { width, theme, language, state: 'details' });
            await s.page.keyboard.press('Escape');
            await s.page.locator('app-station-details-content').waitFor({ state: 'hidden' });
            assert.equal(
              await s.page
                .locator('[data-station-id=annai-kuzhithurai] .details-button')
                .evaluate(el => el === document.activeElement),
              true,
            );
          }
        }
      }
      assert.equal(
        report.requests.some(r => r.path.includes('catalog-development-seed')),
        false,
      );
      report.checks.push(
        'three languages, light/dark, mobile/desktop, provider links only in compact Details; Escape/focus restoration',
      );
    } finally {
      await s.context.close();
    }
    await live(bridge.browser, 'sooriyan-srilanka');
    await live(bridge.browser, 'air-nagercoil');
    await live(bridge.browser, 'air-nagercoil', true);
  } finally {
    report.completed = true;
    save();
    await bridge.close();
    if (server) await close();
  }
})()
  .then(() => {
    console.log(
      JSON.stringify({
        checks: report.checks,
        audits: report.audits.length,
        playback: report.playback.map(({ id, injected, played, seconds }) => ({ id, injected, played, seconds })),
      }),
    );
    process.exit(0);
  })
  .catch(error => {
    report.error = error.message;
    save();
    console.error(error);
    process.exit(1);
  });
