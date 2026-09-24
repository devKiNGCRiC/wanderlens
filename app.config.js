/**
 * Dynamic Expo config.
 *
 * **Purpose**: Expo reads app.json first, then calls this function with that
 * result as `config`. It spreads the static config and appends config plugins,
 * which are build-time scripts that edit the native Android/iOS projects
 * (permissions, native SDK setup).
 *
 * **Gotcha**: changing or adding a plugin here only takes effect after a new dev
 * build (`npm run android` / `npm run ios`); Metro reloads alone won't apply it.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    // MapLibre native map SDK (map tiles come from OpenFreeMap, no Google key needed).
    '@maplibre/maplibre-react-native',
    '@react-native-community/datetimepicker',
    // Each permission string below is the text the OS shows in its permission prompt.
    // Location is requested as "when in use" only, never background.
    [
      'expo-location',
      { locationWhenInUsePermission: 'Wanderlens uses your location to show nearby photo spots.' },
    ],
    [
      'expo-camera',
      { cameraPermission: 'Allow Wanderlens to access your camera to capture geo-tagged spot photos.' },
    ],
    'expo-video',
    [
      'expo-audio',
      { microphonePermission: 'Allow Wanderlens to access your microphone to record voice messages.' },
    ],
    // Sentry crash reporting: uploads source maps at build time so production
    // stack traces point at real source lines.
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: 'dev-king',
        project: 'wanderlens',
      },
    ],
  ],
});