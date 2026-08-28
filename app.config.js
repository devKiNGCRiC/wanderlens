module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    '@maplibre/maplibre-react-native',
  ],
});