import type { CapacitorConfig } from '@capacitor/cli';

// ponytail: one config drives iOS/iPadOS/Android. webDir points at the Vite build
// both Capacitor and Tauri consume. Native projects (ios/, android/) are generated
// by `npm run cap:add:ios` / `cap:add:android` on a machine with Xcode/Android SDK.
const config: CapacitorConfig = {
  appId: 'app.calc.calculator',
  appName: 'Calculator',
  webDir: 'dist',
  backgroundColor: '#000000',
  ios: {
    contentInset: 'always',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: true
  },
  android: {
    backgroundColor: '#000000'
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
      showSpinner: false
    }
  }
};

export default config;
