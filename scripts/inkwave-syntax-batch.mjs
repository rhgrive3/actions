import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

export function checkJavaScriptSyntax(roots) {
  const files=[];
  const walk=dir=>{ for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(file); else if(entry.isFile() && /\.m?js$/.test(file)) files.push(file);
  }};
  for(const root of roots) walk(root);
  if(!files.length) throw Error('No JavaScript files found');
  const errors=[];
  for(const file of files) {
    const source=fs.readFileSync(file,'utf8');
    try {
      // All checked roots are in the repository's type:module package scope.
      // SourceTextModule parses only; nothing is linked or evaluated.
      new vm.SourceTextModule(source,{identifier:file});
    } catch(error) { errors.push({file,message:error.message}); }
  }
  return {files:files.length,errors};
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  const result=checkJavaScriptSyntax(process.argv.slice(2));
  console.log(JSON.stringify(result));
  if(result.errors.length) process.exitCode=1;
}
