import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versioning from './android-version.cjs';
import { readCapacitorIdentity } from './capacitor-identity.mjs';

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
  const { appId, appName } = readCapacitorIdentity(root);
  if (appId !== 'com.actionanand.radiobee.app')
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
  // The generated Storage Access Framework recording plugin imports
  // androidx.documentfile.provider.DocumentFile. Capacitor does not supply
  // DocumentFile transitively, so declare it in the generated app Gradle file.
  // Keep custom dependencies and don't duplicate declarations after cap sync.
  if (!/\b(?:implementation|api)\s*\(?\s*['"]androidx\.documentfile:documentfile:[^'"]+['"]/m.test(gradle)) {
    gradle = replace(
      gradle,
      /\bdependencies\s*\{/,
      "dependencies {\n    implementation 'androidx.documentfile:documentfile:1.1.0'",
      'app dependencies block for AndroidX DocumentFile',
    );
  }
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
  // Always synchronize the mobile name from the same Capacitor config used by TV.
  const displayName = appName.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const stringsFile = 'android/app/src/main/res/values/strings.xml';
  let strings = read(stringsFile);
  strings = replace(strings, /(<string[ ]+name="app_name">)[^<]*(<[/]string>)/,
    (_match, start, end) => start + displayName + end, 'Android app_name');
  strings = strings.replace(/(<string[ ]+name="title_activity_main">)[^<]*(<[/]string>)/,
    (_match, start, end) => start + displayName + end);
  write(stringsFile, strings);
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
  // Register the Storage Access Framework bridge in generated Android builds.
  // The fixture for node tests omits MainActivity; actual Capacitor projects
  // have it after 'cap add android'. Never replace unrelated native code.
  const javaRoot = path.join(root, 'android/app/src/main/java');
  const findMainActivity = dir => {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findMainActivity(file);
        if (found) return found;
      } else if (entry.name === 'MainActivity.java') return file;
    }
    return null;
  };
  const mainActivity = findMainActivity(javaRoot);
  if (mainActivity) {
    let activity = readFileSync(mainActivity, 'utf8');
    const packageName = activity.match(/^package\s+([\w.]+)\s*;/m)?.[1];
    if (!packageName) throw new Error('Generated MainActivity has no Java package');
    if (!activity.includes('registerPlugin(RadioBeeRecordingStoragePlugin.class)')) {
      const pluginRegistration = 'registerPlugin(RadioBeeRecordingStoragePlugin.class);';
      if (/super\.onCreate\(savedInstanceState\);/.test(activity)) {
        activity = activity.replace('super.onCreate(savedInstanceState);',
          pluginRegistration + '\n        super.onCreate(savedInstanceState);');
      } else {
        activity = replace(activity, /public class MainActivity extends BridgeActivity\s*\{/,
          'public class MainActivity extends BridgeActivity {\n    @Override\n' +
          '    public void onCreate(android.os.Bundle savedInstanceState) {\n        ' +
          pluginRegistration + '\n        super.onCreate(savedInstanceState);\n    }',
          'MainActivity bridge');
      }
      writeFileSync(mainActivity, activity);
    }
    const nativeSource = read('scripts/native/RadioBeeRecordingStoragePlugin.java')
      .replace(/^package\s+[\w.]+\s*;/m, 'package ' + packageName + ';');
    writeFileSync(path.join(path.dirname(mainActivity), 'RadioBeeRecordingStoragePlugin.java'), nativeSource);
    const converterSource = read('scripts/native/RadioBeeAudioConverter.java')
      .replace(/^package\s+[\w.]+\s*;/m, 'package ' + packageName + ';');
    writeFileSync(path.join(path.dirname(mainActivity), 'RadioBeeAudioConverter.java'), converterSource);
  }

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
