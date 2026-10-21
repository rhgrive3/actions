import assert from 'node:assert/strict';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
// Inspect all QA owners against the exact manifest-bound Three namespace before
// opening Chromium. Do not fall back to the full authored development bundle.
export function verifyThreeReferences(THREE,sources){
 const rows=[];
 for(const {name,source} of sources){
  const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),namespaces=new Set(['THREE']),named=new Map(),refs=new Set(),constructors=new Set();
  function walk(node,visit){if(!node||typeof node!=='object')return;if(node.type)visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(v=>walk(v,visit));else if(value&&typeof value==='object')walk(value,visit);}}
  walk(tree,node=>{if(node.type==='ImportDeclaration'&&/(^three$|\/three\/|three\.module)/.test(node.source.value))for(const spec of node.specifiers){if(spec.type==='ImportNamespaceSpecifier')namespaces.add(spec.local.name);else if(spec.type==='ImportSpecifier'){named.set(spec.local.name,spec.imported.name);refs.add(spec.imported.name);}else assert.fail(name+': unsupported Three default import');}});
  const member=node=>{if(node.type!=='MemberExpression'||!namespaces.has(node.object?.name))return;const key=node.computed?node.property.type==='Literal'?node.property.value:null:node.property.name;assert.equal(typeof key,'string',name+': dynamic Three property cannot be verified');return key;};
  walk(tree,node=>{const key=member(node);if(key)refs.add(key);if(node.type==='NewExpression'){const ctor=member(node.callee)||named.get(node.callee.name);if(ctor){refs.add(ctor);constructors.add(ctor);}}});
  for(const key of refs)assert.notEqual(THREE[key],undefined,name+': missing production Three export '+key);
  for(const key of constructors){assert.equal(typeof THREE[key],'function',key);assert.doesNotThrow(()=>Reflect.construct(String,[],THREE[key]),key+' is not constructible');}
  rows.push({name,refs:[...refs].sort(),constructors:[...constructors].sort()});
 }
 return {status:'passed',exportCount:Object.keys(THREE).length,rows};
}
