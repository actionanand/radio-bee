import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  TV_MIN,
  TV_MAX,
  MOBILE_MAX,
  readTvVersion,
  nextTvVersion,
  validateTvVersion,
  tvReleaseName,
} from './tv-version.mjs';
import mobile from './android-version.cjs';
import { readCapacitorIdentity } from './capacitor-identity.mjs';
import { publishTv } from './publish-tv-artifacts.mjs';
import { reserveTvVersion } from './reserve-tv-version.mjs';
import { signTv, cleanupTvSigning } from './sign-tv.mjs';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
function temporary(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'radiobee-tv-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
}
const seed = { versionCode: TV_MIN, versionName: '1.0.0' };
test('native TV and mobile share Capacitor identity without duplicate localized names', () => {
  const { appId, appName } = readCapacitorIdentity();
  assert.equal(appId, 'com.actionanand.radiobee.app');
  assert.ok(appName.length > 0);
  const gradle = fs.readFileSync('android-tv/app/build.gradle.kts', 'utf8');
  assert.match(gradle, /rootProject\.file\("\.\.\/capacitor\.config\.ts"\)/);
  assert.match(gradle, /applicationId = sharedAppId/);
  assert.match(gradle, /resValue\("string", "app_name", sharedAppName\)/);
  const tvUi = fs.readFileSync('android-tv/app/src/main/java/com/actionanand/radiobee/tv/ui/RadioBeeTv.kt', 'utf8');
  const prompts = fs.readFileSync('android-tv/app/src/main/java/com/actionanand/radiobee/tv/ui/PlaybackPreferences.kt', 'utf8');
  assert.match(tvUi, /stringResource\(R\.string\.app_name\)/);
  assert.match(prompts, /stringResource\(R\.string\.app_name\)/);
  for (const locale of ['values', 'values-ta', 'values-sa']) {
    const xml = fs.readFileSync('android-tv/app/src/main/res/' + locale + '/strings.xml', 'utf8');
    assert.doesNotMatch(xml, /<string name="app_name">/);
    assert.ok(!xml.includes(appName), 'localized copy of common name in ' + locale);
    for (const key of ['legal_notice', 'background_question', 'background_description', 'app_version']) {
      assert.match(xml, new RegExp('<string name="' + key + '">[^\\n]*%1\\$s'));
    }
  }
});

