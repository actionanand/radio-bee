const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const script = path.resolve('scripts/serve-web-preview.cjs');
async function preview(t, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radiobee-preview-'));
  fs.mkdirSync(path.join(dir, 'www'));
  fs.writeFileSync(path.join(dir, 'www/index.html'), '<html><head></head><body>RadioBee</body></html>');
  fs.writeFileSync(
    path.join(dir, 'catalog.json'),
    JSON.stringify({
      manifest: { files: { stations: 'stations.json' }, localizationRoot: 'i18n/' },
      stations: [],
      localization: { en: {} },
    }),
  );
  const port = 33000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [script, '--port', String(port), ...args], { cwd: dir });
  let out = '',
    err = '';
  child.stdout.on('data', chunk => {
    out += chunk;
  });
  child.stderr.on('data', chunk => {
    err += chunk;
  });
  t.after(async () => {
    child.kill();
    await new Promise(resolve => child.once('close', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Preview start timeout ' + err)), 8000);
    child.stdout.once('data', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once('error', reject);
  });
  return { port, output: () => out, errors: () => err };
}
test('preview binds loopback by default and preserves production HTML/HTTPS configuration', async t => {
  const server = await preview(t);
  const response = await fetch(`http://127.0.0.1:${server.port}/radio-bee/home`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /__review_catalogue|nativeFetch|technicalTest/);
  const address = Object.values(os.networkInterfaces())
    .flat()
    .find(a => a.family === 'IPv4' && !a.internal)?.address;
  if (address)
    await assert.rejects(
      fetch(`http://${address}:${server.port}/radio-bee/home`, { signal: AbortSignal.timeout(2000) }),
    );
  assert.equal(server.errors(), '');
});
test('external development binding requires explicit opt-in and emits a warning', async t => {
  const server = await preview(t, ['--allow-external']);
  assert.match(server.errors(), /WARNING.*--allow-external.*network interfaces/);
  const address = Object.values(os.networkInterfaces())
    .flat()
    .find(a => a.family === 'IPv4' && !a.internal)?.address;
  if (address) assert.equal((await fetch(`http://${address}:${server.port}/radio-bee/home`)).status, 200);
});
test('review injection requires explicit snapshot and keeps the configured HTTPS base', async t => {
  const server = await preview(t, ['--snapshot', 'catalog.json', '--review-playback']);
  const html = await (await fetch(`http://127.0.0.1:${server.port}/radio-bee/home`)).text();
  assert.match(html, /LOCAL REVIEW/);
  assert.match(html, /https:\/\/actionanand.github.io\/radio-bee-data\/v1\//);
  assert.doesNotMatch(html, /liveStreamTests\s*[:=]\s*true|rightsStatus\s*[:=]\s*['"]permission-granted/);
  assert.equal((await fetch(`http://127.0.0.1:${server.port}/__review_catalogue/index.json`)).status, 200);
});
