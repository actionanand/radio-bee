import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.radiobee.app',
  appName: 'RadioBee',
  webDir: 'www',
  loggingBehavior: 'none',
  // Legacy HTTP radio sources require cleartext support in the Android WebView.
  // Only three explicitly allowlisted URLs are accepted by the catalogue/player.
  server: { androidScheme: 'https', cleartext: true },
  android: {
    backgroundColor: '#fff8e7',
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
