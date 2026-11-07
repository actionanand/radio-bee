// Unmodified production bundle + an unchanged capture of public catalogue 1.3.0.
// Real Audio/hls.js only; network faults are explicitly separated from successful station probes.
const fs = require('fs'),
  path = require('path'),
  http = require('http'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const tools = path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules');
const { chromium } = require(path.join(tools, 'playwright'));
const AxeBuilder = require(path.join(tools, '@axe-core/playwright')).default;
const catalog = JSON.parse(fs.readFileSync(process.env.RADIOBEE_CATALOG_SNAPSHOT || 'tmp/stage7-catalogue.json'));
assert.equal(catalog.manifest.catalogVersion, '1.3.0');
const root = path.resolve('www'),
  port = 3072;
const report = {
  catalogVersion: catalog.manifest.catalogVersion,
  policy: { AllowUnverified: true, CheckVerificationStatus: false, CheckRightsStatus: false },
  ui: [],
  stationProbes: [],
  controls: {},
  notes: [
    'Metadata capture is unchanged; no rights or verification values are rewritten.',
    'Fault injection is a separate scenario and is not evidence of broadcaster endpoint failure.',
  ],
};
const folder = 'documentation/stage7';
fs.mkdirSync(folder, { recursive: true });
const save = () => fs.writeFileSync(folder + '/browser-results.json', JSON.stringify(report, null, 2) + '\n');
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
async function context(browser, width = 1440, colorScheme = 'light') {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 667 : 900 },
    colorScheme,
    reducedMotion: 'reduce',
  });
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
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const Native = Audio;
    window.actualEvents = [];
    window.actualSourceLoads = [];
    window.actualAudioCount = 0;
    window.Audio = function (...args) {
      const audio = new Native(...args);
      window.actualAudio = audio;
      window.actualAudioCount++;
      const load = audio.load.bind(audio);
      audio.load = () => {
        const src = audio.getAttribute('src');
        if (src) window.actualSourceLoads.push(src);
        return load();
      };
      for (const event of ['loadstart', 'playing', 'pause', 'waiting', 'error', 'emptied'])
        audio.addEventListener(event, () =>
          window.actualEvents.push({
            event,
            at: new Date().toISOString(),
            src: audio.currentSrc,
            time: audio.currentTime,
            error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
          }),
        );
      return audio;
    };
  });
  await page.goto(`http://localhost:${port}/radio-bee/home`);
  await page.locator('.station-card').nth(87).waitFor({ state: 'attached' });
  assert.equal(await page.locator('button.play').count(), 25);
  assert.equal(await page.locator('.unavailable').count(), 63);
  assert.equal(await page.locator('.development-lab').isVisible(), false);
  return { context, page };
}
async function audit(page, state) {
  assert.equal(
    await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
    state.colorScheme === 'dark',
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="https:"]')]
        .filter(link => !link.closest('app-station-details-content'))
        .map(link => link.href),
    ),
    [],
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const axe = await new AxeBuilder({ page }).analyze();
  const row = { ...state, violations: axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
  report.ui.push(row);
  save();
  console.log(JSON.stringify(row));
  assert.equal(row.violations.length, 0);
}
async function play(page, id) {
  await page.locator(`[data-station-id=${id}] button.play`).click();
  await page.waitForFunction(() => window.actualAudio.currentTime > 1 && !window.actualAudio.paused, null, {
    timeout: 30000,
  });
  await page.locator(`[data-station-id=${id}].is-playing`).waitFor();
}
const snapshot = page =>
  page.evaluate(() => ({
    time: window.actualAudio.currentTime,
    src: window.actualAudio.currentSrc,
    paused: window.actualAudio.paused,
    readyState: window.actualAudio.readyState,
    bytes: window.actualAudio.webkitAudioDecodedByteCount ?? null,
    error: window.actualAudio.error
      ? { code: window.actualAudio.error.code, message: window.actualAudio.error.message }
      : null,
  }));
