import { defineConfig } from 'wxt';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Runtime-registered scripts must not turn optional site access into install-time access.
      delete manifest.host_permissions;
    },
  },
  manifest: {
    name: 'CuLingo · 阅读中学英语', description: '本地生词高亮、查词、双语阅读与间隔复习。',
    permissions: ['storage', 'scripting', 'activeTab', 'unlimitedStorage'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'CuLingo' },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
