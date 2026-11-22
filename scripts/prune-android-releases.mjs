import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versioning from './android-version.cjs';

// Only recognized, signed RadioBee release artifacts are subject to rotation.
// Leave artwork, unknown files, and signing candidates untouched.
const approvedRelease = /^RadioBee-\d+-\d+-\d+-\d+(?:\.apk|\.aab|-mapping\.txt)$/;

export function pruneAndroidReleases(root = process.cwd()) {
  const current = versioning.releaseName(versioning.readVersion(root));
  const dir = path.join(root, 'releases');
  const required = [`${current}.apk`, `${current}.aab`, `${current}-mapping.txt`];
  // Never delete a previous usable release if a new build/signing has failed.
  for (const name of required) {
    const file = path.join(dir, name);
    if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0)
      throw new Error(`Cannot prune releases: missing or empty signed artifact ${name}`);
  }

  const removed = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isFile() || !approvedRelease.test(item.name) || required.includes(item.name))
      continue;
    rmSync(path.join(dir, item.name));
    removed.push(item.name);
  }
  return removed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = pruneAndroidReleases();
  console.log(`Retained current signed APK/AAB/mapping; removed ${removed.length} older release files.`);
}
