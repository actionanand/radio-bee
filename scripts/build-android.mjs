import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchAndroid } from './patch-android.mjs';
import versioning from './android-version.cjs';

export function buildAndroid({ root = process.cwd(), run = execFileSync } = {}) {
  const version = versioning.readVersion(root);
  const name = versioning.releaseName(version);
  patchAndroid(root);
  mkdirSync(path.join(root, 'releases'), { recursive: true });
  const outputs = [
    ['android/app/build/outputs/apk/release/app-release-unsigned.apk', `releases/${name}-unsigned.apk`],
    ['android/app/build/outputs/bundle/release/app-release.aab', `releases/${name}-unsigned.aab`],
    ['android/app/build/outputs/mapping/release/mapping.txt', `releases/${name}-mapping.txt`],
  ].map(pair => pair.map(file => path.join(root, file)));
  if (existsSync(path.join(root, `releases/${name}.apk`)) || existsSync(path.join(root, `releases/${name}.aab`)))
    throw new Error('This version already has signed release files. Reserve a new versionCode.');
  // Remove only this version's generated outputs; historical approved releases remain intact.
  for (const [source, target] of outputs) {
    rmSync(source, { force: true });
    rmSync(target, { force: true });
  }
  try {
    const args = ['clean', 'assembleRelease', 'bundleRelease', '--no-daemon'];
    if (process.platform === 'win32') {
      run('cmd.exe', ['/d', '/s', '/c', `gradlew.bat ${args.join(' ')}`], {
        cwd: path.join(root, 'android'),
        stdio: 'inherit',
      });
    } else run('sh', ['./gradlew', ...args], { cwd: path.join(root, 'android'), stdio: 'inherit' });
    for (const [source] of outputs)
      if (!existsSync(source) || statSync(source).size === 0)
        throw new Error(`Missing or empty build output: ${source}`);
    for (const [source, target] of outputs) copyFileSync(source, target);
  } catch (error) {
    for (const [, target] of outputs) rmSync(target, { force: true });
    throw error;
  }
  console.log(`Collected ${name}-unsigned APK/AAB and R8 mapping. Signing is required before distribution.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildAndroid();
