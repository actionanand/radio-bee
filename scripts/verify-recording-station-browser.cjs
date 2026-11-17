if (process.platform !== 'linux') throw Error('WSL Linux required');
const fs = require('fs'),
  path = require('path');
const { chromium } = require(
  path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'playwright'),
);
const output = process.env.RADIOBEE_RECORDING_EVIDENCE || 'tmp/murugan-recording';
fs.mkdirSync(output, { recursive: true });
const base = process.env.APP_URL || 'http://localhost:36803';
(async () => {
  const bridge = await (process.env.RADIOBEE_CDP_BRIDGE
      ? require(path.resolve(process.env.RADIOBEE_CDP_BRIDGE)).attach(chromium)
      : chromium
          .launch({ channel: 'chrome', headless: false })
          .then(browser => ({ browser, close: () => browser.close() }))),
    context = await bridge.browser.newContext(),
    page = await context.newPage(),
    report = { browser: bridge.browser.version(), network: [], console: [], attempts: [] };
  page.on('response', async r => {
    if (/asurahosting|lotustechnologies/.test(r.url()))
      report.network.push({
        at: Date.now(),
        url: r.url(),
        method: r.request().method(),
        type: r.request().resourceType(),
        status: r.status(),
        headers: await r.allHeaders(),
        redirectedFrom: r.request().redirectedFrom()?.url(),
      });
  });
  page.on('requestfailed', r => {
    if (/asurahosting|lotustechnologies/.test(r.url())) report.network.push({ url: r.url(), failed: r.failure() });
  });
  page.on('console', m => {
    if (m.type() === 'error') report.console.push(m.text());
  });
  await context.addInitScript(
    ({ pickerDelayMs, stallFirstCapture, realFolder }) => {
      window.__diag = { media: [], contexts: [], recorders: [], tracks: [], rms: [], picker: 0 };
      const log = (event, a) =>
        window.__diag.media.push({
          event,
          at: Date.now(),
          src: a.currentSrc,
          time: a.currentTime,
          readyState: a.readyState,
          crossOrigin: a.crossOrigin,
          error: a.error?.code,
          paused: a.paused,
          decoded: a.webkitAudioDecodedByteCount,
        });
      const A = Audio;
      window.Audio = function (...args) {
        const a = new A(...args);
        window.__audio = a;
        for (const e of ['playing', 'waiting', 'pause', 'stalled', 'error', 'ended', 'emptied'])
          a.addEventListener(e, () => log(e, a));
        const cap = a.captureStream?.bind(a);
        if (cap)
          a.captureStream = () => {
            let s = cap();
            window.__captureCalls = (window.__captureCalls || 0) + 1;
            if (stallFirstCapture && window.__captureCalls === 1) {
              // Controlled zero-frame track, matching the failed-session trace.
              // The existing player continues real broadcaster audio throughout.
              s.getTracks().forEach(track => track.stop());
              const generator = new MediaStreamTrackGenerator({ kind: 'audio' });
              s = new MediaStream([generator]);
            }
            for (const t of s.getAudioTracks()) {
              const info = {
                at: Date.now(),
                id: t.id,
                state: t.readyState,
                muted: t.muted,
                settings: t.getSettings(),
                events: [],
              };
              window.__diag.tracks.push(info);
              for (const e of ['ended', 'mute', 'unmute'])
                t.addEventListener(e, () =>
                  info.events.push({ e, at: Date.now(), state: t.readyState, muted: t.muted }),
                );
            }
            return s;
          };
        return a;
      };
      window.Audio.prototype = A.prototype;
      const C = AudioContext;
      window.AudioContext = class extends C {
        constructor(...args) {
          super(...args);
          const info = { at: Date.now(), state: this.state };
          window.__diag.contexts.push(info);
          this.addEventListener('statechange', () => {
            info.state = this.state;
          });
          const create = this.createAnalyser.bind(this);
          this.createAnalyser = () => {
            const analyser = create(),
              read = analyser.getFloatTimeDomainData.bind(analyser);
            analyser.getFloatTimeDomainData = a => {
              read(a);
              window.__diag.rms.push({
                at: Date.now(),
                rms: Math.sqrt(a.reduce((n, x) => n + x * x, 0) / a.length),
                context: this.state,
                audioTime: window.__audio.currentTime,
              });
            };
            return analyser;
          };
        }
      };
      const M = MediaRecorder;
      window.MediaRecorder = class extends M {
        constructor(...args) {
          super(...args);
          const info = { at: Date.now(), mime: this.mimeType, events: [], chunks: [] };
          window.__diag.recorders.push(info);
          window.__chunks = [];
          this.addEventListener('dataavailable', e => {
            info.chunks.push(e.data.size);
            window.__chunks.push(e.data);
          });
          for (const event of ['start', 'stop', 'error', 'pause', 'resume'])
            this.addEventListener(event, () => info.events.push({ event, at: Date.now(), state: this.state }));
        }
      };
      const nativePicker = window.showDirectoryPicker?.bind(window);
      window.showDirectoryPicker = async () => {
        window.__diag.picker++;
        if (pickerDelayMs) await new Promise(resolve => setTimeout(resolve, pickerDelayMs));
        if (realFolder) return (window.__folder = await nativePicker({ mode: 'readwrite', startIn: 'downloads' }));
        const root = await navigator.storage.getDirectory();
        return (window.__folder = await root.getDirectoryHandle('murugan-' + Date.now(), { create: true }));
      };
    },
    {
      pickerDelayMs: Number(process.env.RADIOBEE_PICKER_DELAY_MS || 0),
      stallFirstCapture: process.env.RADIOBEE_STALL_FIRST_CAPTURE === '1',
      realFolder: process.env.RADIOBEE_REAL_FOLDER === '1',
    },
  );
  const snap = () =>
    page.evaluate(() => ({
      diag: window.__diag,
      player: document.querySelector('app-player > section')?.textContent,
      recording: document.querySelector('app-recording-controls')?.textContent,
      audio: {
        src: window.__audio.currentSrc,
        time: window.__audio.currentTime,
        crossOrigin: window.__audio.crossOrigin,
        readyState: window.__audio.readyState,
        decoded: window.__audio.webkitAudioDecodedByteCount,
      },
      debug: !!window.ng,
    }));
  const assert = require('assert/strict');
  const control = () =>
    page.evaluate(() => {
      const c = ng.getComponent(document.querySelector('app-recording-controls'));
      return {
        state: c.recorder.state(),
        message: c.recorder.message(),
        seconds: c.recorder.seconds(),
        size: c.recorder.file()?.size,
        diagnostics: c.recorder.captureDiagnostics?.(),
      };
    });
  const open = async () => {
    if (!(await page.locator('.recording-panel').isVisible())) await page.locator('.recording-toggle').click();
  };
  const begin = async () => {
    await open();
    const consent = page.locator('.consent input');
    if (await consent.count()) await consent.check();
    await page.locator('.recording-panel .primary-action').filter({ hasText: 'Start recording' }).click();
    await page.waitForFunction(
      () => ng.getComponent(document.querySelector('app-recording-controls')).recorder.state() === 'recording',
      null,
      {
        timeout:
          (process.env.RADIOBEE_REAL_FOLDER === '1' ? 300000 : 20000) +
          Number(process.env.RADIOBEE_PICKER_DELAY_MS || 0),
      },
    );
    assert.equal(await page.locator('.recording-panel').count(), 0);
  };
  const waitSeconds = n =>
    page.waitForFunction(
      n => ng.getComponent(document.querySelector('app-recording-controls')).recorder.seconds() >= n,
      n,
      { timeout: 30000, polling: 100 },
    );
  const play = async id => {
    await page.locator(`[data-station-id="${id}"] .play`).click();
    await page.waitForFunction(
      () => document.querySelector('app-player > section [role=status]')?.textContent.trim() === 'Playing',
      null,
      { timeout: 45000 },
    );
  };
  const exportFile = async label => {
    assert.equal(await page.locator('.recording-panel button').filter({ hasText: 'Export recording' }).count(), 0);
    const existing = await page.evaluate(async () => {
      const names = [];
      for await (const [name] of window.__folder.entries()) names.push(name);
      return names;
    });
    const expectedSize = await page.evaluate(
      () => ng.getComponent(document.querySelector('app-recording-controls')).recorder.file().size,
    );
    await page.locator('.recording-launcher .quick-action').filter({ hasText: 'Export recording' }).click();
    await page.waitForFunction(() => {
      const r = ng.getComponent(document.querySelector('app-recording-controls')).recorder;
      return r.file() === null && document.querySelector('app-snackbar .message')?.textContent?.includes(
        'Export opened on this device.',
      );
    });
    assert.equal(await page.locator('.recording-launcher').getByText('Export recording').count(), 0);
    const exportedFile = await page.evaluate(async ({ existing, expectedSize }) => {
      for await (const [name, h] of window.__folder.entries()) {
        const f = await h.getFile();
        if (existing.includes(name) || f.size !== expectedSize) continue;
        const c = new AudioContext();
        try {
          const b = await c.decodeAudioData(await f.arrayBuffer()),
            s = b.getChannelData(0);
          return {
            name,
            size: f.size,
            duration: b.duration,
            rms: Math.sqrt(s.reduce((n, x) => n + x * x, 0) / s.length),
            peak: s.reduce((n, x) => Math.max(n, Math.abs(x)), 0),
            base64: await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(f);
            }),
          };
        } finally {
          await c.close();
        }
      }
    }, { existing, expectedSize });
    assert.ok(exportedFile && exportedFile.rms >= 0.001 && exportedFile.peak >= 0.01);
    fs.writeFileSync(`${output}/${label}.webm`, Buffer.from(exportedFile.base64, 'base64'));
    delete exportedFile.base64;
    return exportedFile;
  };
  try {
    await page.goto(base + '/world');
    await page.locator('[data-station-id]').first().waitFor({ timeout: 45000 });
    await play('stage29-tamil-kadavul-murugan-fm');
    await begin();
    assert.equal(await page.evaluate(() => window.__diag.picker), 1);
    report.firstFolder = true;
    report.captureRecovery = await page.evaluate(() => ({
      calls: window.__captureCalls,
      enabled: ng
        .getComponent(document.querySelector('app-recording-controls'))
        .recorder.start.toString()
        .includes('retryEmptyCapture'),
    }));
    if (process.env.RADIOBEE_STALL_FIRST_CAPTURE === '1') assert.equal(report.captureRecovery.calls, 2);
    await open();
    await page.locator('.close-panel').click();
    assert.equal((await control()).state, 'recording');
    report.collapsible = true;
    await page.evaluate(() => window.__audio.dispatchEvent(new Event('waiting')));
    await page.waitForTimeout(1500);
    assert.equal((await control()).state, 'recording');
    await page.evaluate(() => window.__audio.dispatchEvent(new Event('playing')));
    report.buffering = 'controlled waiting/playing events with genuine audio; capture retained';
    await waitSeconds(process.env.RADIOBEE_STALL_FIRST_CAPTURE === '1' ? 20 : 17);
    await page
      .locator('app-player > section')
      .getByRole('button', { name: /^Pause/ })
      .click();
    await page.waitForFunction(
      () => ng.getComponent(document.querySelector('app-recording-controls')).recorder.state() === 'ready',
    );
    report.murugan = { state: await control(), export: await exportFile('murugan-export') };
    assert.ok(report.murugan.export.duration >= 15);
    await page.locator('app-player > section').getByRole('button', { name: /^Play/ }).click();
    await page.waitForFunction(
      () => document.querySelector('app-player > section [role=status]')?.textContent.trim() === 'Playing',
    );
    await open();
    const checkbox = page.locator('.consent input');
    if (await checkbox.count()) await checkbox.check();
    const old = (await control()).size,
      before = await page.evaluate(() => window.__diag.recorders.length);
    await page.locator('.primary-action').filter({ hasText: 'Start recording' }).click();
    assert.equal((await control()).size, old);
    await page.getByRole('button', { name: 'Keep previous recording', exact: true }).click();
    assert.equal((await control()).size, old);
    assert.equal(await page.evaluate(() => window.__diag.recorders.length), before);
    report.draftCancel = true;
    await page.locator('.primary-action').filter({ hasText: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Discard previous and start', exact: true }).click();
    await waitSeconds(3);
    assert.equal(await page.locator('.recording-panel').count(), 0);
    await play('sooriyan-srilanka');
    await page.waitForFunction(
      () => ng.getComponent(document.querySelector('app-recording-controls')).recorder.state() === 'ready',
    );
    assert.ok((await control()).size > 256);
    assert.equal(await page.evaluate(() => window.__diag.recorders.length), before + 1);
    report.stationSwitch = 'old draft retained; no recorder starts for new station';
    await open();
    await page.locator('.consent input').check();
    await page.locator('.primary-action').filter({ hasText: 'Start recording' }).click();
    assert.ok((await control()).size > 256);
    await page.getByRole('button', { name: 'Discard previous and start', exact: true }).click();
    await waitSeconds(process.env.RADIOBEE_STALL_FIRST_CAPTURE === '1' ? 20 : 17);
    await page.locator('app-player > section').getByRole('button', { name: /^Stop/ }).click();
    await page.waitForFunction(
      () => ng.getComponent(document.querySelector('app-recording-controls')).recorder.state() === 'ready',
    );
    report.sooriyan = { state: await control(), export: await exportFile('sooriyan-export') };
    assert.ok(report.sooriyan.export.duration >= 15);
    assert.equal(await page.evaluate(() => window.__diag.picker), 1);
    await page.addScriptTag({
      path: path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'axe-core/axe.min.js'),
    });
    report.axe = await page.evaluate(async () =>
      (await axe.run({ include: [['app-recording-controls']] })).violations.map(v => ({ id: v.id, impact: v.impact })),
    );
    assert.deepEqual(report.axe, []);
    report.status = 'passed';
  } catch (e) {
    report.status = 'failed';
    report.error = String(e);
    console.error(e);
    try {
      report.last = await control();
    } catch {}
  } finally {
    try {
      report.observer = await snap();
      await page.screenshot({ path: path.join(output, 'regression.png') });
    } catch (e) {
      report.observationError = String(e);
    }
    fs.writeFileSync(path.join(output, 'regression.json'), JSON.stringify(report, null, 2));
    await context.close();
    await bridge.close();
    if (report.status !== 'passed') process.exitCode = 1;
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
