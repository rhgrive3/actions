// Resolve the real pure dependency introduced by the native source-guided config.
import fs from 'node:fs';
import vm from 'node:vm';
export function configDependency(spec,context){
 if(spec!=='./game/inkFlight.js')throw Error('Unexpected config dependency: '+spec);
 return new vm.SourceTextModule(fs.readFileSync(new URL('../../../inkwave-public/src/game/inkFlight.js',import.meta.url),'utf8'),{context});
}
