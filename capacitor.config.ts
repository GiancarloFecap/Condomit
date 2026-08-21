import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.condomit.app',
  appName: 'Condomit',
  webDir: 'www',
  backgroundColor: '#f3f4f6',
  loggingBehavior: 'debug',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
    appStartPath: '/inicio.html'
  },
  android: {
    backgroundColor: '#f3f4f6',
    loggingBehavior: 'debug',
    buildOptions: {
      releaseType: 'AAB'
    }
  },
  ios: {
    backgroundColor: '#f3f4f6',
    preferredContentMode: 'mobile',
    loggingBehavior: 'debug',
    buildOptions: {
      signingStyle: 'automatic',
      exportMethod: 'app-store-connect'
    }
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css'
    }
  }
};

export default config;
