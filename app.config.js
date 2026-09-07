module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      { locationWhenInUsePermission: 'Wanderlens uses your location to show nearby photo spots.' },
    ],
    'expo-video',
    [
      'expo-audio',
      { microphonePermission: 'Allow Wanderlens to access your microphone to record voice messages.' },
    ],
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