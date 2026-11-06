// Optional browser regression driver. Uses existing Playwright/axe tools; installs nothing.
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Run through WSL2 Linux Node.');
const browserTools = path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules');
const { chromium } = require(path.join(browserTools, 'playwright'));
const AxeBuilder = require(path.join(browserTools, '@axe-core/playwright')).default;

const snapshotPath = process.env.RADIOBEE_CATALOG_SNAPSHOT || 'tmp/stage5-published.json';
let snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;
const root = path.resolve(process.env.RADIOBEE_WEB_ROOT || 'www');
const server = http.createServer((req, res) => {
  const rel = decodeURI(req.url.split('?')[0]).replace(/^\/radio-bee\//, '');
  let file = path.resolve(root, rel || 'index.html');
  if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    }[ext] || 'text/html',
  );
  res.end(fs.readFileSync(file));
});
(async () => {
  if (!snapshot) {
    const read = async file => {
      const response = await fetch('https://actionanand.github.io/radio-bee-data/v1/' + file);
      assert.ok(response.ok, 'Published catalogue could not be read: ' + file);
      return response.json();
    };
    const manifest = await read('index.json');
    const names = ['networks', 'stations', 'locations', 'languages', 'categories', 'sources'];
    const values = await Promise.all(names.map(name => read(manifest.files[name])));
    const locales = ['en', 'ta', 'sa'];
    const dictionaries = await Promise.all(locales.map(locale => read(manifest.localizationRoot + locale + '.json')));
    snapshot = {
      manifest,
      ...Object.fromEntries(names.map((name, index) => [name, values[index]])),
      localization: Object.fromEntries(locales.map((locale, index) => [locale, dictionaries[index]])),
    };
  }
  await new Promise(r => server.listen(3055, '0.0.0.0', r));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.connectOverCDP(process.env.RADIOBEE_CDP_ENDPOINT || 'http://localhost:9222'),
        close: () => {},
      };
  const report = [];
  fs.mkdirSync('documentation/screenshots', { recursive: true });
  try {
    for (const colorScheme of ['light', 'dark'])
      for (const width of [375, 820, 1440]) {
        const context = await bridge.browser.newContext({
          viewport: { width, height: 1050 },
          colorScheme,
          reducedMotion: 'reduce',
        });
        await context.route('https://actionanand.github.io/radio-bee-data/v1/**', route => {
          const rel = new URL(route.request().url()).pathname.split('/v1/')[1];
          const value =
            rel === 'index.json'
              ? snapshot.manifest
              : rel.startsWith('i18n/')
                ? snapshot.localization[rel.split('/')[1].replace('.json', '')]
                : snapshot[rel.replace('.json', '')];
          return route.fulfill({ json: value });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://localhost:3055/radio-bee/home');
        await page.locator('.station-card').nth(87).waitFor({ state: 'attached' });
        assert.match(page.url(), /\/home$/);
        assert.equal(await page.locator('button.play').count(), 0);
        const grid = await page
          .locator('.stations')
          .evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        assert.equal(grid, width === 375 ? 2 : width === 820 ? 4 : 6);
        await page.getByRole('searchbox').focus();
        await page.keyboard.press('Tab');
        assert.equal(
          await page
            .getByRole('button', { name: 'All stations', exact: true })
            .evaluate(el => el === document.activeElement),
          true,
        );
        await page
          .locator('.station-card')
          .first()
          .getByRole('button', { name: /Add to favorites/ })
          .click();
        await page.getByRole('button', { name: 'Favorites', exact: true }).click();
        assert.equal(await page.locator('.station-card').count(), 1);
        await page.reload();
        await page.getByRole('button', { name: 'Favorites', exact: true }).click();
        await page.locator('.station-card').first().waitFor();
        assert.equal(await page.locator('.station-card').count(), 1);
        await page.getByRole('button', { name: 'All stations', exact: true }).click();
        await page.getByRole('searchbox').fill('Sooriyan');
        assert.equal(await page.locator('.station-card').count(), 1);
        await page.getByRole('searchbox').fill('');
        await page.locator('.advanced > summary').click();
        let selects = page.locator('.filters select');
        await selects.nth(0).selectOption('IN');
        assert.equal(await selects.count(), 5);
        await selects.nth(1).selectOption('in-tn');
        await selects.nth(0).selectOption('LK');
        assert.equal(await selects.count(), 2);
        await selects.nth(1).selectOption('ta');
        assert.ok(await page.getByRole('heading', { name: 'Sooriyan FM Sri Lanka', exact: true }).isVisible());
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await page.locator('.advanced > summary').click();
        await page.locator('ion-content').evaluate(el => el.scrollToTop(0));
        await page.screenshot({ path: `documentation/screenshots/stage5-${width}-${colorScheme}.png` });
        const axe = await new AxeBuilder({ page }).analyze();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        const fallback = await page
          .locator('app-station-artwork')
          .first()
          .evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
        const record = {
          width,
          colorScheme,
          columns: grid,
          overflow,
          fallback,
          violations: axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })),
          pageErrors: errors,
        };
        console.log(JSON.stringify(record));
        report.push(record);
        assert.equal(overflow, false);
        assert.equal(axe.violations.length, 0);
        assert.equal(errors.length, 0);
        assert.ok(Math.abs(fallback.width - fallback.height) < 2);
        await context.close();
      }
    const broken = structuredClone(snapshot);
    broken.stations[0].logoPath = 'assets/logos/stations/missing.webp';
    broken.networks.find(network => network.id === broken.stations[0].networkId).logoPath =
      'assets/logos/networks/missing.png';
    const context = await bridge.browser.newContext();
    const failedArtwork = new Set();
    await context.route('https://actionanand.github.io/radio-bee-data/v1/**', route => {
      const file = new URL(route.request().url()).pathname.split('/v1/')[1];
      if (file.startsWith('assets/logos/')) {
        failedArtwork.add(file);
        return route.fulfill({ status: 404, body: 'missing' });
      }
      return route.fulfill({
        json:
          file === 'index.json'
            ? broken.manifest
            : file.startsWith('i18n/')
              ? broken.localization[file.split('/')[1].replace('.json', '')]
              : broken[file.replace('.json', '')],
      });
    });
    const page = await context.newPage();
    await page.goto('http://localhost:3055/radio-bee/home');
    await page.waitForFunction(() => {
      const image = document.querySelector('.station-card app-station-artwork img');
      return image?.src.endsWith('assets/icon/radio-fallback.svg') && image.naturalWidth > 0;
    });
    assert.ok(failedArtwork.has('assets/logos/stations/missing.webp'));
    assert.ok(failedArtwork.has('assets/logos/networks/missing.png'));
    assert.equal(await page.locator('button.play').count(), 0);
    report.push({ stationAndNetwork404Fallback: true, productionPlaybackStillBlocked: true });
    await context.close();
    fs.writeFileSync('tmp/stage5-production-browser-results.json', JSON.stringify(report, null, 2));
    console.log('STAGE5_BROWSER_PASSED');
  } finally {
    bridge.close();
    server.close();
  }
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
