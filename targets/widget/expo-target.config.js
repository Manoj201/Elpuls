/** @type {import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: 'widget',
  name: 'ElpulsWidget',
  displayName: 'Elpuls',
  icon: '../../assets/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit'],
  bundleIdentifier: '.widget',
  // 17.0 (not 16.0) because widget.swift's #Preview(as: .systemSmall) macro
  // requires it — this only raises the floor for the widget extension
  // target, not the main app.
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.['com.apple.security.application-groups'],
  },
});
