// Production artifact browser checks. Existing Playwright/axe only; never installs tools or mocks audio.
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const tools = path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules');
const { chromium } = require(path.join(tools, 'playwright'));
const AxeBuilder = require(path.join(tools, '@axe-core/playwright')).default;
const root = path.resolve('www'),
  port = 3062,
  report = [];
const published = JSON.parse(fs.readFileSync(process.env.RADIOBEE_CATALOG_SNAPSHOT || 'tmp/stage6-catalogue.json'));
const reviewed = JSON.parse(fs.readFileSync(process.env.RADIOBEE_REVIEWED_SNAPSHOT || 'tmp/stage6-reviewed.json'));
const screenshotDir = 'documentation/screenshots';
fs.mkdirSync(screenshotDir, { recursive: true });
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
async function contextFor(browser, snapshot, width, colorScheme) {
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
          ? snapshot.manifest
          : file.startsWith('i18n/')
            ? snapshot.localization[file.slice(5, -5)]
            : snapshot[file.replace('.json', '')],
    });
  });
  return context;
}
async function audit(page, state) {
  assert.equal(
    await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
    state.colorScheme === 'dark',
  );
  const axe = await new AxeBuilder({ page }).analyze();
  const result = {
    ...state,
    violations: axe.violations.map(v => ({
      id: v.id,
      nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })),
    })),
  };
  report.push(result);
  fs.writeFileSync('tmp/stage6-browser-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(axe.violations.length, 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}
async function details(page, state) {
  const card = page.locator('.station-card').first();
  const trigger = card.locator('.details-button');
  await trigger.scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  await trigger.click();
  const overlay = page.locator('ion-popover.station-details-popover');
  await overlay.locator('app-station-details-content').waitFor();
  assert.equal(await page.locator('app-station-details-content').count(), 1);
  const after = await card.boundingBox();
  assert.deepEqual(after, before);
  assert.doesNotMatch(await overlay.innerText(), /verificationStatus|rightsStatus|sourceId|https:\/\//);
  await audit(page, { ...state, state: 'details' });
  await page.screenshot({
    path: `${screenshotDir}/stage6-details-${state.width}-${state.colorScheme}-${state.locale}.png`,
  });
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
  if (state.width === 375 && state.locale === 'en' && state.colorScheme === 'light') {
    for (const method of ['close', 'outside', 'back']) {
      await trigger.click();
      await overlay.locator('app-station-details-content').waitFor();
      if (method === 'close') await overlay.locator('button.close').click();
      if (method === 'outside') await overlay.locator('ion-backdrop').click({ position: { x: 4, y: 4 } });
      if (method === 'back')
        await page.evaluate(() => {
          const handlers = [];
          document.dispatchEvent(
            new CustomEvent('ionBackButton', {
              detail: { register: (priority, handler) => handlers.push({ priority, handler }) },
            }),
          );
          handlers.sort((a, b) => b.priority - a.priority)[0]?.handler();
        });
      await overlay.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    }
  }
}
(async () => {
  await new Promise(resolve => server.listen(port, '0.0.0.0', resolve));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.launch(),
        close() {
          return this.browser.close();
        },
      };
  try {
    for (const colorScheme of ['light', 'dark'])
      for (const width of [375, 820, 1440]) {
        const context = await contextFor(bridge.browser, published, width, colorScheme);
        const page = await context.newPage();
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(`http://localhost:${port}/radio-bee/home`);
        await page.locator('.station-card').nth(87).waitFor({ state: 'attached' });
        assert.equal(await page.locator('button.play').count(), 0);
        assert.equal(await page.locator('.development-lab').isVisible(), false);
        for (const locale of ['en', 'ta', 'sa']) {
          await page.locator('.language-label select').selectOption(locale);
          await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
          const first = await page.locator('.thumbnail').first().boundingBox();
          if (width === 375) assert.ok(first.y < 600, `First thumbnail too low: ${first.y}`);
          await page.waitForFunction(() =>
            [...document.querySelectorAll('ion-icon')].some(icon => icon.shadowRoot?.querySelector('svg')),
          );
          await audit(page, { width, colorScheme, locale, state: 'browse', firstThumbnail: first.y });
          await page.screenshot({ path: `${screenshotDir}/stage6-browse-${width}-${colorScheme}-${locale}.png` });
          await details(page, { width, colorScheme, locale });
          await page.locator('.station-card .favorite').first().click();
          await page.locator('[data-category=favorites]').click();
          assert.equal(await page.locator('.station-card').count(), 1);
          await audit(page, { width, colorScheme, locale, state: 'favorites' });
          await page.locator('.station-card .favorite').first().click();
          await page.locator('[data-category=all]').click();
        }
        await context.close();
      }
    // Proposed reviewed metadata only; production player + genuine direct broadcaster audio.
    for (const colorScheme of ['light', 'dark']) {
      const context = await contextFor(bridge.browser, reviewed, 375, colorScheme);
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        const Native = Audio;
        window.radioBeeAudioCount = 0;
        window.Audio = function (...args) {
          const audio = new Native(...args);
          window.radioBeeAudioCount++;
          window.radioBeeAudio = audio;
          return audio;
        };
      });
      await page.goto(`http://localhost:${port}/radio-bee/home`);
      await page.locator('[data-category=listenNow]').click();
      const card = page.locator('[data-station-id=j1-hits]');
      await card.waitFor();
      assert.equal(await page.locator('.station-card').count(), 2);
      assert.equal(await page.locator('.development-lab').isVisible(), false);
      await card.locator('.play').click();
      await page.waitForFunction(() => window.radioBeeAudio?.currentTime > 1 && !window.radioBeeAudio.paused, null, {
        timeout: 30000,
      });
      const player = page.locator('app-player');
      await player
        .locator('[role=status]')
        .filter({ hasText: /^Playing$/ })
        .waitFor();
      const before = await page.evaluate(() => window.radioBeeAudio.currentTime);
      await new Promise(resolve => setTimeout(resolve, 20000));
      const continuity = (await page.evaluate(() => window.radioBeeAudio.currentTime)) - before;
      assert.ok(continuity > 15);
      assert.equal(await card.locator('.play').innerText(), 'Pause');
      await page.screenshot({ path: `${screenshotDir}/stage6-card-pause-${colorScheme}.png` });
      await card.locator('.play').click();
      assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), true);
      await page.screenshot({ path: `${screenshotDir}/stage6-card-play-${colorScheme}.png` });
      await player.locator('button').first().click();
      await page.waitForFunction(() => !window.radioBeeAudio.paused);
      await player.locator('input').fill('0.35');
      await player.locator('button').last().click();
      assert.equal(await page.evaluate(() => window.radioBeeAudio.muted), true);
      await player.locator('button').last().click();
      assert.equal(await page.evaluate(() => window.radioBeeAudio.volume), 0.35);
      assert.equal(await page.evaluate(() => window.radioBeeAudioCount), 1);
      await page.getByRole('searchbox').fill('J1 HITS');
      assert.equal(await page.locator('.station-card').count(), 1);
      assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
      await page.getByRole('searchbox').fill('');
      await details(page, { width: 375, colorScheme, locale: 'en' });
      assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
      await page.locator('.advanced > summary').click();
      await page.locator('.filters select').first().selectOption('LK');
      assert.equal(await page.locator('.station-card').count(), 0);
      assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
      await page.locator('.filters button').click();
      await page.locator('.advanced > summary').click();
      const previousSrc = await page.evaluate(() => window.radioBeeAudio.currentSrc);
      await page.locator('[data-station-id=j1-gold] .play').click();
      await page.waitForFunction(
        () => window.radioBeeAudio.currentSrc.includes('J1GOLD') && !window.radioBeeAudio.paused,
        null,
        { timeout: 30000 },
      );
      assert.notEqual(await page.evaluate(() => window.radioBeeAudio.currentSrc), previousSrc);
      assert.equal(await page.evaluate(() => window.radioBeeAudio.volume), 0.35);
      assert.equal(await page.evaluate(() => window.radioBeeAudioCount), 1);
      assert.equal(await card.locator('.play').innerText(), 'Play');
      await card.locator('.play').click();
      await page.waitForFunction(
        () => window.radioBeeAudio.currentSrc.includes('J1HITS') && !window.radioBeeAudio.paused,
        null,
        { timeout: 30000 },
      );
      assert.equal(page.url(), `http://localhost:${port}/radio-bee/home`);
      for (const locale of ['en', 'ta', 'sa']) {
        await page.locator('.language-label select').selectOption(locale);
        for (const width of [375, 820, 1440]) {
          await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
          await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
          await audit(page, { width, colorScheme, locale, state: 'actual-production-player', continuity });
          await page.screenshot({ path: `${screenshotDir}/stage6-player-${width}-${colorScheme}-${locale}.png` });
        }
      }
      await player.locator('button').nth(1).click();
      assert.equal(await player.isVisible(), false);
      assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), true);
      await context.close();
    }
    console.log('STAGE6_BROWSER_PASSED');
  } finally {
    await bridge.close();
    server.close();
  }
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
