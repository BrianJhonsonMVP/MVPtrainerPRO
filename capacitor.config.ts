import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mvptrainer.pro',
  appName: 'MVP Trainer Pro',
  webDir: 'dist',
  backgroundColor: '#05070c',
  android: {
    allowMixedContent: false,
    backgroundColor: '#05070c'
  },
  ios: {
    backgroundColor: '#05070c',
    contentInset: 'automatic'
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  }
};

export default config;
