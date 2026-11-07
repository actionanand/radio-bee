// Manual live-source diagnostic, deliberately excluded from CI. No audio is retained.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const { chromium } = require(
  path.resolve(process.env.RADIOBEE_BROWSER_TOOLS || 'tmp/ci-tools/node_modules', 'playwright'),
);
const url = 'https://radio.wavespb.com/live/10c64309264eb009/10c64309264eb009.m3u8';
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/hls.js' ? 'text/javascript' : 'text/html');
  res.end(
    req.url === '/hls.js'
      ? fs.readFileSync('node_modules/hls.js/dist/hls.min.js')
      : '<!doctype html><html lang="en"><title>HLS path comparison</title><button id="play">Start real radio</button><script src="/hls.js"></script></html>',
  );
});
const result = { url, startedAt: new Date().toISOString(), attempts: [] };
const output = process.env.RADIOBEE_HLS_REPORT || 'documentation/stage7-review/hls-comparison.json';
const save = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
};
(async () => {
  await new Promise(resolve => server.listen(3074, '127.0.0.1', resolve));
  const bridge = process.env.RADIOBEE_BROWSER_BRIDGE
    ? await require(path.resolve(process.env.RADIOBEE_BROWSER_BRIDGE)).attach(chromium)
    : {
        browser: await chromium.launch(),
        async close() {
          await this.browser.close();
        },
      };
  result.browser = bridge.browser.version();
  try {
    // Same browser, fresh context per engine; repeat in reverse order to expose transient network effects.
    for (const engine of ['native', 'hls.js', 'hls.js', 'native']) {
      const context = await bridge.browser.newContext();
      const page = await context.newPage();
      const row = { engine, responses: [], failures: [], played: false };
      result.attempts.push(row);
      const pending = [];
      page.on('response', response => {
        if (!response.url().startsWith('https:')) return;
        pending.push(
          (async () => {
            const headers = await response.allHeaders();
            row.responses.push({
              url: response.url(),
              status: response.status(),
              mime: headers['content-type'],
              cors: headers['access-control-allow-origin'] ?? null,
              redirectedFrom: response.request().redirectedFrom()?.url() ?? null,
            });
          })(),
        );
      });
      page.on('requestfailed', request =>
        row.failures.push({ url: request.url(), error: request.failure()?.errorText }),
      );
      try {
        await page.goto('http://localhost:3074/');
        row.capabilities = await page.evaluate(() => ({
          native: !!new Audio().canPlayType('application/vnd.apple.mpegurl'),
          hlsJs: Hls.isSupported(),
        }));
        if (!row.capabilities[engine === 'native' ? 'native' : 'hlsJs']) {
          row.unsupported = true;
          continue;
        }
        await page.evaluate(
          ({ engine, url }) => {
            const audio = new Audio();
            window.audio = audio;
            window.events = [];
            window.hlsErrors = [];
            for (const event of ['loadstart', 'waiting', 'playing', 'pause', 'error', 'stalled', 'ended'])
              audio.addEventListener(event, () =>
                window.events.push({
                  event,
                  time: audio.currentTime,
                  at: performance.now(),
                  error: audio.error && { code: audio.error.code, message: audio.error.message },
                }),
              );
            document.querySelector('button').onclick = async () => {
              try {
                if (engine === 'native') {
                  audio.src = url;
                  await audio.play();
                } else {
                  const hls = new Hls({ enableWorker: true });
                  window.hls = hls;
                  hls.on(Hls.Events.ERROR, (_, data) =>
                    window.hlsErrors.push({ type: data.type, details: data.details, fatal: data.fatal }),
                  );
                  hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));
                  hls.on(Hls.Events.MANIFEST_PARSED, () =>
                    audio.play().catch(error => (window.playError = error.message)),
                  );
                  hls.attachMedia(audio);
                }
              } catch (error) {
                window.playError = error.message;
              }
            };
          },
          { engine, url },
        );
        await page.click('button');
        await page.waitForFunction(
          () => audio.currentTime > 1 && !audio.paused && events.some(e => e.event === 'playing'),
          null,
          { timeout: 35000 },
        );
        const before = await page.evaluate(() => ({
          time: audio.currentTime,
          bytes: audio.webkitAudioDecodedByteCount ?? null,
        }));
        await new Promise(resolve => setTimeout(resolve, 20000));
        const after = await page.evaluate(() => ({
          time: audio.currentTime,
          bytes: audio.webkitAudioDecodedByteCount ?? null,
          paused: audio.paused,
          error: audio.error?.message,
        }));
        row.continuitySeconds = after.time - before.time;
        row.decodedByteIncrease = after.bytes === null ? null : after.bytes - before.bytes;
        row.played = row.continuitySeconds > 15 && !after.paused && !after.error;
      } catch (error) {
        row.error = error.message;
      } finally {
        row.media = await page.evaluate(() => ({
          events: window.events,
          hlsErrors: window.hlsErrors,
          playError: window.playError,
          src: window.audio?.currentSrc,
        }));
        // Evidence before intentional teardown; aborts during cleanup are not source failures.
        await Promise.allSettled(pending);
        await page.evaluate(() => {
          window.hls?.destroy();
          window.audio?.pause();
          window.audio?.removeAttribute('src');
          window.audio?.load();
        });
        await context.close();
        save();
        console.log(
          JSON.stringify({ engine, played: row.played, continuity: row.continuitySeconds, error: row.error }),
        );
      }
    }
  } finally {
    await bridge.close();
    server.close();
    save();
  }
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
