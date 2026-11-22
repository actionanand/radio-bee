import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.radiobee.app',
  appName: 'Radio Bee',
  webDir: 'www',
  loggingBehavior: 'none',
  server: { androidScheme: 'https', cleartext: false },
  // Expose Android 15+ status/navigation insets even on older WebViews.
  plugins: { SystemBars: { insetsHandling: 'css' } },
  android: {
    backgroundColor: '#fff8e7',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
