// Manual browser regression: generated audio is a deterministic test, never proof of live radio.
// Linux Node only. No microphone, raw-radio download, relay or security bypass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const ts = require('typescript');
const toolsRoot = path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules');
const { chromium } = require(path.join(toolsRoot, 'playwright'));
const output = path.resolve(process.env.RADIOBEE_RECORDING_EVIDENCE || 'tmp/recording-investigation/regression');
const duration = 12_000;
function wave(silent) {
  const rate = 48_000,
    seconds = 20,
    data = Buffer.alloc(44 + rate * seconds * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  if (!silent)
    for (let i = 0; i < rate * seconds; i++)
      data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return data;
}
const tone = wave(false),
  silence = wave(true);
const adapter = ts.transpileModule(fs.readFileSync('src/app/recording/capture-engine.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  // This endpoint deliberately proves that HEAD CORS does not imply GET CORS.
  if (request.url !== '/head-only.wav' || request.method === 'HEAD')
    response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url === '/adapter.js') {
    response.setHeader('Content-Type', 'text/javascript');
    return response.end(adapter);
  }
  if (request.url.endsWith('.wav')) {
    response.setHeader('Content-Type', 'audio/wav');
    return response.end(request.method === 'HEAD' ? undefined : request.url === '/silence.wav' ? silence : tone);
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><html lang="en"><title>RadioBee capture regression</title><button id="start">Start test capture</button><button id="export">Export actual recording</button></html>',
  );
}
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const app = http.createServer(handler),
    media = http.createServer(handler);
  await Promise.all([listen(app), listen(media)]);
  const origin = `http://127.0.0.1:${app.address().port}`,
    source = `http://127.0.0.1:${media.address().port}`;
  let bridge, browser;
  if (process.env.RADIOBEE_CDP_BRIDGE) {
    bridge = await require(path.resolve(process.env.RADIOBEE_CDP_BRIDGE)).attach(chromium);
    browser = bridge.browser;
  } else if (process.env.RADIOBEE_CDP_URL) browser = await chromium.connectOverCDP(process.env.RADIOBEE_CDP_URL);
  else browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const report = { browser: browser.version(), deterministic: [], live: [], microphoneRequested: false };
  try {
    const cases = [
      { name: 'cors-generated-signal', url: source + '/tone.wav', genuine: true },
      { name: 'cors-generated-silence', url: source + '/silence.wav', genuine: false },
    ];
    if (process.env.RADIOBEE_LIVE_STREAM_URL) {
      const url = new URL(process.env.RADIOBEE_LIVE_STREAM_URL);
      assert.ok(
        url.protocol === 'https:' && !url.username && !url.password,
        'Live source requires credential-free HTTPS',
      );
      cases.push({ name: 'live-sooriyan', url: url.href, genuine: true, live: true });
    }
    for (const test of cases) {
      const page = await context.newPage(),
        network = [];
      page.on('response', response => {
        if (response.url() === test.url)
          network.push({ status: response.status(), url: response.url(), headers: response.headers() });
      });
      page.on('requestfailed', request => network.push({ url: request.url(), failure: request.failure() }));
      await page.goto(origin);
      await page.evaluate(
        async ({ url, duration }) => {
          const { captureRadio } = await import('/adapter.js');
          const result = (window.captureResult = { progress: [], tracks: [], chunks: [], rms: [] });
          const Context = window.AudioContext;
          window.AudioContext = class extends Context {
            createAnalyser() {
              const analyser = super.createAnalyser(),
                read = analyser.getFloatTimeDomainData.bind(analyser);
              analyser.getFloatTimeDomainData = data => {
                read(data);
                result.rms.push({
                  state: this.state,
                  value: Math.sqrt(data.reduce((power, sample) => power + sample * sample, 0) / data.length),
                });
              };
              return analyser;
            }
          };
          const Recorder = window.MediaRecorder;
          window.MediaRecorder = class extends Recorder {
            constructor(...args) {
              super(...args);
              this.addEventListener('dataavailable', event => result.chunks.push(event.data.size));
            }
          };
          document.querySelector('#start').onclick = async () => {
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.src = url;
            const capture = audio.captureStream.bind(audio);
            audio.captureStream = () => {
              const stream = capture();
              result.tracks = stream.getAudioTracks().map(track => ({ state: track.readyState, muted: track.muted }));
              return stream;
            };
            try {
              await audio.play();
              const handle = await captureRadio(audio, new AbortController().signal, {
                progress: (seconds, genuine) => result.progress.push({ seconds, genuine }),
                failed: () => {
                  result.error = 'Capture failed';
                  result.done = true;
                },
                finished: (blob, reason) => {
                  window.recorded = blob;
                  result.size = blob?.size ?? 0;
                  result.reason = reason;
                  result.done = true;
                  audio.pause();
                },
              });
              setTimeout(() => handle.stop(), duration);
            } catch (error) {
              result.error = String(error);
              result.done = true;
              audio.pause();
            }
          };
          document.querySelector('#export').onclick = () => {
            const anchor = document.createElement('a');
            anchor.download = 'radio-capture.webm';
            anchor.href = URL.createObjectURL(window.recorded);
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
          };
        },
        { url: test.url, duration },
      );
      await page.locator('#start').click();
      await page.waitForFunction(() => window.captureResult.done, null, { timeout: 35_000 });
      const result = await page.evaluate(() => window.captureResult);
      if (test.genuine) {
        assert.ok(!result.error, JSON.stringify(result));
        assert.ok(result.progress.some(row => row.genuine));
        assert.ok(result.size > 256);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
        const file = path.join(output, test.name + '.webm');
        await download.saveAs(file);
        const bytes = fs.readFileSync(file);
        assert.equal(bytes.length, result.size);
        result.decoded = await page.evaluate(async base64 => {
          const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
            context = new AudioContext();
          try {
            const decoded = await context.decodeAudioData(data.buffer),
              samples = decoded.getChannelData(0);
            return {
              duration: decoded.duration,
              sampleRate: decoded.sampleRate,
              channels: decoded.numberOfChannels,
              rms: Math.sqrt(samples.reduce((power, sample) => power + sample * sample, 0) / samples.length),
              peak: samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
            };
          } finally {
            await context.close();
          }
        }, bytes.toString('base64'));
        assert.ok(result.decoded.duration >= 10, 'At least ten decoded seconds required');
        assert.ok(
          result.decoded.rms >= 0.001 && result.decoded.peak >= 0.01,
          'Encoded silence must never count as recording success',
        );
      } else {
        assert.equal(result.size, 0);
        assert.ok(!result.progress.some(row => row.genuine));
      }
      (test.live ? report.live : report.deterministic).push({ name: test.name, ...result, network });
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
      await page.close();
    }
    const page = await context.newPage();
    await page.goto(origin);
    const cors = await page.evaluate(async url => {
      const head = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' });
      let getBlocked = false;
      try {
        await fetch(url, { mode: 'cors', credentials: 'omit' });
      } catch {
        getBlocked = true;
      }
      const audio = new Audio();
      audio.src = url;
      await audio.play();
      let captureBlocked = false;
      try {
        audio.captureStream();
      } catch (error) {
        captureBlocked = error.name === 'SecurityError';
      }
      const playing = !audio.paused && audio.readyState >= 2;
      audio.pause();
      return { head: head.status, getBlocked, captureBlocked, ordinaryPlaybackPreserved: playing };
    }, source + '/head-only.wav');
    assert.deepEqual(cors, { head: 200, getBlocked: true, captureBlocked: true, ordinaryPlaybackPreserved: true });
    report.headOnlyCors = cors;
    report.status = 'passed';
    await page.close();
  } catch (error) {
    report.status = 'failed';
    report.error = String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    await context.close();
    if (bridge) bridge.close();
    else await browser.close();
    app.close();
    media.close();
  }
})()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
