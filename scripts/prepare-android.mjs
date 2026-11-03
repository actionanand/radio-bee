import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { patchAndroid } from './patch-android.mjs';
import { generateAssets } from './generate-android-assets.mjs';

const run = (file, args) => execFileSync(process.execPath, [file, ...args], { stdio: 'inherit' });
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--no-build')) throw new Error('Usage: prepare-android.mjs [--no-build]');
if (!args.includes('--no-build'))
  run('node_modules/@angular/cli/bin/ng.js', ['build', '--configuration=production', '--base-href=/']);
if (!existsSync('android')) run('node_modules/@capacitor/cli/bin/capacitor', ['add', 'android']);
run('node_modules/@capacitor/cli/bin/capacitor', ['sync', 'android']);
patchAndroid();
generateAssets();
