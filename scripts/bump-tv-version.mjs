import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTvVersion, nextTvVersion, writeTvVersion } from './tv-version.mjs';
export function bumpTv(root = process.cwd(), change) {
  const next = nextTvVersion(readTvVersion(root), change);
  writeTvVersion(root, next);
  return next;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--patch', '--minor', '--major'].includes(args[0])))
    throw Error('Usage: bump-tv-version.mjs [--patch|--minor|--major]');
  const next = bumpTv(process.cwd(), args[0]?.slice(2));
  console.log(`TV version ${next.versionName} (${next.versionCode})`);
}
