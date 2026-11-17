// Local dev-server integration: real recording, exact lifecycle trace, >=3 minutes.
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  crypto = require('crypto');
const { chromium } = require(
  path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'playwright'),
);
const folder = process.env.OUTPUT_DIR || 'tmp/recording-lifecycle';
fs.mkdirSync(folder, { recursive: true });
const base = process.env.APP_URL || 'http://localhost:3042';
const duration = Number(process.env.RECORD_SECONDS || 185);
assert.ok(Number.isFinite(duration) && duration >= 45 && duration % 5 === 0);
(async () => {
  const bridge = await (process.env.BROWSER_BRIDGE
      ? require(path.resolve(process.env.BROWSER_BRIDGE)).attach(chromium)
      : chromium
          .launch({ channel: 'chrome', headless: false })
          .then(browser => ({ browser, close: () => browser.close() }))),
    context = await bridge.browser.newContext({ locale: 'en-US' }),
    page = await context.newPage(),
    report = { browser: bridge.browser.version(), base, errors: [], samples: [], scenarios: [] };
  page.on('pageerror', e => report.errors.push(String(e)));
  await context.addInitScript(() => {
    window.__mediaTrace = [];
    const log = (event, extra = {}) => window.__mediaTrace.push({ event, at: new Date().toISOString(), ...extra });
    const A = window.Audio;
    window.Audio = function (...args) {
      const a = new A(...args);
      window.__audio = a;
      for (const event of ['playing', 'waiting', 'stalled', 'pause', 'error', 'emptied', 'ended'])
        a.addEventListener(event, () =>
          log('audio.' + event, { time: a.currentTime, src: a.currentSrc, paused: a.paused, error: a.error?.code }),
        );
      const capture = a.captureStream?.bind(a);
      if (capture)
        a.captureStream = () => {
          const stream = capture();
          window.__captured = stream;
          for (const t of stream.getTracks())
            for (const event of ['ended', 'mute', 'unmute'])
              t.addEventListener(event, () => log('track.' + event, { id: t.id, state: t.readyState, muted: t.muted }));
          return stream;
        };
      return a;
    };
    window.Audio.prototype = A.prototype;
    const M = window.MediaRecorder;
    window.MediaRecorder = class extends M {
      constructor(...args) {
        super(...args);
        window.__recorderCount = (window.__recorderCount || 0) + 1;
        for (const event of ['start', 'stop', 'error', 'pause', 'resume'])
          this.addEventListener(event, () => log('MediaRecorder.' + event, { state: this.state }));
        this.addEventListener('dataavailable', e => log('MediaRecorder.data', { bytes: e.data.size }));
      }
    };
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      window.__dir = await root.getDirectoryHandle('radiobee-three-minute-' + Date.now(), { create: true });
      return window.__dir;
    };
  });
  const sample = () =>
    page.evaluate(() => {
      const { r, p } = window.__services;
      return {
        at: new Date().toISOString(),
        seconds: r.seconds(),
        state: r.state(),
        reason: r.lastStopReason(),
        bytes: r.file()?.size ?? 0,
        player: p.state(),
        station: p.station()?.id,
        visibility: document.visibilityState,
        audioTime: window.__audio.currentTime,
        paused: window.__audio.paused,
      };
    });
  const snapshot = async () => {
    report.trace = await page.evaluate(() => ({
      events: window.__lifecycle,
      media: window.__mediaTrace,
      diagnostics: window.__services.r.diagnostics(),
    }));
    fs.writeFileSync(`${folder}/three-minute.json`, JSON.stringify(report, null, 2));
  };
  const checkAccessibility = async state => {
    await page.addScriptTag({
      path: path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'axe-core/axe.min.js'),
    });
    const violations = await page.evaluate(async () =>
      (await window.axe.run({ include: [['app-recording-controls'], ['app-player > section']] })).violations.map(
        ({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) }),
      ),
    );
    (report.accessibility ??= []).push({ state, violations });
    assert.deepEqual(violations, []);
  };
  const waitPlaying = () =>
    page.waitForFunction(() => window.__services.p.state() === 'playing', null, { timeout: 45000 });
  const start = async () => {
    if (!(await page.locator('.recording-panel').isVisible())) await page.locator('.recording-toggle').click();
    const consent = page.locator('.recording-panel .consent input');
    if (await consent.count()) await consent.check();
    await page.locator('.recording-panel .primary-action').filter({ hasText: 'Start recording' }).click();
    await page.waitForFunction(
      () => window.__services.r.state() === 'recording' && window.__services.r.seconds() >= 2,
      null,
      { timeout: 20000 },
    );
  };
  const exportFile = async name => {
    await page.locator('.recording-panel .primary-action').filter({ hasText: 'Export recording' }).click();
    await page.waitForFunction(() =>
      document.querySelector('.recording-panel')?.textContent.includes('Export opened on this device.'),
    );
    const file = await page.evaluate(async () => {
      const expected = window.__services.r.file().size;
      for await (const [name, h] of window.__dir.entries()) {
        const f = await h.getFile();
        if (f.size !== expected) continue;
        const ctx = new AudioContext();
        try {
          const b = await ctx.decodeAudioData(await f.arrayBuffer()),
            s = b.getChannelData(0);
          return {
            name,
            size: f.size,
            duration: b.duration,
            rms: Math.sqrt(s.reduce((n, x) => n + x * x, 0) / s.length),
            peak: s.reduce((n, x) => Math.max(n, Math.abs(x)), 0),
            base64: await new Promise(r => {
              const reader = new FileReader();
              reader.onload = () => r(reader.result.split(',')[1]);
              reader.readAsDataURL(f);
            }),
          };
        } finally {
          await ctx.close();
        }
      }
    });
    assert.ok(file && file.rms >= 0.001 && file.peak >= 0.01);
    const bytes = Buffer.from(file.base64, 'base64');
    delete file.base64;
    file.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(`${folder}/${name}.webm`, bytes);
    return file;
  };
  try {
    await page.goto(base + '/settings');
    await page.locator('.folder-button').click();
    await page.waitForFunction(() =>
      document.querySelector('app-settings-page')?.textContent.includes('radiobee-three-minute-'),
    );
    await page.getByRole('link', { name: 'World', exact: true }).first().click();
    await page.locator('[data-station-id=sooriyan-srilanka]').waitFor();
    await page.waitForFunction(
      () => !!window.ng?.getComponent(document.querySelector('app-recording-controls'))?.recorder,
    );
    await page.evaluate(() => {
      const c = ng.getComponent(document.querySelector('app-recording-controls')),
        r = c.recorder,
        p = c.player;
      window.__services = { r, p };
      window.__lifecycle = [];
      let boundary;
      const log = (event, reason) =>
        window.__lifecycle.push({
          event,
          reason,
          at: new Date().toISOString(),
          state: r.state(),
          seconds: r.seconds(),
          bytes: r.file()?.size ?? 0,
          player: p.state(),
          station: p.station()?.id,
          visibility: document.visibilityState,
        });
      const stop = r.stop.bind(r);
      r.stop = (...args) => {
        log('RecordingService.stop', args[0] ?? boundary ?? 'manual');
        return stop(...args);
      };
      const emit = p.playbackBoundary.bind(p);
      p.playbackBoundary = reason => {
        boundary = reason;
        log('PlayerService.playbackBoundary', reason);
        try {
          return emit(reason);
        } finally {
          boundary = undefined;
        }
      };
      p.onPlaybackBoundary(reason => log('onPlaybackBoundary', reason));
      document.addEventListener('visibilitychange', () => log('visibilitychange', document.visibilityState));
      window.addEventListener('pagehide', () => log('pagehide'));
    });
    await page.locator('[data-station-id=sooriyan-srilanka] .play').click();
    await waitPlaying();
    await start();
    report.config = await page.evaluate(() => window.__services.r.config);
    assert.equal(report.config.MaxDurationMs, 3600000);
    assert.equal(report.config.MaxBytes, 83886080);
    assert.equal(report.config.AutoContinue, true);
    for (let target = 5; target <= duration; target += 5) {
      await page.waitForFunction(
        t => window.__services.r.seconds() >= t || !['starting', 'recording'].includes(window.__services.r.state()),
        target,
        { timeout: 15000 },
      );
      const row = await sample();
      report.samples.push(row);
      await snapshot();
      assert.equal(row.state, 'recording', JSON.stringify(row));
      assert.equal(row.paused, false);
      console.log(`recording ${row.seconds}s player=${row.player} visibility=${row.visibility}`);
      if (target === 10) {
        await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
        await page.locator('app-settings-page').waitFor();
        assert.equal((await sample()).state, 'recording');
        report.scenarios.push('Internal navigation to Settings retains capture');
      }
      if (target === 20) {
        const other = await context.newPage();
        await other.goto('about:blank');
        await other.bringToFront();
        report.visibilityAfterTabSwitch = await page.evaluate(() => document.visibilityState);
        await page.waitForFunction(() => window.__services.r.seconds() >= 25, null, { polling: 100 });
        report.scenarios.push('Tab-switch observation: visibility=' + report.visibilityAfterTabSwitch);
        assert.equal((await sample()).state, 'recording');
        await page.bringToFront();
        await other.close();
      }
      if (target === 35) {
        await page.evaluate(() => window.__audio.dispatchEvent(new Event('waiting')));
        await page.waitForFunction(() => window.__services.p.pendingPhase() === 'buffering');
        await page.waitForFunction(() => window.__services.r.seconds() >= 40);
        assert.equal((await sample()).state, 'recording');
        await page.evaluate(() => window.__audio.dispatchEvent(new Event('playing')));
        await waitPlaying();
        report.scenarios.push('Controlled waiting/playing events retain same genuine capture');
      }
    }
    await checkAccessibility('active recording');
    assert.equal(await page.evaluate(() => window.__recorderCount), 1);
    await page.screenshot({ path: `${folder}/three-minute-recording.png` });
    await page
      .locator('app-player > section')
      .getByRole('button', { name: /^Pause/ })
      .click();
    await page.waitForFunction(() => window.__services.r.state() === 'ready');
    assert.equal(await page.evaluate(() => window.__services.r.lastStopReason()), 'pause');
    report.export = await exportFile('sooriyan-three-minute');
    assert.ok(report.export.duration >= duration - 1);
    report.scenarios.push('Pause retains and Export decodes the requested duration of real non-silent radio');
    await page.locator('.recording-panel button').filter({ hasText: 'Discard' }).click();
    await page.locator('app-player > section').getByRole('button', { name: /^Play/ }).click();
    await waitPlaying();
    await start();
    await page.waitForFunction(() => window.__services.r.seconds() >= 4);
    const cdp = await context.newCDPSession(page);
    const count = await page.evaluate(
      () =>
        window.__lifecycle.filter(e => e.event === 'PlayerService.playbackBoundary' && e.reason === 'failure').length,
    );
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    try {
      await page.evaluate(() => window.__audio.load());
      await page.waitForFunction(
        n =>
          window.__lifecycle.filter(e => e.event === 'PlayerService.playbackBoundary' && e.reason === 'failure')
            .length > n,
        count,
        { timeout: 15000, polling: 50 },
      );
    } finally {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp.detach();
    }
    await page.waitForFunction(() => ['playing', 'error'].includes(window.__services.p.state()));
    await page.waitForFunction(() => window.__services.r.state() === 'ready');
    report.recovery = await sample();
    assert.ok(report.recovery.bytes > 256);
    assert.equal(await page.evaluate(() => window.__recorderCount), 2);
    report.scenarios.push('Controlled offline/reload: player=' + report.recovery.player + ', captured draft retained');
    await checkAccessibility('interrupted recording retained for export');
    if (report.recovery.player === 'error') {
      await page
        .locator('app-player > section')
        .getByRole('button', { name: /^Retry/ })
        .click();
      await waitPlaying();
      report.scenarios.push('Real playback recovered using explicit Retry after terminal reload error');
    }
    if (!(await page.locator('.recording-panel').isVisible())) await page.locator('.recording-toggle').click();
    report.recoveryExport = await exportFile('sooriyan-recovery-draft');
    await page.locator('.recording-panel button').filter({ hasText: 'Discard' }).click();
    await start();
    await page.waitForFunction(() => window.__services.r.seconds() >= 3);
    await page.locator('app-player > section').getByRole('button', { name: /^Stop/ }).click();
    await page.waitForFunction(() => window.__services.r.state() === 'ready');
    assert.ok((await sample()).bytes > 256);
    report.scenarios.push('Player Stop retains genuine draft');
    await page.locator('.recording-panel button').filter({ hasText: 'Discard' }).click();
    await page.getByRole('link', { name: 'World', exact: true }).first().click();
    await page.locator('[data-station-id=sooriyan-srilanka] .play').click();
    await waitPlaying();
    await start();
    await page.waitForFunction(() => window.__services.r.seconds() >= 3);
    await page.evaluate(() => {
      const a = window.__audio;
      Object.defineProperty(a, 'error', { configurable: true, value: { code: 2 } });
      a.dispatchEvent(new Event('error'));
      delete a.error;
    });
    await waitPlaying();
    await page.waitForFunction(() => window.__services.r.state() === 'ready');
    assert.ok((await sample()).bytes > 256);
    assert.equal(await page.evaluate(() => window.__recorderCount), 4);
    report.scenarios.push(
      'Controlled transient media-error event: real playback automatically reconnects, existing recording remains an exportable draft',
    );
    await page.locator('app-player > section').getByRole('button', { name: /^Stop/ }).click();
    await page.locator('.recording-panel button').filter({ hasText: 'Discard' }).click();
    await page.getByRole('link', { name: 'World', exact: true }).first().click();
    await page.locator('[data-station-id=sooriyan-srilanka] .play').click();
    await waitPlaying();
    await start();
    await page.waitForFunction(() => window.__services.r.seconds() >= 3);
    await page.locator('.recording-panel').getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('[data-station-id=vasantham-srilanka] .play').click();
    await page.waitForFunction(() => window.__services.r.state() === 'ready');
    assert.ok((await sample()).bytes > 256);
    assert.equal(await page.evaluate(() => window.__recorderCount), 5);
    assert.equal(await page.evaluate(() => window.__services.p.station()?.id), 'vasantham-srilanka');
    await page.locator('app-player > section').getByRole('button', { name: /^Stop/ }).click();
    report.scenarios.push('Station switch retains old file and never captures the new station automatically');
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
  } catch (error) {
    process.exitCode = 1;
    report.status = 'failed';
    report.error = String(error);
    try {
      report.last = await sample();
      await page.screenshot({ path: `folder/failure.png`.replace('folder', folder) });
    } catch {}
    console.error(error);
  } finally {
    try {
      await snapshot();
    } catch {}
    await context.close();
    await bridge.close();
  }
})()
  .then(() => process.exit(process.exitCode || 0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