test('TV codes are globally disjoint from the enforced mobile range', () => {
  assert.equal(mobile.MOBILE_VERSION_MAX, MOBILE_MAX);
  mobile.validateVersion({ versionCode: MOBILE_MAX, versionName: '1.0.0' });
  assert.throws(() => mobile.validateVersion(seed));
  assert.throws(() => validateTvVersion({ versionCode: MOBILE_MAX, versionName: '1.0.0' }));
});
test('TV version increments and explicit semantic changes preserve monotonic codes', () => {
  assert.deepEqual(nextTvVersion(seed), { versionCode: TV_MIN + 1, versionName: '1.0.0' });
  assert.equal(nextTvVersion(seed, 'patch').versionName, '1.0.1');
  assert.equal(nextTvVersion({ ...seed, versionName: '2.3.4' }, 'minor').versionName, '2.4.0');
  assert.equal(nextTvVersion({ ...seed, versionName: '2.3.4' }, 'major').versionName, '3.0.0');
  assert.equal(tvReleaseName(seed), 'RadioBee-TV-1-0-0-1000000000');
});
test('overflow, malformed versions and invalid increments fail closed', () => {
  for (const v of [
    null,
    {},
    { ...seed, versionCode: TV_MAX + 1 },
    { ...seed, versionCode: TV_MIN + 0.5 },
    { ...seed, versionName: '01.0.0' },
    { ...seed, versionName: '9007199254740992.0.0' },
  ])
    assert.throws(() => validateTvVersion(v));
  assert.throws(() => nextTvVersion({ ...seed, versionCode: TV_MAX }));
  assert.throws(() => nextTvVersion(seed, 'reset'));
});
function reservationRepo(t) {
  const root = temporary(t),
    remote = path.join(root, 'remote.git'),
    work = path.join(root, 'work');
  const run = (directory, args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  run(root, ['init', '--bare', remote]);
  fs.mkdirSync(work);
  run(work, ['init', '-b', 'master']);
  run(work, ['config', 'user.name', 'TV Test']);
  run(work, ['config', 'user.email', 'tv@example.invalid']);
  write(work, 'android-version.json', { versionCode: 7, versionName: '1.0.0' });
  write(work, 'tv-version.json', seed);
  write(
    work,
    'scripts/android-version.cjs',
    fs.readFileSync(new URL('./android-version.cjs', import.meta.url), 'utf8'),
  );
  run(work, ['add', '.']);
  run(work, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial']);
  run(work, ['remote', 'add', 'origin', remote]);
  run(work, ['push', 'origin', 'master']);
  run(work, ['branch', 'main-android']);
  run(work, ['push', 'origin', 'main-android']);
  run(work, ['switch', '-c', 'main-tv']);
  run(work, ['push', '-u', 'origin', 'main-tv']);
  return { root, work, remote, git: args => run(work, args), run };
}
test('reservations persist before a build and failed build codes are not reused', t => {
  const f = reservationRepo(t);
  const one = reserveTvVersion(f.work);
  assert.equal(one.versionCode, TV_MIN + 1);
  const two = reserveTvVersion(f.work);
  assert.equal(two.versionCode, TV_MIN + 2);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.git(['rev-parse', 'origin/main-tv']));
});
test('ordinary feature and PR validation cannot reserve versions', t => {
  const f = reservationRepo(t);
  f.git(['switch', '-c', 'feature/test']);
  assert.throws(() => reserveTvVersion(f.work), /main-tv/);
  assert.deepEqual(readTvVersion(f.work), seed);
});
test('a stale concurrent remote ref blocks allocation without rewriting files', t => {
  const f = reservationRepo(t);
  const other = path.join(f.root, 'other');
  f.run(f.root, ['clone', '--branch', 'main-tv', f.remote, other]);
  f.run(other, ['config', 'user.name', 'Other']);
  f.run(other, ['config', 'user.email', 'other@example.invalid']);
  write(other, 'change.txt', 'new source');
  f.run(other, ['add', '.']);
  f.run(other, ['commit', '-m', 'concurrent']);
  f.run(other, ['push']);
  assert.throws(() => reserveTvVersion(f.work), /advanced/);
  assert.deepEqual(readTvVersion(f.work), seed);
});
test('synchronization cannot roll back a reserved TV code', t => {
  const f = reservationRepo(t);
  reserveTvVersion(f.work);
  write(f.work, 'tv-version.json', seed);
  f.git(['add', '.']);
  f.git(['commit', '-m', 'unsafe reset']);
  f.git(['push']);
  assert.throws(() => reserveTvVersion(f.work), /rolled back/);
});
test('TV release is blocked until mobile deployment has the shared range guard', t => {
  const f = reservationRepo(t);
  f.git(['switch', 'main-android']);
  write(f.work, 'scripts/android-version.cjs', 'module.exports = {};');
  f.git(['add', '.']);
  f.git(['commit', '-m', 'old mobile']);
  f.git(['push', 'origin', 'main-android']);
  f.git(['switch', 'main-tv']);
  assert.throws(() => reserveTvVersion(f.work), /guard missing/);
  assert.deepEqual(readTvVersion(f.work), seed);
});
function signingFixture(t) {
  const root = temporary(t);
  write(root, 'tv-version.json', seed);
  for (const file of [
    'android-tv/app/build/outputs/apk/release/app-release-unsigned.apk',
    'android-tv/app/build/outputs/bundle/release/app-release.aab',
    'android-tv/app/build/outputs/mapping/release/mapping.txt',
  ])
    write(root, file, 'controlled unsigned fixture');
  const env = {
    ...process.env,
    RUNNER_TEMP: root,
    KEYSTORE_BASE64: Buffer.from('controlled fixture').toString('base64'),
    KEYSTORE_PASSWORD: 'not-a-real-password',
    KEY_PASSWORD: 'separate-test-password',
    KEY_ALIAS: 'test-alias',
    ANDROID_HOME: '/fake-sdk',
  };
  return { root, env };
}
test('signs APK/AAB candidates, checks signatures and removes owned keystore material', t => {
  const f = signingFixture(t),
    calls = [];
  const name = signTv({
    ...f,
    run: (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'keytool') return args.includes('-alias') ? 'PrivateKeyEntry' : 'Keystore type: PKCS12';
      if (command.endsWith('zipalign') && args.includes('-f')) fs.copyFileSync(args.at(-2), args.at(-1));
      if (command === 'jarsigner' && args.includes('-signedjar'))
        fs.copyFileSync(args.at(-2), args[args.indexOf('-signedjar') + 1]);
      return command === 'jarsigner' ? 'jar verified.' : '';
    },
  });
  assert.equal(name, tvReleaseName(seed));
  assert.ok(fs.existsSync(path.join(f.root, 'releases/tv', name + '.apk')));
  assert.ok(fs.existsSync(path.join(f.root, 'releases/tv', name + '-mapping.txt')));
  assert.equal(fs.existsSync(f.env.TV_SIGNING_DIR), false);
  for (const call of calls) {
    assert.ok(!call.args.includes(f.env.KEYSTORE_PASSWORD));
    assert.ok(!call.args.includes('separate-test-password'));
    if (call.command === 'jarsigner') assert.equal(call.options.env.KEY_PASSWORD, f.env.KEYSTORE_PASSWORD);
  }
});
test('failed signing preserves no candidate, final file or private keystore', t => {
  const f = signingFixture(t);
  assert.throws(() =>
    signTv({
      ...f,
      run: () => {
        throw Error('simulated tool failure');
      },
    }),
  );
  assert.equal(fs.existsSync(f.env.TV_SIGNING_DIR), false);
  assert.ok(!fs.existsSync(path.join(f.root, 'releases/tv', tvReleaseName(seed) + '.apk')));
});
test('published TV outputs are never overwritten', t => {
  const f = signingFixture(t);
  write(f.root, 'releases/tv/' + tvReleaseName(seed) + '.apk', 'existing');
  assert.throws(() => signTv({ ...f, run: () => '' }), /exists/);
  assert.equal(fs.readFileSync(path.join(f.root, 'releases/tv', tvReleaseName(seed) + '.apk'), 'utf8'), 'existing');
});
test('cleanup rejects paths outside its owned runner prefix', t => {
  const root = temporary(t);
  assert.throws(() => cleanupTvSigning({ RUNNER_TEMP: root, TV_SIGNING_DIR: root }), /unsafe/);
  const owned = fs.mkdtempSync(path.join(root, 'radiobee-tv-signing-'));
  write(owned, 'secret.jks', 'controlled');
  cleanupTvSigning({ RUNNER_TEMP: root, TV_SIGNING_DIR: owned });
  assert.equal(fs.existsSync(owned), false);
});
test('PR native workflow is read-only and does not use signing secrets or allocate versions', () => {
  const text = fs.readFileSync(new URL('../.github/workflows/tv-validation.yml', import.meta.url), 'utf8');
  assert.match(text, /pull_request:/);
  assert.match(text, /contents: read/);
  assert.doesNotMatch(text, /secrets\.|reserve-tv-version|contents: write|sign-tv.mjs/);
  for (const task of ['lintDebug', 'testDebugUnitTest', 'assembleDebug', 'assembleDebugAndroidTest'])
    assert.ok(text.includes(task));
});
test('release workflow gates main-tv and explicit manual releases; signing cleanup always runs', () => {
  const text = fs.readFileSync(new URL('../.github/workflows/tv-build.yml', import.meta.url), 'utf8');
  assert.ok(text.includes("github.ref == 'refs/heads/main-tv'"));
  assert.ok(text.includes('inputs.release == true'));
  assert.ok(text.includes('cancel-in-progress: false'));
  assert.ok(text.includes('node scripts/reserve-tv-version.mjs'));
  assert.ok(text.includes('if: always()'));
  assert.ok(text.includes('node scripts/sign-tv.mjs --cleanup'));
  for (const key of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'])
    assert.ok(text.includes('secrets.' + key));
  assert.doesNotMatch(text, /gradle-play-publisher|upload_to_play_store|KEYSTORE_PASSWORD=\S/);
});
test('native identity, manifest, sleep ownership and recording restrictions are explicit', () => {
  const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const manifest = read('android-tv/app/src/main/AndroidManifest.xml'),
    gradle = read('android-tv/app/build.gradle.kts');
  assert.match(gradle, /applicationId = "com.actionanand.radiobee.app"/);
  assert.match(gradle, /namespace = "com.actionanand.radiobee.tv"/);
  assert.match(manifest, /LEANBACK_LAUNCHER/);
  assert.match(manifest, /android.software.leanback" android:required="true"/);
  assert.match(manifest, /android.hardware.touchscreen" android:required="false"/);
  assert.match(manifest, /foregroundServiceType="mediaPlayback"/);
  assert.match(manifest, /uses-permission android:name="android.permission.WAKE_LOCK"/);
  const player = read('android-tv/app/src/main/java/com/actionanand/radiobee/tv/playback/RadioPlayer.kt');
  assert.match(player, /setWakeMode\(C.WAKE_MODE_LOCAL\)/);
  assert.doesNotMatch(player, /WAKE_MODE_NETWORK|newWakeLock|newWifiLock/);
  const service = read('android-tv/app/src/main/java/com/actionanand/radiobee/tv/playback/RadioPlaybackService.kt');
  assert.match(service, /setForegroundServiceTimeoutMs\(0\)/);
  assert.doesNotMatch(service, /WAKE_MODE_NETWORK|newWakeLock|newWifiLock|FLAG_KEEP_SCREEN_ON/);
  const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(
    permissions,
    ['INTERNET', 'ACCESS_NETWORK_STATE', 'WAKE_LOCK', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK']
      .map(name => `android.permission.${name}`)
      .sort(),
  );

  assert.doesNotMatch(
    read('android-tv/app/src/main/java/com/actionanand/radiobee/tv/MainActivity.kt'),
    /FLAG_KEEP_SCREEN_ON|setKeepScreenOn/,
  );

  assert.doesNotMatch(manifest, /RECORD_AUDIO|WRITE_EXTERNAL_STORAGE|android.intent.category.LAUNCHER/);
});

test('wrapper has a separate valid distribution checksum and committed executable JAR', () => {
  const text = fs.readFileSync(
    new URL('../android-tv/gradle/wrapper/gradle-wrapper.properties', import.meta.url),
    'utf8',
  );
  const properties = Object.fromEntries(
    text
      .trim()
      .split(/\r?\n/)
      .map(line => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  assert.equal(properties.zipStorePath, 'wrapper/dists');
  assert.match(properties.distributionSha256Sum, /^[a-f0-9]{64}$/);
  assert.equal(properties.validateDistributionUrl, 'true');
  const jar = fs.readFileSync(new URL('../android-tv/gradle/wrapper/gradle-wrapper.jar', import.meta.url));
  assert.equal(jar.subarray(0, 2).toString(), 'PK');
});

test('TV retention preserves mobile assets and unrelated untracked files', t => {
  const f = reservationRepo(t);
  const old = 'releases/tv/RadioBee-TV-0-9-0-1000000000.apk';
  write(f.work, old, 'old TV');
  write(f.work, 'releases/RadioBee-mobile.apk', 'existing mobile');
  f.git(['add', '.']);
  f.git(['commit', '-m', 'existing outputs']);
  f.git(['push']);
  const name = tvReleaseName(seed);
  for (const extension of ['.apk', '.aab', '-mapping.txt'])
    write(f.work, `releases/tv/${name}${extension}`, 'verified fixture');
  write(f.work, 'releases/tv/unrelated.txt', 'preserve and do not stage');
  publishTv(f.work);
  assert.equal(fs.existsSync(path.join(f.work, old)), false);
  assert.equal(fs.readFileSync(path.join(f.work, 'releases/RadioBee-mobile.apk'), 'utf8'), 'existing mobile');
  assert.equal(f.git(['ls-files', 'releases/tv/unrelated.txt']), '');
  assert.ok(fs.existsSync(path.join(f.work, 'releases/tv/unrelated.txt')));
  assert.equal(f.git(['ls-files', 'releases/tv']).split('\n').length, 3);
});
