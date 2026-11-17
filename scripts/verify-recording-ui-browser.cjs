// Actual V2 controls/service browser regression. Run manually; live probes are not normal CI.
// The system-folder chooser supplies a real OPFS handle for automation. Capture,
// encoding, IndexedDB, recording service, controls and file writes remain real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(
  path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'playwright'),
);
const output = path.resolve(process.env.RADIOBEE_RECORDING_UI_EVIDENCE || 'tmp/recording-review/ui');
const liveUrl = 'https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden';
const snapshot = path.resolve(process.env.RADIOBEE_DATA_ROOT || '../radio-bee-data/dist/v2');
const accessModule = ts.transpileModule(fs.readFileSync('src/app/recording/capture-access.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  let server, bridge, browser;
  let base = process.env.RADIOBEE_RECORDING_APP_URL;
  if (!base) {
    const { createPreview } = await import('./preview-discovery.mjs');
    server = createPreview({ webRoot: process.env.RADIOBEE_WEB_ROOT || 'www', dataRoot: snapshot, apiVersion: 'v2' });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://localhost:${server.address().port}/radio-bee`;
  }
  if (process.env.RADIOBEE_CDP_BRIDGE) {
    bridge = await require(path.resolve(process.env.RADIOBEE_CDP_BRIDGE)).attach(chromium);
    browser = bridge.browser;
  } else if (process.env.RADIOBEE_CDP_URL) browser = await chromium.connectOverCDP(process.env.RADIOBEE_CDP_URL);
  else browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'en-US' }),
    page = await context.newPage();
  const report = {
    base,
    browser: browser.version(),
    errors: [],
    network: [],
    assets: [],
    scenarios: [],
    exportDestination: 'Real OPFS test directory; chooser automation only, not OS folder-picker validation',
  };
  const assetTasks = [];
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => {
    if (r.url().includes('lotustechnologies'))
      report.network.push({ url: r.url(), method: r.request().method(), status: r.status(), headers: r.headers() });
    if (/\.js(?:\?|$)/.test(r.url()) && !r.url().includes('__radiobee_capture_access_test')) {
      assetTasks.push(
        (async () => {
          try {
            const body = await r.body();
            const entry = {
              url: r.url(),
              sha256: hash(body),
              bytes: body.length,
              headers: r.headers(),
              captureAccess: body.includes(Buffer.from('Recording media access unavailable')),
              captureService: body.includes(Buffer.from('Capture preparation timed out')),
              silenceValidation: body.includes(Buffer.from('No genuine audio')),
            };
            report.assets.push(entry);
            if (entry.captureAccess) fs.writeFileSync(path.join(output, 'deployed-recording-module.js'), body);
          } catch {}
        })(),
      );
    }
  });
  await context.route('**/__radiobee_capture_access_test.js', route =>
    route.fulfill({ contentType: 'text/javascript', body: accessModule }),
  );
  await context.addInitScript(() => {
    const evidence = (window.__recordingUI = {
      audios: [],
      events: [],
      rms: [],
      chunks: [],
      tracks: [],
      recorderCount: 0,
      microphoneRequests: 0,
      phase: 'startup',
    });
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        evidence.microphoneRequests++;
        throw Error('Microphone forbidden in output-only regression');
      };
    const Native = window.Audio;
    window.Audio = function (...args) {
      const a = new Native(...args);
      evidence.audios.push(a);
      for (const event of ['playing', 'pause', 'waiting', 'stalled', 'error', 'emptied'])
        a.addEventListener(event, () =>
          evidence.events.push({
            event,
            phase: evidence.phase,
            time: a.currentTime,
            src: a.currentSrc,
            cors: a.crossOrigin,
            error: a.error?.code,
          }),
        );
      const capture = a.captureStream?.bind(a);
      if (capture)
        a.captureStream = () => {
          const stream = capture();
          evidence.tracks.push(
            stream.getAudioTracks().map(t => ({ state: t.readyState, muted: t.muted, enabled: t.enabled })),
          );
          return stream;
        };
      return a;
    };
    window.Audio.prototype = Native.prototype;
    const C = window.AudioContext;
    window.AudioContext = class extends C {
      createAnalyser() {
        const a = super.createAnalyser(),
          read = a.getFloatTimeDomainData.bind(a);
        a.getFloatTimeDomainData = data => {
          read(data);
          evidence.rms.push({
            phase: evidence.phase,
            state: this.state,
            rms: Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length),
          });
        };
        return a;
      }
    };
    const M = window.MediaRecorder;
    window.MediaRecorder = class extends M {
      constructor(...args) {
        super(...args);
        evidence.recorderCount++;
        this.addEventListener('dataavailable', event =>
          evidence.chunks.push({ bytes: event.data.size, phase: evidence.phase }),
        );
      }
    };
    window.__exportFailure = false;
    const nativeGetFile = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (...args) {
      if (window.__exportFailure && this.name.startsWith('radiobee-ui-') && args[1]?.create)
        throw new DOMException('Injected filesystem write failure', 'NotAllowedError');
      return nativeGetFile.apply(this, args);
    };
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const name = 'radiobee-ui-' + Date.now();
      localStorage.setItem('radiobee.browser-test-directory', name);
      return root.getDirectoryHandle(name, { create: true });
    };
  });
  const panel = page.locator('.recording-panel');
  const player = page.locator('app-player > section');
  const captureEvidence = () =>
    page.evaluate(() => {
      const d = window.__recordingUI;
      return d
        ? {
            events: d.events,
            rms: d.rms,
            chunks: d.chunks,
            tracks: d.tracks,
            recorderCount: d.recorderCount,
            microphoneRequests: d.microphoneRequests,
          }
        : null;
    });
  const mark = phase => page.evaluate(p => (window.__recordingUI.phase = p), phase);
  const waitPlaying = () =>
    page.waitForFunction(
      () => {
        const a = window.__recordingUI.audios[0];
        return (
          a &&
          !a.paused &&
          a.readyState >= 2 &&
          document.querySelector('app-player > section .track [role=status]')?.textContent.trim() === 'Playing'
        );
      },
      null,
      { timeout: 45_000 },
    );
  const start = async () => {
    if (!(await panel.isVisible())) await page.locator('.recording-toggle').click();
    const consent = panel.locator('.consent input');
    if (await consent.count()) await consent.check();
    const action = panel.locator('.primary-action').filter({ hasText: 'Start recording' });
    assert.ok(await action.isEnabled());
    await action.click();
    await page.waitForFunction(
      () => /[1-9][0-9]* s/.test(document.querySelector('.recording-toggle')?.textContent),
      null,
      { timeout: 20_000 },
    );
  };
  const ready = () =>
    page.waitForFunction(
      () => !!document.querySelector('.recording-launcher .quick-action')?.textContent.includes('Export recording'),
      null,
      { timeout: 10_000 },
    );
  const discard = async () => {
    if (!(await panel.isVisible())) await page.locator('.recording-toggle').click();
    await panel.locator('button').filter({ hasText: 'Discard' }).click();
  };
  try {
    await page.goto(base + '/settings');
    await page.locator('.folder-button').click();
    await page.waitForFunction(() => document.querySelector('app-settings-page')?.textContent.includes('radiobee-ui-'));
    report.limits = await page.locator('[data-recording-settings-limit]').innerText();
    assert.ok(report.limits.includes('1 hour') && report.limits.includes('80 MB'));
    await page.goto(base + '/world');
    await page.locator('[data-station-id=sooriyan-srilanka] .play').click();
    await waitPlaying();
    assert.equal(await page.evaluate(() => window.__recordingUI.audios[0].currentSrc), liveUrl);
    // Exercise the actual GET helper while ordinary playback stays attached.
    await mark('access-only');
    const before = await page.evaluate(() => ({
      time: window.__recordingUI.audios[0].currentTime,
      events: window.__recordingUI.events.length,
    }));
    await page.evaluate(async url => {
      const { checkCaptureAccess } = await import('/__radiobee_capture_access_test.js');
      await checkCaptureAccess(url, new AbortController().signal);
    }, liveUrl);
    await page.waitForFunction(t => window.__recordingUI.audios[0].currentTime >= t + 5, before.time, {
      timeout: 10_000,
    });
    report.accessContinuity = await page.evaluate(before => {
      const d = window.__recordingUI,
        a = d.audios[0];
      return {
        before: before.time,
        after: a.currentTime,
        paused: a.paused,
        src: a.currentSrc,
        events: d.events.slice(before.events),
      };
    }, before);
    assert.ok(!report.accessContinuity.paused);
    assert.ok(!report.accessContinuity.events.some(e => ['error', 'pause', 'emptied'].includes(e.event)));
    // Controlled event regression, not a claim of a naturally occurring outage.
    await page.locator('.recording-toggle').click();
    const consent = panel.locator('.consent input');
    if (await consent.count()) await consent.check();
    await page.evaluate(() => window.__recordingUI.audios[0].dispatchEvent(new Event('waiting')));
    await page.waitForFunction(() => document.querySelector('.recording-toggle')?.disabled);
    assert.ok(await panel.locator('button').filter({ hasText: 'Start recording' }).isDisabled());
    await page.evaluate(() => window.__recordingUI.audios[0].dispatchEvent(new Event('playing')));
    await waitPlaying();
    await mark('first-capture');
    await start();
    await page.evaluate(() => window.__recordingUI.audios[0].dispatchEvent(new Event('waiting')));
    await page.waitForFunction(() =>
      /[3-9] s/.test(document.querySelector('.recording-toggle')?.textContent),
    );
    await page.evaluate(() => window.__recordingUI.audios[0].dispatchEvent(new Event('playing')));
    await waitPlaying();
    await page.waitForFunction(
      () => /1[0-9] s/.test(document.querySelector('.recording-toggle')?.textContent),
      null,
      { timeout: 20_000 },
    );
    assert.equal(await page.evaluate(() => window.__recordingUI.recorderCount), 1);
    report.scenarios.push(
      'Connecting/buffering disables Start; active recording survives controlled waiting/playing events without a second recorder',
    );
    await page.screenshot({ path: path.join(output, 'recording.png') });
    await player.getByRole('button', { name: /^Pause/ }).click();
    await ready();
    await page.evaluate(() => (window.__exportFailure = true));
    await page.locator('.recording-launcher .quick-action').filter({ hasText: 'Export recording' }).click();
    if (!(await panel.isVisible())) await page.locator('.recording-toggle').click();
    await page.waitForFunction(() =>
      document.querySelector('.recording-panel')?.textContent.includes('Your recording is still available to retry'),
    );
    assert.ok(await page.locator('.recording-launcher .quick-action').filter({ hasText: 'Export recording' }).isEnabled());
    await page.evaluate(() => (window.__exportFailure = false));
    await page.locator('.recording-launcher .quick-action').filter({ hasText: 'Export recording' }).click();
    await page.waitForFunction(() =>
      document.querySelector('.recording-panel')?.textContent.includes('Export opened on this device.'),
    );
    const file = await page.evaluate(async () => {
      for await (const [name, handle] of (
        await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle(localStorage.getItem('radiobee.browser-test-directory'))
      ).entries()) {
        if (handle.kind !== 'file') continue;
        const file = await handle.getFile(),
          context = new AudioContext();
        try {
          const decoded = await context.decodeAudioData(await file.arrayBuffer()),
            samples = decoded.getChannelData(0);
          const base64 = await new Promise(r => {
            const reader = new FileReader();
            reader.onload = () => r(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
          });
          return {
            name,
            size: file.size,
            duration: decoded.duration,
            rms: Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length),
            peak: samples.reduce((p, v) => Math.max(p, Math.abs(v)), 0),
            base64,
          };
        } finally {
          await context.close();
        }
      }
    });
    assert.ok(file && file.duration >= 10 && file.rms >= 0.001 && file.peak >= 0.01);
    const bytes = Buffer.from(file.base64, 'base64');
    delete file.base64;
    fs.writeFileSync(path.join(output, 'sooriyan-ui-export.webm'), bytes);
    file.sha256 = hash(bytes);
    report.export = file;
    report.scenarios.push(
      'Pause retains the genuine draft; Export failure retains it; retry writes and decodes the actual file',
    );
    await discard();
    await player.getByRole('button', { name: /^Play/ }).click();
    await waitPlaying();
    await mark('stop-capture');
    await start();
    await player.getByRole('button', { name: /^Stop/ }).click();
    await ready();
    assert.equal(await page.evaluate(() => window.__recordingUI.recorderCount), 2);
    await discard();
    await page.locator('[data-station-id=sooriyan-srilanka] .play').click();
    await waitPlaying();
    await mark('switch-capture');
    await start();
    if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('[data-station-id=vasantham-srilanka] .play').click();
    if (!(await panel.isVisible())) await page.locator('.recording-toggle').click();
    await ready();
    assert.equal(await page.evaluate(() => window.__recordingUI.recorderCount), 3);
    assert.ok((await player.locator('.track strong').innerText()).includes('Vasantham'));
    await player.getByRole('button', { name: /^Stop/ }).click();
    assert.ok(await page.locator('.recording-launcher .quick-action').filter({ hasText: 'Export recording' }).isVisible());
    assert.equal(await panel.locator('button').filter({ hasText: 'Export recording' }).count(), 0);
    report.scenarios.push('Stop and station switch retain drafts and do not automatically start another recorder');
    report.capture = await page.evaluate(() => {
      const d = window.__recordingUI;
      return {
        events: d.events,
        rms: d.rms,
        chunks: d.chunks,
        tracks: d.tracks,
        recorderCount: d.recorderCount,
        microphoneRequests: d.microphoneRequests,
      };
    });
    assert.equal(report.capture.microphoneRequests, 0);
    report.cache = await page.evaluate(async () => ({
      serviceWorkers: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope),
      cacheKeys: await caches.keys(),
      userAgent: navigator.userAgent,
    }));
    await Promise.all(assetTasks);
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = String(error);
    try {
      report.capture = await captureEvidence();
      report.panel = await panel.innerText({ timeout: 2000 });
      await page.screenshot({ path: path.join(output, 'failure.png') });
    } catch {}
    throw error;
  } finally {
    await Promise.all(assetTasks);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    await context.close();
    if (bridge) bridge.close();
    else await browser.close();
    server?.close();
  }
})()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
