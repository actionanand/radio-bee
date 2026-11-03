import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versioning from './android-version.cjs';

export function patchAndroid(root = process.cwd()) {
  const read = file => readFileSync(path.join(root, file), 'utf8');
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  const replace = (text, pattern, value, label) => {
    if (!pattern.test(text)) throw new Error(`Unsupported Android template: missing ${label}`);
    return text.replace(pattern, value);
  };
  if (!/appId:\s*['"]com\.actionanand\.radiobee\.app['"]/.test(read('capacitor.config.ts')))
    throw new Error('RadioBee app ID is missing or invalid.');
  const version = versioning.readVersion(root);
  let gradle = read('android/app/build.gradle');
  if (!/applicationId\s+['"]com\.actionanand\.radiobee\.app['"]/.test(gradle))
    throw new Error('Generated Android applicationId does not match RadioBee.');
  gradle = replace(gradle, /\bversionCode[^\r\n]*/, `versionCode ${version.versionCode}`, 'versionCode');
  gradle = replace(gradle, /\bversionName[^\r\n]*/, `versionName "${version.versionName}"`, 'versionName');
  // Only manage the release block; preserve debug settings and all other native configuration.
  gradle = replace(
    gradle,
    /release\s*\{([^{}]*)\}/,
    (_match, body) => {
      let release = replace(body, /minifyEnabled\s+(?:true|false)/, 'minifyEnabled true', 'release minification');
      release = /shrinkResources\s+(?:true|false)/.test(release)
        ? release.replace(/shrinkResources\s+(?:true|false)/, 'shrinkResources true')
        : release.replace('minifyEnabled true', 'minifyEnabled true\n            shrinkResources true');
      release = release.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
      if (!release.includes('proguard-rules.pro')) throw new Error('Release must load proguard-rules.pro.');
      return `release {${release}}`;
    },
    'simple release block',
  );
  let variables = read('android/variables.gradle');
  for (const [name, value] of Object.entries({ minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36 }))
    variables = replace(variables, new RegExp(`\\b${name}\\s*=\\s*\\d+`), `${name} = ${value}`, name);
  // AGP 8.13 defaults to build tools 35; explicitly select the installed 36 toolchain.
  gradle = /buildToolsVersion\s+['"][^'"]+['"]/.test(gradle)
    ? gradle.replace(/buildToolsVersion\s+['"][^'"]+['"]/, 'buildToolsVersion "36.0.0"')
    : replace(gradle, /android\s*\{/, 'android {\n    buildToolsVersion "36.0.0"', 'android block');
  let manifest = read('android/app/src/main/AndroidManifest.xml');
  manifest = replace(
    manifest,
    /<application\b[^>]*>/,
    tag => {
      for (const [key, value] of Object.entries({ allowBackup: 'false', usesCleartextTraffic: 'false' })) {
        const attribute = new RegExp(`\\sandroid:${key}="[^"]*"`, 'g');
        tag = tag.replace(attribute, '').replace('<application', `<application android:${key}="${value}"`);
      }
      return tag;
    },
    'application',
  );
  // An existing network policy could override usesCleartextTraffic. Fail for review instead of overwriting it.
  if (/android:networkSecurityConfig=/.test(manifest))
    throw new Error('Review custom networkSecurityConfig before applying the HTTPS-only release policy.');
  let rules = read('android/app/proguard-rules.pro');
  if (!rules.includes('# RADIOBEE_CAPACITOR'))
    rules += `
# RADIOBEE_CAPACITOR
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
`;
  write('android/app/build.gradle', gradle);
  write('android/variables.gradle', variables);
  write('android/app/src/main/AndroidManifest.xml', manifest);
  write('android/app/proguard-rules.pro', rules);
  // Update only managed splash items; retain unrelated theme items and custom styles.
  const stylesFile = 'android/app/src/main/res/values/styles.xml';
  const styles = replace(
    read(stylesFile),
    /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>)([\s\S]*?)(<\/style>)/,
    (_match, open, body, close) => {
      for (const [name, value] of Object.entries({
        'android:background': '@color/radiobee_icon_background',
        windowSplashScreenBackground: '@color/radiobee_icon_background',
        windowSplashScreenAnimatedIcon: '@drawable/radiobee_splash_icon',
        postSplashScreenTheme: '@style/AppTheme.NoActionBar',
      })) {
        const item = new RegExp(`<item name="${name}">[\\s\\S]*?<\\/item>`);
        body = item.test(body)
          ? body.replace(item, `<item name="${name}">${value}</item>`)
          : `${body}\n        <item name="${name}">${value}</item>`;
      }
      return `${open}${body}${close}`;
    },
    'launch theme',
  );
  write(stylesFile, styles);
  write(
    'android/app/src/main/res/drawable/radiobee_splash_icon.xml',
    '<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:width="168dp" android:height="168dp" android:gravity="center" android:drawable="@drawable/radiobee_splash_logo"/></layer-list>\n',
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchAndroid();
  console.log('Applied RadioBee Android version, SDK, HTTPS and R8 settings. Run android:assets before Gradle.');
}
