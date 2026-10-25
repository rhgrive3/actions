// Environment adapter: use the already installed Chromium; preserve every checker launch option.
import { chromium as installed } from '/workspace/actions/node_modules/playwright/index.mjs';
export const chromium = {
  launchPersistentContext: (profile, options) => installed.launchPersistentContext(profile, { ...options, executablePath: '/usr/bin/chromium' }),
};
