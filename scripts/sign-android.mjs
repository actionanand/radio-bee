import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versioning from './android-version.cjs';

export function signAndroid({ root = process.cwd(), env = process.env, run = execFileSync } = {}) {
  const name = versioning.releaseName(versioning.readVersion(root));
  const target = extension => path.join(root, 'releases', `${name}.${extension}`);
  const candidate = extension => `${target(extension)}.candidate`;
  const keystore = path.join(env.RUNNER_TEMP ?? root, 'radiobee-signing', 'release-keystore.jks');
  const directory = path.dirname(keystore);
  let ownsDirectory = false;
  const cleanupOutputs = () => {
    for (const extension of ['apk', 'aab']) {
      rmSync(target(extension), { force: true });
      rmSync(candidate(extension), { force: true });
      rmSync(`${candidate(extension)}.idsig`, { force: true });
    }
  };
  // Never replace an already published release.
  if (['apk', 'aab'].some(extension => existsSync(target(extension))))
    throw new Error('Signed release already exists; allocate a new version.');
  try {
    for (const key of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'])
      if (!env[key]) throw new Error(`Required GitHub Actions secret ${key} is missing.`);
    if (/[\r\n\0]/.test(env.KEYSTORE_PASSWORD + env.KEY_PASSWORD))
      throw new Error('Signing passwords cannot contain line breaks.');
    const encoded = env.KEYSTORE_BASE64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
      throw new Error('KEYSTORE_BASE64 is invalid.');
    if (existsSync(directory))
      throw new Error('Signing temporary directory already exists. Run cleanup before retrying.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    ownsDirectory = true;
    writeFileSync(keystore, Buffer.from(encoded, 'base64'), { mode: 0o600, flag: 'wx' });
    const signingEnv = { ...env };
    const invoke = (command, args) =>
      run(command, args, { env: signingEnv, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const listing = invoke('keytool', [
      '-J-Duser.language=en',
      '-list',
      '-keystore',
      keystore,
      '-storepass:env',
      'KEYSTORE_PASSWORD',
    ]);
    const type = listing.match(/Keystore type:\s*(\S+)/i)?.[1];
    if (!['PKCS12', 'JKS'].includes(type)) throw new Error('Unsupported keystore format.');
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
    if (!alias.includes('PrivateKeyEntry')) throw new Error('KEY_ALIAS must reference a private key entry.');
    const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('ANDROID_HOME is required.');
    const tool = name => path.join(sdk, 'build-tools', '36.0.0', name);
    for (const extension of ['apk', 'aab']) {
      const input = path.join(root, 'releases', `${name}-unsigned.${extension}`);
      if (!existsSync(input) || !statSync(input).size) throw new Error(`Missing unsigned ${extension}.`);
    }
    invoke(tool('zipalign'), [
      '-P',
      '16',
      '-f',
      '4',
      path.join(root, 'releases', `${name}-unsigned.apk`),
      candidate('apk'),
    ]);
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
      path.join(root, 'releases', `${name}-unsigned.aab`),
      env.KEY_ALIAS,
    ]);
    // jarsigner can exit zero for an unsigned JAR; require the positive verification result too.
    const verification = invoke('jarsigner', [
      '-J-Duser.language=en',
      '-verify',
      '-verbose',
      '-certs',
      candidate('aab'),
    ]);
    if (
      !/jar verified\./.test(verification) ||
      /jar is unsigned|unsigned entries|signatures? (?:is |are )?invalid/i.test(verification)
    )
      throw new Error('AAB signature verification failed.');
    for (const extension of ['apk', 'aab'])
      if (!statSync(candidate(extension)).size) throw new Error('Empty signing candidate.');
    // Both candidates have passed verification; each promotion is an atomic same-directory rename.
    renameSync(candidate('apk'), target('apk'));
    renameSync(candidate('aab'), target('aab'));
    for (const extension of ['apk', 'aab']) rmSync(path.join(root, 'releases', `${name}-unsigned.${extension}`));
  } catch (error) {
    cleanupOutputs();
    // Child-process errors may contain captured output. Never propagate those buffers or environment.
    throw new Error(
      error?.status !== undefined || error?.code
        ? 'Android signing failed. Check keystore, alias, passwords and SDK tools.'
        : error.message,
    );
  } finally {
    if (ownsDirectory) rmSync(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  signAndroid();
  console.log('RadioBee APK and AAB signed and verified.');
}
