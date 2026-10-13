import {chromium as installed} from 'playwright';
export const chromium={launchPersistentContext:(directory,options)=>installed.launchPersistentContext(directory,{...options,executablePath:'/usr/bin/chromium'})};
