import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
export function assetPlan() {
  const res = 'android/app/src/main/res';
  return Object.entries(densities)
    .flatMap(([density, size]) => [
      { file: `${res}/mipmap-${density}/ic_launcher.png`, size, art: Math.round(size * 0.7), background: '#fff8e7' },
      {
        file: `${res}/mipmap-${density}/ic_launcher_round.png`,
        size,
        art: Math.round(size * 0.7),
        background: '#fff8e7',
      },
      {
        file: `${res}/mipmap-${density}/ic_launcher_foreground.png`,
        size: (size * 108) / 48,
        art: (size * 60) / 48,
        background: 'none',
      },
    ])
    .concat([
      { file: `${res}/drawable-nodpi/radiobee_splash_logo.png`, size: 512, art: 288, background: 'none' },
      { file: 'releases/playstore-icon.png', size: 512, art: 420, background: '#fff8e7' },
    ]);
}
export function pngDimensions(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error(`Invalid PNG: ${file}`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
export function generateAssets(root = process.cwd()) {
  const source = path.join(root, 'src/assets/icon/radio-bee.png');
  const res = path.join(root, 'android/app/src/main/res');
  if (!existsSync(source) || !existsSync(res))
    throw new Error('RadioBee artwork or android/ is missing. Run android:add first.');
  let command;
  // Windows convert.exe is a filesystem tool, not ImageMagick.
  for (const candidate of process.platform === 'win32' ? ['magick'] : ['magick', 'convert']) {
    try {
      if (execFileSync(candidate, ['-version'], { encoding: 'utf8' }).includes('ImageMagick')) {
        command = candidate;
        break;
      }
    } catch {
      /* Try the next ImageMagick entry point. */
    }
  }
  if (!command) throw new Error('Install ImageMagick and add magick to PATH.');
  for (const { file, size, art, background } of assetPlan()) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    execFileSync(command, [
      source,
      '-auto-orient',
      '-depth',
      '8',
      '-resize',
      `${art}x${art}`,
      '-background',
      background,
      '-gravity',
      'center',
      '-extent',
      `${size}x${size}`,
      ...(background === 'none' ? [] : ['-alpha', 'remove', '-alpha', 'off']),
      `PNG:${target}`,
    ]);
    if (pngDimensions(target).some(dimension => dimension !== size))
      throw new Error(`Unexpected asset dimensions: ${file}`);
  }
  mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round'])
    writeFileSync(
      path.join(res, `mipmap-anydpi-v26/${name}.xml`),
      '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/radiobee_icon_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n',
    );
  mkdirSync(path.join(res, 'values'), { recursive: true });
  writeFileSync(
    path.join(res, 'values/radiobee_colors.xml'),
    '<resources><color name="radiobee_icon_background">#fff8e7</color></resources>\n',
  );
  console.log('RadioBee launcher, adaptive and splash artwork generated; Play Store icon validated at 512 x 512.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateAssets();
