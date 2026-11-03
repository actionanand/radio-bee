import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function reserveVersion(root = process.cwd()) {
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git(['branch', '--show-current']) !== 'main-android')
    throw new Error('Version reservation is restricted to main-android.');
  if (git(['status', '--porcelain', '--untracked-files=no']))
    throw new Error('Version reservation requires a clean checkout.');
  git(['fetch', 'origin', 'main-android']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main-android']))
    throw new Error('main-android changed during validation. Rerun against the latest source.');
  execFileSync(process.execPath, [fileURLToPath(new URL('./bump-android-version.js', import.meta.url))], {
    cwd: root,
    stdio: 'pipe',
  });
  git(['add', 'android-version.json']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'chore: reserve Android version [skip ci]']);
  // Never rebase/retry a stale allocation: a concurrent push must reject this reservation.
  git(['push', 'origin', 'HEAD:main-android']);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) reserveVersion();
