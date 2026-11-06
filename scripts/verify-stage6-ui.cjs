// Production artifact browser checks. Existing Playwright/axe only; never installs tools or mocks audio.
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const tools = path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules');
const { chromium } = require(path.join(tools, 'playwright'));
const AxeBuilder = require(path.join(tools, '@axe-core/playwright')).default;
const technical = process.env.RADIOBEE_TECHNICAL_PLAYER === '1';
const root = path.resolve(process.env.RADIOBEE_WEB_ROOT || 'www'),
  port = Number(process.env.RADIOBEE_UI_PORT || 3062),
  report = [];
const published = JSON.parse(fs.readFileSync(process.env.RADIOBEE_CATALOG_SNAPSHOT || 'tmp/stage6-catalogue.json'));
const screenshotDir = 'documentation/screenshots';
const reportFile = process.env.RADIOBEE_UI_REPORT || 'tmp/stage6-browser-results.json';
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
  const boundary = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="https:"]')]
      .filter(link => !link.closest('app-station-details-content'))
      .map(link => link.href),
  );
  assert.deepEqual(boundary, [], 'Broadcaster links must exist only inside station details');
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
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
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
async function stressDetails(page, state) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const cards = page.locator('.station-card');
  const ids = await cards.evaluateAll(cards => cards.slice(0, 3).map(card => card.getAttribute('data-station-id')));
  const trigger = id => page.locator(`[data-station-id="${id}"] .details-button`);
  const overlay = () => page.locator('ion-popover.station-details-popover:not(.overlay-hidden)');
  // Synchronous native clicks deliberately bypass Playwright's wait-for-animation between actions.
  await cards.evaluateAll(cards => cards.slice(0, 3).forEach(card => card.querySelector('.details-button').click()));
  await overlay()
    .locator('h2')
    .filter({ hasText: await cards.nth(2).locator('h3').innerText() })
    .waitFor();
  assert.equal(await page.locator('ion-popover.station-details-popover').count(), 1);
  const target = await trigger(ids[2]).boundingBox();
  const popup = await overlay().locator('app-station-details-content').boundingBox();
  if (state.width === 1440)
    assert.ok(
      Math.abs(popup.x + popup.width - (target.x + target.width)) < 32,
      'Popup must anchor to the newest button',
    );
  await page.evaluate(id => {
    document.querySelector('ion-popover app-station-details-content button.close').click();
    document.querySelector(`[data-station-id="${id}"] .details-button`).click();
  }, ids[0]);
  await overlay()
    .locator('h2')
    .filter({ hasText: await cards.nth(0).locator('h3').innerText() })
    .waitFor();
  await page.keyboard.press('Escape');
  await trigger(ids[1]).evaluate(button => button.click());
  await overlay()
    .locator('h2')
    .filter({ hasText: await cards.nth(1).locator('h3').innerText() })
    .waitFor();
  await overlay().locator('button.close').click();
  await page.waitForFunction(() => !document.querySelector('ion-popover.station-details-popover'));
  assert.equal(await trigger(ids[1]).evaluate(button => document.activeElement === button), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await audit(page, { ...state, state: 'rapid-details-switching-and-reopen' });
}
(async () => {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.launch(),
        close() {
          return this.browser.close();
        },
      };
  try {
    if (!technical)
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
            if (width !== 820) await stressDetails(page, { width, colorScheme, locale });
          }
          await context.close();
        }
    // Actual audio controls in explicitly local technical mode. No J1 or fabricated production grants.
    if (!technical) {
      const proposal = JSON.parse(fs.readFileSync('tmp/stage6-reviewed.json'));
      for (const colorScheme of ['light', 'dark'])
        for (const width of [375, 1440]) {
          const context = await contextFor(bridge.browser, proposal, width, colorScheme),
            page = await context.newPage();
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          await page.goto(`http://localhost:${port}/radio-bee/home`);
          await page.locator('.station-card').nth(89).waitFor({ state: 'attached' });
          await page.getByRole('searchbox').fill('J1');
          assert.equal(await page.locator('.station-card').count(), 2);
          assert.equal(await page.locator('button.play').count(), 0);
          for (const locale of ['en', 'ta', 'sa']) {
            await page.locator('.language-label select').selectOption(locale);
            for (const id of ['j1-hits', 'j1-gold']) {
              const card = page.locator(`[data-station-id=${id}]`);
              assert.equal(await card.locator('a').count(), 0);
              await card.locator('.details-button').click();
              const overlay = page.locator('ion-popover.station-details-popover:not(.overlay-hidden)');
              const link = overlay.locator('app-station-details-content a');
              await link.waitFor();
              assert.equal(await link.getAttribute('href'), 'https://www.j1fm.tokyo/');
              assert.doesNotMatch(await overlay.innerText(), /j1\/developers|rightsStatus|directListening/);
              await audit(page, { width, colorScheme, locale, state: `review-only-${id}-website-in-details` });
              if (
                (locale === 'en' && width === 375 && colorScheme === 'light') ||
                (locale === 'ta' && width === 1440 && colorScheme === 'dark')
              )
                await page.screenshot({
                  path: `${screenshotDir}/stage6-review-${id}-details-${width}-${colorScheme}-${locale}.png`,
                });
              await overlay.locator('button.close').click();
              await page.waitForFunction(() => !document.querySelector('ion-popover.station-details-popover'));
            }
          }
          await context.close();
        }
    }
    if (technical)
      for (const colorScheme of ['light', 'dark']) {
        const context = await contextFor(bridge.browser, published, 375, colorScheme);
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
        await page.locator('.station-card').nth(87).waitFor({ state: 'attached' });
        assert.equal(await page.locator('.development-lab').isVisible(), true);
        await page.locator('.development-lab > summary').click();
        const start = () =>
          page
            .getByRole('button', {
              name: 'Test live audio · Sooriyan FM Sri Lanka · sooriyan-official-candidate',
              exact: true,
            })
            .click();
        const card = page.locator('[data-station-id=sooriyan-srilanka]');
        await card.waitFor();
        assert.equal(await card.locator('.play').count(), 0);
        await start();
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
        await player.locator('button').first().click();
        assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), true);
        await player.locator('button').first().click();
        await page.waitForFunction(() => !window.radioBeeAudio.paused);
        await player.locator('input').fill('0.35');
        await player.locator('button').last().click();
        assert.equal(await page.evaluate(() => window.radioBeeAudio.muted), true);
        await player.locator('button').last().click();
        assert.equal(await page.evaluate(() => window.radioBeeAudio.volume), 0.35);
        assert.equal(await page.evaluate(() => window.radioBeeAudioCount), 1);
        await page.getByRole('searchbox').fill('Sooriyan');
        assert.equal(await page.locator('.station-card').count(), 1);
        assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
        await details(page, { width: 375, colorScheme, locale: 'en' });
        await page.getByRole('searchbox').fill('');
        assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
        await page.locator('.advanced > summary').click();
        await page.locator('.filters select').first().selectOption('IN');
        assert.equal(await card.count(), 0);
        assert.equal(await page.evaluate(() => window.radioBeeAudio.paused), false);
        await page.locator('.filters button').click();
        await page.locator('.advanced > summary').click();
        const previousSrc = await page.evaluate(() => window.radioBeeAudio.currentSrc);
        await page
          .getByRole('button', { name: 'Test live audio · Vasantham FM Sri Lanka · vasantham-candidate', exact: true })
          .click();
        await page.waitForFunction(
          () => window.radioBeeAudio.currentSrc.includes('vasanthamfm') && !window.radioBeeAudio.paused,
          null,
          { timeout: 30000 },
        );
        assert.notEqual(await page.evaluate(() => window.radioBeeAudio.currentSrc), previousSrc);
        assert.equal(await page.evaluate(() => window.radioBeeAudio.volume), 0.35);
        assert.equal(await page.evaluate(() => window.radioBeeAudioCount), 1);
        assert.equal(await card.locator('.play').count(), 0);
        await start();
        await page.waitForFunction(
          () => window.radioBeeAudio.currentSrc.includes('sooriyanfmgarden') && !window.radioBeeAudio.paused,
          null,
          { timeout: 30000 },
        );
        assert.equal(page.url(), `http://localhost:${port}/radio-bee/home`);
        for (const locale of ['en', 'ta', 'sa']) {
          await page.locator('.language-label select').selectOption(locale);
          for (const width of [375, 820, 1440]) {
            await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
            await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
            await audit(page, { width, colorScheme, locale, state: 'actual-local-technical-player', continuity });
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
