import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import versioning from './android-version.cjs';
import { patchAndroid } from './patch-android.mjs';
import { assetPlan, pngDimensions } from './generate-android-assets.mjs';
import { signAndroid } from './sign-android.mjs';
import { reserveVersion } from './reserve-android-version.mjs';
import { buildAndroid } from './build-android.mjs';

const read = file => readFileSync(file, 'utf8');
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'radiobee-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  return { root, write, read: file => read(path.join(root, file)) };
}
const bump = path.resolve('scripts/bump-android-version.js');
test('code-only and semantic version transitions, including sequential bumps', t => {
  const f = fixture(t);
  f.write('android-version.json', { versionCode: 1, versionName: '1.0.0' });
  for (const [arg, versionCode, versionName] of [
    [null, 2, '1.0.0'],
    ['--patch', 3, '1.0.1'],
    ['--minor', 4, '1.1.0'],
    ['--major', 5, '2.0.0'],
  ]) {
    execFileSync(process.execPath, [bump, ...(arg ? [arg] : [])], { cwd: f.root });
    assert.deepEqual(JSON.parse(f.read('android-version.json')), { versionCode, versionName });
  }
});
test('invalid versions and overflow fail without changing the version file', t => {
  const f = fixture(t);
  const invalid = [
    null,
    {},
    { versionCode: '1', versionName: '1.0.0' },
    ...[0, -1, 1.5, 2100000001].map(versionCode => ({ versionCode, versionName: '1.0.0' })),
    ...['1.0', '01.0.0', '1.0.0-beta', '1.0.x', '9007199254740992.0.0', null].map(versionName => ({
      versionCode: 1,
      versionName,
    })),
  ];
  for (const value of invalid) assert.throws(() => versioning.validateVersion(value));
  for (const [version, args] of [
    [{ versionCode: 2100000000, versionName: '1.0.0' }, []],
    [{ versionCode: 1, versionName: '9007199254740991.0.0' }, ['--major']],
    [{ versionCode: 1, versionName: '1.0.0' }, ['--unknown']],
    [{ versionCode: 1, versionName: '1.0.0' }, ['--minor', '--patch']],
  ]) {
    f.write('android-version.json', version);
    const before = f.read('android-version.json');
    assert.throws(() => execFileSync(process.execPath, [bump, ...args], { cwd: f.root, stdio: 'pipe' }));
    assert.equal(f.read('android-version.json'), before);
  }
});
function nativeFixture(t) {
  const f = fixture(t);
  f.write('capacitor.config.ts', read('capacitor.config.ts'));
  f.write('android-version.json', { versionCode: 2, versionName: '1.0.0' });
  f.write(
    'android/app/build.gradle',
    `android {
    defaultConfig {
      applicationId "com.actionanand.radiobee.app"
      versionCode 1
      versionName "1.0"
    }
    buildTypes { debug { minifyEnabled false } release {
      minifyEnabled false
      proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    } }
  }
  // custom native configuration retained`,
  );
  f.write(
    'android/variables.gradle',
    'ext { minSdkVersion = 23\ncompileSdkVersion = 35\ntargetSdkVersion = 35\ncustom = 7 }',
  );
  f.write('android/app/proguard-rules.pro', '# user rules');
  f.write(
    'android/app/src/main/AndroidManifest.xml',
    '<manifest><uses-permission android:name="android.permission.INTERNET"/><application android:allowBackup="true" android:label="@string/app_name"><meta-data android:name="custom" android:value="keep"/></application></manifest>',
  );
  f.write(
    'android/app/src/main/res/values/styles.xml',
    '<resources><style name="CustomTheme"/><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"><item name="custom">keep</item></style></resources>',
  );
  return f;
}
test('identity, native patch idempotency and preservation of custom native changes', t => {
  const f = nativeFixture(t);
  patchAndroid(f.root);
  const files = readdirSync(path.join(f.root, 'android'), { recursive: true }).filter(file =>
    /\.(gradle|xml|pro)$/.test(file),
  );
  const before = files.map(file => f.read(`android/${file}`));
  patchAndroid(f.root);
  assert.deepEqual(
    files.map(file => f.read(`android/${file}`)),
    before,
  );
  assert.match(f.read('android/app/build.gradle'), /versionCode 2/);
  assert.match(f.read('android/app/build.gradle'), /debug \{ minifyEnabled false \}/);
  assert.match(f.read('android/app/build.gradle'), /shrinkResources true/);
  assert.match(f.read('android/variables.gradle'), /custom = 7/);
  assert.match(f.read('android/app/src/main/res/values/styles.xml'), /<item name="custom">keep<\/item>/);
  const manifest = f.read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(manifest, /android:name="custom"/);
  assert.equal((manifest.match(/uses-permission/g) ?? []).length, 1);
  f.write('capacitor.config.ts', "appId: 'wrong.identity'");
  assert.throws(() => patchAndroid(f.root), /app ID/);
});
test('release collection rejects stale/empty Gradle outputs and preserves approved history', t => {
  const f = nativeFixture(t);
  const sources = [
    'android/app/build/outputs/apk/release/app-release-unsigned.apk',
    'android/app/build/outputs/bundle/release/app-release.aab',
    'android/app/build/outputs/mapping/release/mapping.txt',
  ];
  f.write('releases/RadioBee-1-0-0-1.apk', 'approved-history');
  for (const source of sources) f.write(source, 'stale');
  assert.throws(() => buildAndroid({ root: f.root, run: () => {} }), /Missing or empty/);
  assert.equal(f.read('releases/RadioBee-1-0-0-1.apk'), 'approved-history');
  assert.throws(
    () => buildAndroid({ root: f.root, run: () => sources.forEach(source => f.write(source, '')) }),
    /Missing or empty/,
  );
  buildAndroid({ root: f.root, run: () => sources.forEach(source => f.write(source, 'fresh')) });
  assert.equal(f.read('releases/RadioBee-1-0-0-2-unsigned.apk'), 'fresh');
  assert.equal(f.read('releases/RadioBee-1-0-0-2-unsigned.aab'), 'fresh');
  assert.equal(f.read('releases/RadioBee-1-0-0-2-mapping.txt'), 'fresh');
  assert.ok(!existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2.apk')));
});
test('asset plan uses all densities, padded artwork, splash and 512px store icon', t => {
  const plan = assetPlan();
  assert.equal(plan.length, 17);
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground'])
      assert.ok(plan.some(item => item.file.endsWith(`mipmap-${density}/${name}.png`)));
  assert.ok(plan.every(item => item.art < item.size && !item.file.includes('favicon')));
  assert.deepEqual(plan.at(-1), { file: 'releases/playstore-icon.png', size: 512, art: 420, background: '#fff8e7' });
  const f = fixture(t);
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(512, 16);
  png.writeUInt32BE(512, 20);
  f.write('icon.png', png);
  assert.deepEqual(pngDimensions(path.join(f.root, 'icon.png')), [512, 512]);
  f.write('bad.png', 'invalid');
  assert.throws(() => pngDimensions(path.join(f.root, 'bad.png')), /Invalid PNG/);
});
test('release names unambiguously include name and code; build only collects explicitly unsigned outputs', () => {
  assert.equal(versioning.releaseName({ versionName: '1.0.0', versionCode: 2 }), 'RadioBee-1-0-0-2');
  const build = read('scripts/build-android.mjs');
  assert.match(build, /-unsigned\.apk/);
  assert.match(build, /-unsigned\.aab/);
  assert.match(build, /statSync\(source\)\.size === 0/);
  assert.match(build, /\['clean', 'assembleRelease', 'bundleRelease'/);
});
function signingFixture(t, failure, storeType = 'PKCS12') {
  const f = fixture(t);
  f.write('android-version.json', { versionCode: 2, versionName: '1.0.0' });
  f.write('releases/RadioBee-1-0-0-2-unsigned.apk', 'unsigned-apk');
  f.write('releases/RadioBee-1-0-0-2-unsigned.aab', 'unsigned-aab');
  const calls = [];
  const env = {
    RUNNER_TEMP: f.root,
    ANDROID_HOME: '/sdk',
    KEYSTORE_BASE64: Buffer.from('fake-keystore').toString('base64'),
    KEYSTORE_PASSWORD: 'test-store-only',
    KEY_PASSWORD: 'test-key-only',
    KEY_ALIAS: 'radiobee',
  };
  const run = (command, args, options) => {
    calls.push([command, args]);
    assert.ok(!existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2.apk')));
    assert.ok(!existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2.aab')));
    assert.ok(!args.includes(env.KEYSTORE_PASSWORD) && !args.includes(env.KEY_PASSWORD));
    if (command === 'keytool') return args.includes('-alias') ? 'PrivateKeyEntry' : `Keystore type: ${storeType}`;
    assert.equal(options.env.KEY_PASSWORD, storeType === 'PKCS12' ? env.KEYSTORE_PASSWORD : env.KEY_PASSWORD);
    if (command.endsWith('zipalign') && args.includes('-f')) writeFileSync(args.at(-1), 'aligned');
    if (command === 'jarsigner' && args.includes('-signedjar'))
      writeFileSync(args[args.indexOf('-signedjar') + 1], 'signed');
    if (failure?.(command, args)) throw Object.assign(new Error('sensitive captured tool output'), { status: 1 });
    return command === 'jarsigner' && args.includes('-verify') ? 'jar verified.' : '';
  };
  return { ...f, env, calls, run };
}
test('signing verifies both candidates before promotion, handles PKCS12 and cleans secrets', t => {
  const f = signingFixture(t);
  signAndroid(f);
  assert.ok(existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2.apk')));
  assert.ok(existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2.aab')));
  assert.ok(!existsSync(path.join(f.root, 'radiobee-signing')));
  assert.ok(!existsSync(path.join(f.root, 'releases/RadioBee-1-0-0-2-unsigned.apk')));
  assert.ok(
    f.calls.findIndex(([tool, args]) => tool.endsWith('apksigner') && args.includes('verify')) <
      f.calls.findIndex(([tool]) => tool === 'jarsigner'),
  );
  assert.ok(f.calls.some(([tool, args]) => tool === 'jarsigner' && args.includes('-verify')));
});
for (const phase of ['apk', 'aab'])
  test(`${phase} verification failure leaves no signed-looking files or secrets`, t => {
    const f = signingFixture(t, (tool, args) =>
      phase === 'apk'
        ? tool.endsWith('apksigner') && args.includes('verify')
        : tool === 'jarsigner' && args.includes('-verify'),
    );
    assert.throws(() => signAndroid(f), /Android signing failed/);
    assert.deepEqual(readdirSync(path.join(f.root, 'releases')).sort(), [
      'RadioBee-1-0-0-2-unsigned.aab',
      'RadioBee-1-0-0-2-unsigned.apk',
    ]);
    assert.ok(!existsSync(path.join(f.root, 'radiobee-signing')));
  });
test('missing secrets and unsigned jars cannot produce production artifacts', t => {
  const f = signingFixture(t);
  delete f.env.KEYSTORE_PASSWORD;
  assert.throws(() => signAndroid(f), /KEYSTORE_PASSWORD is missing/);
  const unsigned = signingFixture(t);
  const run = unsigned.run;
  unsigned.run = (tool, args, options) =>
    tool === 'jarsigner' && args.includes('-verify') ? 'jar is unsigned.' : run(tool, args, options);
  assert.throws(() => signAndroid(unsigned), /verification failed/);
  assert.ok(!existsSync(path.join(unsigned.root, 'releases/RadioBee-1-0-0-2.apk')));
});
test('JKS retains its separate key password; non-private aliases are rejected', t => {
  const jks = signingFixture(t, undefined, 'JKS');
  signAndroid(jks);
  assert.ok(existsSync(path.join(jks.root, 'releases/RadioBee-1-0-0-2.aab')));
  const invalidAlias = signingFixture(t);
  const run = invalidAlias.run;
  invalidAlias.run = (tool, args, options) =>
    tool === 'keytool' && args.includes('-alias') ? 'trustedCertEntry' : run(tool, args, options);
  assert.throws(() => signAndroid(invalidAlias), /private key entry/);
  assert.ok(!existsSync(path.join(invalidAlias.root, 'radiobee-signing')));
});
test('keystore generation refuses existing identities and password arguments', t => {
  const f = fixture(t);
  f.write('release-keystore.jks', 'fixture-existing-identity');
  const generator = path.resolve('scripts/generate-keystore.mjs');
  assert.throws(
    () => execFileSync(process.execPath, [generator], { cwd: f.root, stdio: 'pipe' }),
    /Refusing to overwrite/,
  );
  assert.equal(f.read('release-keystore.jks'), 'fixture-existing-identity');
  assert.throws(
    () => execFileSync(process.execPath, [generator, '--password', 'fixture-only'], { cwd: f.root, stdio: 'pipe' }),
    /password arguments are prohibited/,
  );
});
test('version reservations persist monotonically and reject stale branch reads', t => {
  const f = fixture(t);
  const remote = path.join(f.root, 'remote.git');
  const a = path.join(f.root, 'a');
  const b = path.join(f.root, 'b');
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  git(f.root, ['init', '--bare', remote]);
  git(f.root, ['clone', remote, a]);
  git(a, ['checkout', '-b', 'main-android']);
  for (const repo of [a]) {
    git(repo, ['config', 'user.name', 'fixture']);
    git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  }
  writeFileSync(path.join(a, 'android-version.json'), JSON.stringify({ versionCode: 1, versionName: '1.0.0' }));
  git(a, ['add', '.']);
  git(a, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial']);
  git(a, ['push', 'origin', 'HEAD:main-android']);
  git(f.root, ['clone', '-b', 'main-android', remote, b]);
  git(b, ['config', 'user.name', 'fixture']);
  git(b, ['config', 'user.email', 'fixture@example.invalid']);
  reserveVersion(a);
  assert.throws(() => reserveVersion(b), /changed during validation/);
  assert.equal(JSON.parse(read(path.join(b, 'android-version.json'))).versionCode, 1);
  git(b, ['pull', '--ff-only', 'origin', 'main-android']);
  reserveVersion(b);
  assert.equal(
    JSON.parse(git(f.root, ['--git-dir', remote, 'show', 'main-android:android-version.json'])).versionCode,
    3,
  );
  assert.match(git(b, ['log', '-1', '--format=%s']), /\[skip ci\]/);
  git(a, ['checkout', '-b', 'main-github']);
  assert.throws(() => reserveVersion(a), /restricted/);
});
test('workflow isolates Android from web, persists before compilation and publishes verified exact artifacts', () => {
  const workflow = read('.github/workflows/android-build.yml');
  assert.match(workflow, /branches: \[main-android\]/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main-android'/);
  assert.doesNotMatch(workflow, /main-github|gh-pages|run_number|continue-on-error|force-push/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ref: main-android/);
  assert.match(workflow, /contents: write/);
  assert.ok(workflow.indexOf('reserve-android-version.mjs') < workflow.indexOf('npm run build'));
  assert.ok(workflow.indexOf('sign-android.mjs') < workflow.indexOf('actions/upload-artifact@v4'));
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /radiobee-signing/);
  assert.match(workflow, /retention-days: 30/);
  for (const secret of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'])
    assert.ok(workflow.includes(`secrets.${secret}`));
  const reserve = read('scripts/reserve-android-version.mjs');
  assert.ok(reserve.indexOf("'fetch'") < reserve.indexOf('bump-android-version.js'));
  assert.match(reserve, /'add', 'android-version.json'/);
  assert.match(reserve, /'push', 'origin', 'HEAD:main-android'/);
  const web = read('.github/workflows/gh-pages.yml');
  assert.match(web, /branches:\s*\n\s*- main-github/);
  assert.match(web, /deploy_branch: gh-pages/);
  assert.doesNotMatch(web, /main-android|android:version|android-version.json/);
  const implementation =
    readdirSync('scripts')
      .map(file => read(`scripts/${file}`))
      .join('') +
    read('capacitor.config.ts') +
    workflow;
  assert.doesNotMatch(implementation, new RegExp(['Metro', 'Pocket'].join(''), 'i'));
  assert.doesNotMatch(
    read('scripts/patch-android.mjs'),
    /RECORD_AUDIO|READ_SMS|READ_CONTACTS|ACCESS_FINE_LOCATION|WRITE_EXTERNAL_STORAGE/,
  );
  assert.match(read('capacitor.config.ts'), /appName: 'RadioBee'/);
  assert.match(read('capacitor.config.ts'), /allowMixedContent: false/);
});
