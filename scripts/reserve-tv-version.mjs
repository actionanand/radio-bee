import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTvVersion, validateTvVersion, nextTvVersion, writeTvVersion, TV_MIN } from './tv-version.mjs';
export function reserveTvVersion(root = process.cwd()) {
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git(['branch', '--show-current']) !== 'main-tv') throw Error('TV reservation is restricted to main-tv.');
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw Error('TV reservation requires a clean checkout.');
  git(['fetch', 'origin', 'main-tv', 'master', 'main-android']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main-tv']))
    throw Error('main-tv advanced during validation; rerun from latest source.');
  for (const ref of ['origin/master', 'origin/main-android']) {
    const mobile = JSON.parse(git(['show', `${ref}:android-version.json`]));
    if (!Number.isSafeInteger(mobile.versionCode) || mobile.versionCode < 1 || mobile.versionCode >= TV_MIN)
      throw Error('Mobile/TV version ranges overlap.');
    // The shared range guard must reach the mobile deployment branch BEFORE TV release.
    const allocator = git(['show', `${ref}:scripts/android-version.cjs`]);
    if (!allocator.includes('MOBILE_VERSION_MAX'))
      throw Error(`TV release blocked: mobile range guard missing on ${ref}.`);
  }
  const current = readTvVersion(root);
  const commits = git(['log', '--format=%H', 'origin/main-tv', '--', 'tv-version.json']).split('\n').filter(Boolean);
  const historic = commits.map(
    sha => validateTvVersion(JSON.parse(git(['show', `${sha}:tv-version.json`]))).versionCode,
  );
  const directory = path.join(root, 'releases/tv');
  const published = existsSync(directory)
    ? readdirSync(directory).flatMap(name => {
        const m = /^RadioBee-TV-\d+-\d+-\d+-(\d+)\.(?:apk|aab)$/.exec(name);
        return m ? [Number(m[1])] : [];
      })
    : [];
  if (current.versionCode < Math.max(current.versionCode, ...historic, ...published))
    throw Error('TV version was rolled back; preserve reservation history before synchronizing.');
  const next = nextTvVersion(current);
  writeTvVersion(root, next);
  git(['add', 'tv-version.json']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'chore(tv): reserve version [skip ci]']);
  // Non-fast-forward rejection is intentional. Never rebase or reuse a conflicting reservation.
  git(['push', 'origin', 'HEAD:main-tv']);
  return next;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
  reserveTvVersion();
}
