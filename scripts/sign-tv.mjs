import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTvVersion, tvReleaseName } from './tv-version.mjs';
export function signTv({ root = process.cwd(), env = process.env, run = execFileSync } = {}) {
  const name = tvReleaseName(readTvVersion(root)),
    out = path.join(root, 'releases/tv');
  mkdirSync(out, { recursive: true });
  const target = extension => path.join(out, `${name}.${extension}`),
    candidate = extension => target(extension) + '.candidate';
  if (['apk', 'aab'].some(e => existsSync(target(e))) || existsSync(path.join(out, `${name}-mapping.txt`)))
    throw Error('TV release exists; reserve another version.');
  const input = {
    apk: path.join(root, 'android-tv/app/build/outputs/apk/release/app-release-unsigned.apk'),
    aab: path.join(root, 'android-tv/app/build/outputs/bundle/release/app-release.aab'),
  };
  const mapping = path.join(root, 'android-tv/app/build/outputs/mapping/release/mapping.txt');
  for (const file of [...Object.values(input), mapping])
    if (!existsSync(file)) throw Error('Missing TV release build output.');
  for (const key of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'])
    if (!env[key]) throw Error(`Required signing secret ${key} is missing.`);
  if (/[\r\n\0]/.test(env.KEYSTORE_PASSWORD + env.KEY_PASSWORD + env.KEY_ALIAS))
    throw Error('Invalid signing credentials.');
  const encoded = env.KEYSTORE_BASE64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) throw Error('Invalid encoded keystore.');
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) throw Error('ANDROID_HOME required');
  const temporary = mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), 'radiobee-tv-signing-'));
  env.TV_SIGNING_DIR = temporary;
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `TV_SIGNING_DIR=${temporary}\n`);
  const keystore = path.join(temporary, 'release.jks');
  const signingEnv = { ...env };
  const invoke = (command, args) =>
    run(command, args, { cwd: root, env: signingEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    writeFileSync(keystore, Buffer.from(encoded, 'base64'), { flag: 'wx', mode: 0o600 });
    const listing = invoke('keytool', [
      '-J-Duser.language=en',
      '-list',
      '-keystore',
      keystore,
      '-storepass:env',
      'KEYSTORE_PASSWORD',
    ]);
    const type = listing.match(/Keystore type:\s*(\S+)/i)?.[1];
    if (!['JKS', 'PKCS12'].includes(type)) throw Error('Unsupported keystore type');
    if (type === 'PKCS12') signingEnv.KEY_PASSWORD = env.KEYSTORE_PASSWORD;
    const alias = invoke('keytool', [
      '-J-Duser.language=en',
      '-list',
      '-keystore',
      keystore,
      '-storepass:env',
      'KEYSTORE_PASSWORD',
      '-alias',
      env.KEY_ALIAS,
    ]);
    if (!alias.includes('PrivateKeyEntry')) throw Error('Alias is not a private key entry.');
    const tool = name => path.join(sdk, 'build-tools/36.0.0', name);
    invoke(tool('zipalign'), ['-P', '16', '-f', '4', input.apk, candidate('apk')]);
    invoke(tool('apksigner'), [
      'sign',
      '--ks',
      keystore,
      '--ks-pass',
      'env:KEYSTORE_PASSWORD',
      '--ks-key-alias',
      env.KEY_ALIAS,
      '--key-pass',
      'env:KEY_PASSWORD',
      '--v4-signing-enabled',
      'false',
      candidate('apk'),
    ]);
    invoke(tool('apksigner'), ['verify', '--verbose', candidate('apk')]);
    invoke(tool('zipalign'), ['-c', '-P', '16', '4', candidate('apk')]);
    invoke('jarsigner', [
      '-keystore',
      keystore,
      '-storepass:env',
      'KEYSTORE_PASSWORD',
      '-keypass:env',
      'KEY_PASSWORD',
      '-signedjar',
      candidate('aab'),
      input.aab,
      env.KEY_ALIAS,
    ]);
    const verified = invoke('jarsigner', ['-J-Duser.language=en', '-verify', '-verbose', '-certs', candidate('aab')]);
    if (!verified.includes('jar verified.')) throw Error('TV AAB signature not verified.');
    for (const extension of ['apk', 'aab']) renameSync(candidate(extension), target(extension));
    copyFileSync(mapping, path.join(out, `${name}-mapping.txt`));
    return name;
  } catch (error) {
    rmSync(path.join(out, `${name}-mapping.txt`), { force: true });
    for (const extension of ['apk', 'aab']) {
      rmSync(candidate(extension), { force: true });
      rmSync(target(extension), { force: true });
      rmSync(candidate(extension) + '.idsig', { force: true });
    }
    throw Error('TV signing or verification failed; no release was published.');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
export function cleanupTvSigning(env = process.env) {
  if (!env.TV_SIGNING_DIR || !existsSync(env.TV_SIGNING_DIR)) return;
  const root = realpathSync(env.RUNNER_TEMP ?? tmpdir()),
    directory = path.resolve(env.TV_SIGNING_DIR);
  if (
    path.dirname(directory) !== root ||
    !path.basename(directory).startsWith('radiobee-tv-signing-') ||
    lstatSync(directory).isSymbolicLink()
  )
    throw Error('Refusing unsafe TV signing cleanup path.');
  rmSync(directory, { recursive: true, force: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
  if (process.argv[2] === '--cleanup') cleanupTvSigning();
  else signTv();
}
