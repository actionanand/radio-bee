import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTvVersion, tvReleaseName } from './tv-version.mjs';
/** Only already verified TV outputs are pruned/committed; never touches releases/ mobile files. */
export function publishTv(root = process.cwd()) {
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git(['branch', '--show-current']) !== 'main-tv') throw Error('TV publication requires main-tv');
  git(['fetch', 'origin', 'main-tv']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main-tv']))
    throw Error('main-tv advanced; do not overwrite source or version reservations');
  const name = tvReleaseName(readTvVersion(root)),
    directory = path.join(root, 'releases/tv');
  const keep = new Set([`${name}.apk`, `${name}.aab`, `${name}-mapping.txt`]);
  for (const filename of keep)
    if (!existsSync(path.join(directory, filename)) || !statSync(path.join(directory, filename)).size)
      throw Error('Missing validated TV asset');
  const changed = [...keep];
  for (const filename of readdirSync(directory))
    if (/^RadioBee-TV-\d+-\d+-\d+-\d+(?:\.apk|\.aab|-mapping\.txt)$/.test(filename) && !keep.has(filename)) {
      rmSync(path.join(directory, filename));
      changed.push(filename);
    }
  git(['add', '-A', '--', ...changed.map(filename => `releases/tv/${filename}`)]);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', `build(tv): RadioBee ${name} [skip ci]`]);
  git(['push', 'origin', 'HEAD:main-tv']);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
  publishTv();
}
