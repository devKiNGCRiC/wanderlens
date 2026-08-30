module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      { locationWhenInUsePermission: 'Wanderlens uses your location to show nearby photo spots.' },
    ],
  ],
});