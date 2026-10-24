import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Only these positively identified documentation/Hex-only trees may omit the
// expensive game suite. Unknown paths and unavailable history require it.
export function requiresGameQuality(paths) {
  return !paths.length || paths.some(file => !/^(?:README\.md|docs\/[^\0]*\.md$|lanes\/|bootstrap\/|\.github\/workflows\/hex-[^/]+\.ya?ml$)/.test(file));
}
const immutableSha = value => /^[a-f0-9]{40}$/.test(value || '') && !/^0+$/.test(value);
const invokeGit = args => execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']});
// Only the two immutable trees are needed; unavailable history must run the full suite.
export function prepareQualityComparison(base, head, git = invokeGit) {
  if (!immutableSha(base) || !immutableSha(head)) return {available:false, reason:'immutable comparison unavailable'};
  const hasTree = sha => { try { git(['--no-lazy-fetch','cat-file','-e',sha+'^{commit}']); git(['--no-lazy-fetch','cat-file','-e',sha+'^{tree}']); return true; } catch { return false; } };
  if (!hasTree(head)) return {available:false, reason:'immutable head tree unavailable'};
  if (hasTree(base)) return {available:true, fetched:false, reason:'immutable comparison trees present'};
  try {
    git(['fetch','--no-tags','--depth=1','origin',base]);
    if (!hasTree(base)) return {available:false, reason:'base tree unavailable after shallow fetch'};
    return {available:true, fetched:true, reason:'immutable base tree fetched at depth one'};
  } catch { return {available:false, reason:'base fetch failed; full suite required'}; }
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
  const base=process.env.QUALITY_BASE_SHA,head=process.env.QUALITY_HEAD_SHA;
  const history=process.argv.includes('--fetch-base')?prepareQualityComparison(base,head):null;
  const result=history&&!history.available?{relevant:true,reason:history.reason}:qualityScope(base,head);
  Object.assign(result,{base:base||null,head:head||null,...(history?{history}: {})});
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`relevant=${result.relevant}\n`);
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Quality comparison: base=${base||'unavailable'} head=${head||'unavailable'}; relevant=${result.relevant}; ${result.reason}${history?'; '+history.reason:''}\n`);
  if(!result.relevant) console.log('A+ gate skipped: unrelated changes; required check remains present');
}
