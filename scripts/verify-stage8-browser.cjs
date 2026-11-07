// Manual browser verification. Real media/capture only; no source relay or generated audio.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(path.resolve('tmp/ci-tools/node_modules/playwright'));
const AxeBuilder = require(path.resolve('tmp/ci-tools/node_modules/@axe-core/playwright')).default;
const root = path.resolve(process.env.RADIOBEE_WEB_ROOT || 'www');
const enabled = process.env.RADIOBEE_RECORDING_EXPECTED !== 'false';
const folder = process.env.RADIOBEE_STAGE8_EVIDENCE || 'documentation/stage8/enabled';
fs.mkdirSync(folder, { recursive: true });
const catalog = JSON.parse(fs.readFileSync('tmp/stage8-catalogue.json'));
const expected = catalog.stations.filter(s => s.streams.length).length;
const report = {
  startedAt: new Date().toISOString(),
  catalogVersion: catalog.manifest.catalogVersion,
  candidateStations: expected,
  recordingEnabled: enabled,
  audits: [],
  playback: [],
  recording: {},
  logos: [],
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
async function audit(page, state) {
  const result = await new AxeBuilder({ page }).analyze();
  if (result.violations.length) {
    fs.writeFileSync(`${folder}/accessibility-failure.json`, JSON.stringify(result.violations, null, 2));
    await page.screenshot({ path: `${folder}/accessibility-failure.png` });
  }
  const row = { ...state, violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
  report.audits.push(row);
  save();
  assert.deepEqual(row.violations, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(
    await page
      .locator('a[href^="https:"]')
      .evaluateAll(links => links.filter(link => !link.closest('app-station-details-content')).map(link => link.href)),
    [],
  );
}
async function choose(page, selector, name) {
  await page.locator(selector).click();
  await page.getByRole('radio', { name, exact: true }).click();
  await page.locator('ion-popover.radio-select-popover').waitFor({ state: 'hidden' });
}
async function open(browser, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 667 : 900 },
    acceptDownloads: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const NativeAudio = Audio;
    window.audioCount = 0;
    window.recorderCount = 0;
    window.microphoneRequests = 0;
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.audioCount++;
      window.actualAudio = audio;
      return audio;
    };
    if (window.MediaRecorder) {
      const NativeRecorder = MediaRecorder;
      window.MediaRecorder = class extends NativeRecorder {
        constructor(...args) {
          super(...args);
          window.recorderCount++;
          window.latestRecorder = this;
          window.latestCaptureTracks = args[0].getTracks();
        }
      };
    }
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        window.microphoneRequests++;
        throw Error('Unexpected microphone request');
      };
    const nativeUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob instanceof Blob && blob.type.startsWith('audio/')) window.recordedBlob = blob;
      return nativeUrl(blob);
    };
  });
  page.on('response', response => {
    if (response.url().includes('/assets/logos/') && response.status() === 200) report.logos.push(response.url());
  });
  await page.goto('http://localhost:3081/radio-bee/home');
  await page.waitForFunction(count => document.querySelectorAll('.station-card').length === count, expected);
  return { context, page };
}
async function play(page, id) {
  const row = { id, responses: [], failures: [], played: false };
  report.playback.push(row);
  const pending = [];
  const station = catalog.stations.find(s => s.id === id);
  const hosts = station.streams.map(s => new URL(s.url).hostname);
  const relevant = url => hosts.includes(new URL(url).hostname) || url.includes('.cloudfront.net/');
  const response = r => {
    if (relevant(r.url()))
      pending.push(
        (async () => row.responses.push({ url: r.url(), status: r.status(), headers: await r.allHeaders() }))(),
      );
  };
  const failed = r => {
    if (relevant(r.url())) row.failures.push({ url: r.url(), error: r.failure()?.errorText });
  };
  page.on('response', response);
  page.on('requestfailed', failed);
  try {
    await page.locator(`[data-station-id="${id}"] button.play`).click();
    await page.waitForFunction(() => window.actualAudio.currentTime > 1 && !window.actualAudio.paused, null, {
      timeout: 35000,
    });
    const before = await page.evaluate(() => ({
      time: actualAudio.currentTime,
      bytes: actualAudio.webkitAudioDecodedByteCount,
    }));
    await new Promise(resolve => setTimeout(resolve, 8000));
    const after = await page.evaluate(() => ({
      time: actualAudio.currentTime,
      bytes: actualAudio.webkitAudioDecodedByteCount,
      src: actualAudio.currentSrc,
      paused: actualAudio.paused,
    }));
    row.continuity = after.time - before.time;
    row.bytes = after.bytes - before.bytes;
    row.source = after.src;
    assert.ok(row.continuity > 6 && row.bytes > 0 && !after.paused);
    row.played = true;
  } catch (error) {
    row.error = error.message;
  } finally {
    await Promise.allSettled(pending);
    page.off('response', response);
    page.off('requestfailed', failed);
    save();
  }
  return row;
}
async function recording(page, id) {
  const source = catalog.stations.find(s => s.id === id);
  if (source.streams.every(stream => stream.directListening?.recording === 'prohibited'))
    return { id, restricted: true };
  const controls = page.locator('app-recording-controls');
  await controls.getByRole('button', { name: 'Record', exact: true }).click();
  if (process.env.RADIOBEE_RECORDING_UI_MATRIX && id === 'sooriyan-srilanka') {
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
      for (const mode of ['light', 'dark']) {
        await choose(page, '.language-select', 'English');
        await choose(page, '.theme-select', mode === 'light' ? 'Light' : 'Dark');
        for (const [locale, name] of [
          ['en', 'English'],
          ['ta', 'தமிழ்'],
          ['sa', 'संस्कृतम्'],
        ]) {
          await choose(page, '.language-select', name);
          await audit(page, { state: 'recording-consent', width, mode, locale });
          if (width === 375) await page.screenshot({ path: `${folder}/recording-${mode}-${locale}.png` });
        }
      }
    }
    await choose(page, '.language-select', 'English');
    await choose(page, '.theme-select', 'Light');
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const consent = controls.locator('input[type="checkbox"]');
  if (await consent.isVisible()) await consent.check();
  await controls.getByRole('button', { name: 'Start recording', exact: true }).click();
  const result = { id, captureSucceeded: false };
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('app-recording-controls [role="status"]')?.textContent.includes('Recording ·') ||
        !!document.querySelector('app-recording-controls [role="alert"]'),
      null,
      { timeout: 15000 },
    );
    if (await controls.locator('[role="alert"]').count()) {
      result.error = await controls.locator('[role="alert"]').innerText();
      await audit(page, { state: 'recording-error', station: id });
      result.captureAccess = await page.evaluate(() => {
        try {
          const stream = window.actualAudio.captureStream();
          const tracks = stream
            .getTracks()
            .map(track => ({ kind: track.kind, muted: track.muted, state: track.readyState }));
          stream.getTracks().forEach(track => track.stop());
          return { tracks };
        } catch (error) {
          return { error: error.name, message: error.message };
        }
      });
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 4000));
    result.trackKinds = await page.evaluate(() => window.latestCaptureTracks.map(track => track.kind));
    assert.ok(result.trackKinds.length && result.trackKinds.every(kind => kind === 'audio'));
    await audit(page, { state: 'recording-active', station: id });
    await controls.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await controls.getByRole('button', { name: 'Export recording', exact: true }).waitFor();
    const download = page.waitForEvent('download', { timeout: 15000 });
    await controls.getByRole('button', { name: 'Export recording', exact: true }).click();
    const file = await download;
    result.filename = file.suggestedFilename();
    await file.cancel();
    result.decoded = await page.evaluate(async () => {
      const blob = window.recordedBlob,
        context = new AudioContext();
      try {
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        const channelRms = [];
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
          const samples = audio.getChannelData(channel);
          let power = 0;
          for (let i = 0; i < samples.length; i++) power += samples[i] ** 2;
          channelRms.push(Math.sqrt(power / samples.length));
        }
        return {
          size: blob.size,
          mime: blob.type,
          duration: audio.duration,
          sampleRate: audio.sampleRate,
          channelRms,
          rms: Math.sqrt(channelRms.reduce((sum, rms) => sum + rms * rms, 0) / channelRms.length),
        };
      } finally {
        await context.close();
      }
    });
    assert.ok(result.decoded.duration > 2 && result.decoded.rms >= 0.001 && result.decoded.size > 256);
    assert.equal(await page.evaluate(() => window.audioCount), 1);
    assert.equal(await page.evaluate(() => window.microphoneRequests), 0);
    result.captureSucceeded = true;
    await audit(page, { state: 'recording-export', station: id });
  } catch (error) {
    result.error = error.message;
  } finally {
    await controls.getByRole('button', { name: 'Discard', exact: true }).click();
    save();
  }
  return result;
}
async function lifecycle(page, id) {
  const controls = page.locator('app-recording-controls');
  const start = async () => {
    await controls.getByRole('button', { name: 'Record', exact: true }).click();
    const consent = controls.locator('input[type="checkbox"]');
    if (await consent.isVisible()) await consent.check();
    await controls.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('app-recording-controls [role="status"]')?.textContent.includes('Recording ·'),
      null,
      { timeout: 20000 },
    );
  };
  const ended = () =>
    page.evaluate(
      () =>
        window.latestRecorder.state === 'inactive' &&
        window.latestCaptureTracks.every(track => track.readyState === 'ended'),
    );
  const result = {};
  await start();
  const count = await page.evaluate(() => window.recorderCount);
  await page.locator('app-player > section > button').first().click();
  await controls.getByRole('button', { name: 'Export recording', exact: true }).waitFor();
  assert.equal(await ended(), true);
  await page.locator('app-player > section > button').first().click();
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await page.evaluate(() => window.recorderCount), count);
  result.pauseEndsAndResumeDoesNotRecord = true;
  await controls.getByRole('button', { name: 'Discard', exact: true }).click();
  await start();
  await controls.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(await ended(), true);
  assert.equal(await controls.getByRole('button', { name: 'Export recording', exact: true }).count(), 0);
  result.discardStopsTracksAndRemovesFile = true;
  const station = catalog.stations.find(station => station.id === id);
  const block = route => (route.request().method() === 'HEAD' ? route.abort('failed') : route.continue());
  for (const stream of station.streams) await page.route(stream.url, block);
  const before = await page.evaluate(() => ({ time: window.actualAudio.currentTime, recorders: window.recorderCount }));
  await controls.getByRole('button', { name: 'Record', exact: true }).click();
  if (await controls.locator('input[type="checkbox"]').isVisible())
    await controls.locator('input[type="checkbox"]').check();
  await controls.getByRole('button', { name: 'Start recording', exact: true }).click();
  await controls.locator('[role="alert"]').waitFor();
  await audit(page, { state: 'injected-recording-access-failure', station: id });
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await page.evaluate(() => window.recorderCount), before.recorders);
  assert.ok(await page.evaluate(time => window.actualAudio.currentTime > time + 1, before.time));
  result.injectedAccessFailureKeepsPlayback = true;
  for (const stream of station.streams) await page.unroute(stream.url, block);
  await controls.getByRole('button', { name: 'Discard', exact: true }).click();
  if (catalog.stations.some(station => station.id === 'air-nagercoil')) {
    await start();
    await page.locator('[data-station-id="air-nagercoil"] button.play').click();
    await controls.getByRole('button', { name: 'Export recording', exact: true }).waitFor();
    assert.equal(await ended(), true);
    result.stationSwitchEndsCapture = true;
    await audit(page, { state: 'recording-ended-on-station-switch' });
    await controls.getByRole('button', { name: 'Discard', exact: true }).click();
  }
  await page.locator('app-player > section > button').nth(1).click();
  assert.equal(await page.evaluate(() => window.actualAudio.paused), true);
  assert.equal(await page.evaluate(() => window.actualAudio.getAttribute('src')), null);
  assert.equal(await page.evaluate(() => window.audioCount), 1);
  result.stopCleanup = true;
  return result;
}
(async () => {
  await new Promise(resolve => server.listen(3081, '127.0.0.1', resolve));
  const bridge = await require(
    path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE || 'tmp/browser-bridge-stage7.cjs'),
  ).attach(chromium);
  report.browser = bridge.browser.version();
  try {
    if (process.env.RADIOBEE_KEYBOARD_ONLY) {
      const { context, page } = await open(bridge.browser, 375);
      try {
        const select = page.locator('.theme-select');
        await select.evaluate(el => el.setFocus());
        await page.keyboard.press('Enter');
        await page.getByRole('radio', { name: 'Automatic', exact: true }).waitFor();
        await page.keyboard.press('ArrowDown');
        if ((await select.evaluate(el => el.value)) !== 'light')
          await page.getByRole('radio', { name: 'Light', exact: true }).press('Enter');
        await page.locator('ion-popover.radio-select-popover').waitFor({ state: 'hidden' });
        assert.equal(await select.evaluate(el => el.value), 'light');
        await audit(page, { state: 'keyboard-enter-arrow-selection' });
        report.completed = true;
        save();
        return;
      } finally {
        await context.close();
      }
    }
    if (enabled && !process.env.RADIOBEE_MEDIA_ONLY)
      for (const width of [375, 820, 1440]) {
        const { context, page } = await open(bridge.browser, width);
        try {
          for (const mode of ['light', 'dark']) {
            await page.emulateMedia({ colorScheme: mode === 'light' ? 'dark' : 'light', reducedMotion: 'reduce' });
            await choose(page, '.theme-select', mode === 'light' ? 'Light' : 'Dark');
            await page.waitForFunction(
              dark => document.documentElement.classList.contains('ion-palette-dark') === dark,
              mode === 'dark',
            );
            for (const [locale, name] of [
              ['en', 'English'],
              ['ta', 'தமிழ்'],
              ['sa', 'संस्कृतम्'],
            ]) {
              await choose(page, '.language-select', name);
              await audit(page, { state: 'browse', width, mode, locale });
              await page.screenshot({ path: `${folder}/${width}-${mode}-${locale}.png` });
              await page.locator('.theme-select').click();
              assert.equal(await page.locator('ion-popover.radio-select-popover').getAttribute('lang'), locale);
              await audit(page, { state: 'select-overlay', width, mode, locale });
              await page.keyboard.press('Escape');
              await page.locator('ion-popover.radio-select-popover').waitFor({ state: 'hidden' });
              assert.equal(await page.locator('.theme-select').evaluate(el => el.matches(':focus-within')), true);
              const card = page.locator('.station-card').first();
              await card.locator('.details-button').scrollIntoViewIfNeeded();
              const before = await card.boundingBox();
              await card.locator('.details-button').click();
              await page.locator('app-station-details-content').waitFor();
              assert.deepEqual(await card.boundingBox(), before);
              await audit(page, { state: 'details', width, mode, locale });
              await page.keyboard.press('Escape');
              await page.locator('app-station-details-content').waitFor({ state: 'hidden' });
            }
            await choose(page, '.language-select', 'English');
          }
          await page.reload();
          await page.locator('.station-card').first().waitFor();
          assert.equal(
            await page.evaluate(() => document.documentElement.classList.contains('ion-palette-dark')),
            true,
          );
          await choose(page, '.theme-select', 'Automatic');
          for (const colorScheme of ['light', 'dark']) {
            await page.emulateMedia({ colorScheme });
            await page.waitForFunction(
              dark => document.documentElement.classList.contains('ion-palette-dark') === dark,
              colorScheme === 'dark',
            );
          }
          await page.locator('details.advanced summary').click();
          await choose(page, '[data-filter="country"]', 'India');
          assert.equal(await page.locator('.filters ion-select').count(), 5);
          await choose(page, '[data-filter="country"]', 'Sri Lanka');
          assert.equal(await page.locator('.filters ion-select').count(), 2);
        } finally {
          await context.close();
        }
      }
    for (const id of (process.env.RADIOBEE_STATION_IDS || 'sooriyan-srilanka,air-nagercoil').split(',')) {
      if (!catalog.stations.some(s => s.id === id && s.streams.length)) continue;
      const { context, page } = await open(bridge.browser);
      try {
        const probe = await play(page, id);
        if (!probe.played) continue;
        if (enabled) {
          report.recording[id] = await recording(page, id);
          const before = await page.evaluate(() => window.actualAudio.currentTime);
          await new Promise(resolve => setTimeout(resolve, 2000));
          report.recording[id].playbackAdvancedAfterCapture = await page.evaluate(
            time => window.actualAudio.currentTime - time,
            before,
          );
          assert.ok(report.recording[id].playbackAdvancedAfterCapture > 1);
          if (
            id === 'sooriyan-srilanka' &&
            report.recording[id].captureSucceeded &&
            process.env.RADIOBEE_RECORDING_LIFECYCLE
          ) {
            report.recordingLifecycle = await lifecycle(page, id);
            save();
            continue;
          }
          save();
        } else {
          assert.equal(await page.locator('app-recording-controls').count(), 0);
          assert.equal(await page.evaluate(() => window.recorderCount), 0);
          await audit(page, { state: 'recording-disabled-playback', station: id });
        }
        assert.equal(await page.evaluate(() => window.microphoneRequests), 0);
        assert.equal(await page.evaluate(() => window.actualAudio.paused), false);
      } finally {
        await context.close();
        save();
      }
    }
    report.completed = true;
    save();
    console.log(
      JSON.stringify({
        completed: true,
        recordingEnabled: enabled,
        audits: report.audits.length,
        playback: report.playback.map(({ id, played, error }) => ({ id, played, error })),
        recording: report.recording,
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
