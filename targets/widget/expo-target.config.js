/** @type {import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: 'widget',
  name: 'ElpulsWidget',
  displayName: 'Elpuls',
  icon: '../../assets/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit'],
  bundleIdentifier: '.widget',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.['com.apple.security.application-groups'],
  },
});
