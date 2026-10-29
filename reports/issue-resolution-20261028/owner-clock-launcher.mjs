// Platform launcher adapter only. The immutable owner-clock/game/relay harness
// remains unchanged; require Chromium's sandbox and the provisioned Chromium151.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/workspace/actions/node_modules/playwright/index.mjs';
import {sandboxBrowserOptions} from '/workspace/wt-integration/scripts/lib/inkwave-sandbox-browser.mjs';
const launch=chromium.launch.bind(chromium);
const output='/workspace/scratch/agent1-owner-clock-8c7-launch.json';
chromium.launch=async options=>{
  const strict=sandboxBrowserOptions({CHROMIUM_EXECUTABLE_PATH:chromium.executablePath()});
  const args=(options.args||[]).filter(arg=>arg!=='--no-sandbox');
  const configured={...options,...strict,args};
  if(!configured.chromiumSandbox||configured.args.some(arg=>arg==='--no-sandbox'))throw Error('Strict sandbox launcher required');
  const receipt={scope:'launcher options only; game clocks, runtime and acceptance harness unchanged',
    executablePath:configured.executablePath,headless:configured.headless,chromiumSandbox:configured.chromiumSandbox,args,
    loaderSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')};
  fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  const browser=await launch(configured);
  receipt.browserVersion=browser.version();fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  console.log('OWNER_CLOCK_LAUNCH '+JSON.stringify(receipt));
  browser.once('disconnected',()=>console.log('OWNER_CLOCK_BROWSER_DISCONNECTED'));
  return browser;
};