async function stationProbe(browser, id) {
  const { context: ctx, page } = await context(browser);
  const row = { stationId: id, startedAt: new Date().toISOString(), responses: [], failures: [], played: false };
  report.stationProbes.push(row);
  const pending = [];
  const station = catalog.stations.find(station => station.id === id),
    hosts = station.streams.map(stream => new URL(stream.url).hostname);
  const media = url => hosts.includes(new URL(url).hostname) || new URL(url).hostname.endsWith('.cloudfront.net');
  page.on('response', response => {
    if (media(response.url()))
      pending.push(
        (async () => {
          const h = await response.allHeaders();
          row.responses.push({
            url: response.url(),
            status: response.status(),
            mime: h['content-type'],
            cors: h['access-control-allow-origin'] ?? null,
          });
        })(),
      );
  });
  page.on('requestfailed', request => {
    if (media(request.url())) row.failures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  try {
    await play(page, id);
    const before = await snapshot(page);
    await new Promise(resolve => setTimeout(resolve, 20000));
    const after = await snapshot(page);
    row.continuitySeconds = after.time - before.time;
    row.decodedByteIncrease = after.bytes === null ? null : after.bytes - before.bytes;
    row.audio = after;
    assert.ok(row.continuitySeconds > 15 && !after.paused && !after.error);
    if (row.decodedByteIncrease !== null) assert.ok(row.decodedByteIncrease > 0);
    assert.equal(
      await page
        .locator('app-player')
        .innerText()
        .then(text => text.includes('Local technical test')),
      false,
    );
    row.sourceLoads = await page.evaluate(() => window.actualSourceLoads);
    if (id === 'sooriyan-srilanka')
      assert.equal(row.sourceLoads[0], station.streams.find(stream => stream.id === 'sooriyan-official-candidate').url);
    row.played = true;
  } catch (error) {
    row.failure = error.message;
  } finally {
    const stop = page.locator('app-player button').nth(1);
    if (await stop.isVisible()) await stop.click();
    row.events = await page.evaluate(() => window.actualEvents);
    row.audioElements = await page.evaluate(() => window.actualAudioCount);
    await Promise.allSettled(pending);
    await ctx.close();
    save();
  }
  console.log(
    JSON.stringify({ stationProbe: id, played: row.played, continuity: row.continuitySeconds, failure: row.failure }),
  );
}
(async () => {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.launch(),
        async close() {
          await this.browser.close();
        },
      };
  try {
    for (const colorScheme of ['light', 'dark'])
      for (const width of [375, 820, 1440]) {
        const { context: ctx, page } = await context(bridge.browser, width, colorScheme);
        try {
          for (const locale of ['en', 'ta', 'sa']) {
            await page.locator('.language-label select').selectOption(locale);
            await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
            await audit(page, { state: 'browse-25-play-63-unavailable', width, colorScheme, locale });
            if (width === 375) assert.ok((await page.locator('.thumbnail').first().boundingBox()).y < 600);
            await page.locator('[data-category=listenNow]').click();
            assert.equal(await page.locator('.station-card').count(), 25);
            await audit(page, { state: 'listen-now', width, colorScheme, locale });
            const card = page.locator('.station-card').first(),
              trigger = card.locator('.details-button');
            await trigger.scrollIntoViewIfNeeded();
            const before = await card.boundingBox();
            await trigger.click();
            const popup = page.locator('ion-popover app-station-details-content');
            await popup.waitFor();
            assert.deepEqual(await card.boundingBox(), before);
            await audit(page, { state: 'details-only-website', width, colorScheme, locale });
            await page.keyboard.press('Escape');
            await popup.waitFor({ state: 'hidden' });
            assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
            await page.locator('[data-category=all]').click();
            await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
            if (locale === 'en' || width === 375)
              await page.screenshot({ path: `${folder}/ui-${width}-${colorScheme}-${locale}.png` });
          }
        } finally {
          await ctx.close();
        }
      }
    for (const id of ['sooriyan-srilanka', 'vasantham-srilanka', 'air-nagercoil'])
      await stationProbe(bridge.browser, id);
    const { context: ctx, page } = await context(bridge.browser);
    try {
      await play(page, 'sooriyan-srilanka');
      const sooriyan = page.locator('[data-station-id=sooriyan-srilanka]'),
        player = page.locator('app-player');
      const retainedSrc = (await snapshot(page)).src;
      await sooriyan.locator('button.play').click();
      assert.equal(await page.evaluate(() => window.actualAudio.paused), true);
      assert.equal((await snapshot(page)).src, retainedSrc);
      await player.locator('button').first().click();
      await sooriyan
        .locator('.on-air')
        .filter({ hasText: /^Playing$/ })
        .waitFor();
      await player.locator('input').fill('0.35');
      await player.locator('button').last().click();
      assert.equal(await page.evaluate(() => window.actualAudio.muted), true);
      await play(page, 'vasantham-srilanka');
      assert.ok((await snapshot(page)).src.includes('vasanthamfm'));
      assert.equal(await page.evaluate(() => window.actualAudio.volume), 0.35);
      assert.equal(await page.evaluate(() => window.actualAudio.muted), true);
      await player.locator('button').last().click();
      assert.equal(await page.evaluate(() => window.actualAudio.muted), false);
      assert.equal(await page.evaluate(() => window.actualAudioCount), 1);
      assert.equal(await sooriyan.locator('button.play').innerText(), 'Play');
      for (const colorScheme of ['light', 'dark'])
        for (const width of [375, 820, 1440])
          for (const locale of ['en', 'ta', 'sa']) {
            await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
            await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
            await page.locator('.language-label select').selectOption(locale);
            await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
            assert.equal(await page.evaluate(() => window.actualAudio.paused), false);
            await audit(page, { state: 'production-player', width, colorScheme, locale });
            if (width === 375 && locale === 'ta')
              await page.screenshot({ path: `${folder}/player-${colorScheme}-ta.png` });
          }
      await page.locator('.language-label select').selectOption('en');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1440, height: 900 });
      await player.locator('button').nth(1).click();
      assert.equal(await page.evaluate(() => window.actualAudio.paused), true);
      assert.equal(await page.evaluate(() => window.actualAudio.getAttribute('src')), null);
      const source = catalog.stations.find(s => s.id === 'sooriyan-srilanka');
      let injectFailure = true;
      await ctx.route(source.streams.find(s => s.id === 'sooriyan-official-candidate').url, route =>
        injectFailure ? route.abort('failed') : route.continue(),
      );
      await ctx.route(source.streams.find(s => s.id === 'sooriyan-candidate').url, route =>
        injectFailure ? route.abort('failed') : route.continue(),
      );
      const offset = await page.evaluate(() => window.actualSourceLoads.length);
      await sooriyan.locator('button.play').click();
      await player.locator('[role=alert]').waitFor({ timeout: 30000 });
      const faultLoads = await page.evaluate(offset => window.actualSourceLoads.slice(offset), offset);
      assert.deepEqual(faultLoads, [
        source.streams.find(s => s.id === 'sooriyan-official-candidate').url,
        source.streams.find(s => s.id === 'sooriyan-candidate').url,
      ]);
      assert.equal(await sooriyan.locator('button.play').innerText(), 'Retry');
      await audit(page, { state: 'injected-failures-retry', width: 1440, colorScheme: 'light', locale: 'en' });
      injectFailure = false;
      await sooriyan.locator('button.play').click();
      await page.waitForFunction(() => window.actualAudio.currentTime > 1 && !window.actualAudio.paused, null, {
        timeout: 30000,
      });
      await sooriyan
        .locator('.on-air')
        .filter({ hasText: /^Playing$/ })
        .waitFor();
      assert.equal((await snapshot(page)).src, source.streams.find(s => s.id === 'sooriyan-official-candidate').url);
      await player.locator('button').nth(1).click();
      assert.equal(await player.isVisible(), false);
      assert.equal(await page.evaluate(() => window.actualAudio.paused), true);
      assert.equal(page.url(), `http://localhost:${port}/radio-bee/home`);
      report.controls = {
        passed: true,
        audioElements: await page.evaluate(() => window.actualAudioCount),
        faultInjection: {
          description:
            'Both candidate URLs deliberately blocked until terminal error, then unblocked for explicit Retry; not a source availability finding',
          sourceLoads: faultLoads,
        },
        events: await page.evaluate(() => window.actualEvents),
      };
      save();
    } finally {
      await ctx.close();
    }
    console.log('STAGE7_PRODUCTION_BROWSER_PASSED');
  } finally {
    await bridge.close();
    server.close();
  }
  process.exit(0);
})().catch(error => {
  report.error = error.message;
  save();
  console.error(error);
  process.exit(1);
});
