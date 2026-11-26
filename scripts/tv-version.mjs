import fs from 'node:fs';
import path from 'node:path';
export const TV_MIN = 1_000_000_000;
export const TV_MAX = 2_099_999_999;
export const MOBILE_MAX = TV_MIN - 1;
export function validateTvVersion(version) {
  if (
    !version ||
    !Number.isSafeInteger(version.versionCode) ||
    version.versionCode < TV_MIN ||
    version.versionCode > TV_MAX
  )
    throw Error('TV versionCode outside reserved range 1000000000..2099999999.');
  if (
    typeof version.versionName !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version.versionName) ||
    version.versionName.split('.').some(n => !Number.isSafeInteger(Number(n)))
  )
    throw Error('Invalid TV semantic versionName.');
  return version;
}
export function readTvVersion(root = process.cwd()) {
  return validateTvVersion(JSON.parse(fs.readFileSync(path.join(root, 'tv-version.json'), 'utf8')));
}
export function nextTvVersion(version, change) {
  validateTvVersion(version);
  if (change !== undefined && !['patch', 'minor', 'major'].includes(change))
    throw Error('Expected patch, minor or major');
  const next = { ...version, versionCode: version.versionCode + 1 };
  if (change) {
    const parts = version.versionName.split('.').map(Number),
      index = { major: 0, minor: 1, patch: 2 }[change];
    parts[index]++;
    for (let i = index + 1; i < 3; i++) parts[i] = 0;
    next.versionName = parts.join('.');
  }
  return validateTvVersion(next);
}
export function writeTvVersion(root, version) {
  validateTvVersion(version);
  const file = path.join(root, 'tv-version.json'),
    temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(version, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, file);
}
export function tvReleaseName(version) {
  validateTvVersion(version);
  return `RadioBee-TV-${version.versionName.replaceAll('.', '-')}-${version.versionCode}`;
}
