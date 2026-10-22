import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Only these positively identified documentation/Hex-only trees may omit the
// expensive game suite. Unknown paths and unavailable history require it.
export function requiresGameQuality(paths) {
  return !paths.length || paths.some(file => !/^(?:README\.md|docs\/[^\0]*\.md$|lanes\/|bootstrap\/|\.github\/workflows\/hex-[^/]+\.ya?ml$)/.test(file));
}
export function qualityScope(base, head, git = args => execFileSync('git', args, {encoding:'utf8'})) {
  if (!/^[a-f0-9]{40}$/.test(base || '') || /^0+$/.test(base) || !/^[a-f0-9]{40}$/.test(head || ''))
    return {relevant:true, reason:'immutable comparison unavailable'};
  try {
    const paths = git(['diff','--name-only','--no-renames','-z',base,head]).split('\0').filter(Boolean);
    return {relevant:requiresGameQuality(paths), reason:'immutable changed paths', paths};
  } catch { return {relevant:true, reason:'comparison failed; full suite required'}; }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result=qualityScope(process.env.QUALITY_BASE_SHA, process.env.QUALITY_HEAD_SHA);
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`relevant=${result.relevant}\n`);
  console.log(JSON.stringify(result));
  if(!result.relevant) console.log('A+ gate skipped: unrelated changes; required check remains present');
}
