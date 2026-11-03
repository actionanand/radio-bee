const fs = require('node:fs');
const { readVersion, validateVersion } = require('./android-version.cjs');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !['--patch', '--minor', '--major'].includes(args[0])))
  throw new Error('Usage: bump-android-version.js [--patch|--minor|--major]');
const version = readVersion();
version.versionCode += 1;
if (args.length) {
  const parts = version.versionName.split('.').map(Number);
  const index = { '--major': 0, '--minor': 1, '--patch': 2 }[args[0]];
  parts[index] += 1;
  for (let i = index + 1; i < 3; i++) parts[i] = 0;
  version.versionName = parts.join('.');
}
validateVersion(version);
const temporary = 'android-version.json.tmp';
fs.writeFileSync(temporary, `${JSON.stringify(version, null, 2)}\n`, { flag: 'wx' });
fs.renameSync(temporary, 'android-version.json');
console.log(`Android version: ${version.versionName} (${version.versionCode})`);
