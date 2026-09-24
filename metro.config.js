/**
 * Metro bundler config (Metro is the JavaScript bundler React Native uses).
 * Starts from Sentry's wrapper around Expo's default config, which adds the
 * source-map handling Sentry needs to symbolicate crash reports. No other
 * customisation is applied.
 */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
