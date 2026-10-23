import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
// Execute complete current production modules; synthetic imports preserve the
// real exported dependency functions. Only explicit observation hooks differ.
export async function actualModule(relative,{transform=s=>s,extra='',overrides={},globals={}}={}){
 const url=new URL('../../../'+relative,import.meta.url),source=fs.readFileSync(url,'utf8');
 const context=vm.createContext({console,performance,...globals}),imports=new Map();
 const module=new vm.SourceTextModule(transform(source)+'\n'+extra,{context,identifier:fileURLToPath(url)});
 await module.link(async spec=>{
  if(imports.has(spec))return imports.get(spec);
  const values=overrides[spec]||await import(new URL(spec,url));
  const imported=new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value]of Object.entries(values))this.setExport(name,value);},{context});
  imports.set(spec,imported);return imported;
 });
 await module.evaluate();return{api:module.namespace,context,source};
}
export const json=x=>JSON.parse(JSON.stringify(x,(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v));
