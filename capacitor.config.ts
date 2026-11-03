import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.radiobee.app',
  appName: 'RadioBee',
  webDir: 'www',
  loggingBehavior: 'none',
  server: { androidScheme: 'https', cleartext: false },
  android: {
    backgroundColor: '#fff8e7',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
