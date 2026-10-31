import assert from 'node:assert/strict';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
// Expose the actual native actor packer without changing its body. Production
// minification renames its private binding, so a literal `export packActor`
// cannot exercise emitted modules. Source and emitted paths use this same
// structural selection, including a reference from the real _sendTick owner.
function visit(node,read){
 if(!node||typeof node!=='object')return;read(node);
 for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,read);}
 else if(value?.type)visit(value,read);
}
function member(node,object,property){return node?.type==='MemberExpression'&&!node.computed&&node.object?.name===object&&node.property?.name===property;}
function positionCall(node,actor,axis){const value=node?.type==='CallExpression'&&node.arguments[0];return value?.type==='MemberExpression'&&!value.computed&&value.property?.name===axis&&member(value.object,actor,'pos');}
export function exportNativeActorPacker(rel,code){
 if(rel!=='src/net/netmatch.js')return code;
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'}),matches=[];
 for(const entry of ast.body){const fn=entry.type==='ExportNamedDeclaration'?entry.declaration:entry;if(fn?.type!=='FunctionDeclaration'||fn.params.length!==1||fn.params[0].type!=='Identifier')continue;
  const actor=fn.params[0].name;let packet=false;
  visit(fn.body,node=>{if(node.type==='ArrayExpression'&&node.elements.length>=22&&member(node.elements[0],actor,'nid')&&positionCall(node.elements[1],actor,'x')&&positionCall(node.elements[3],actor,'z'))packet=true;});
  if(packet)matches.push(fn.id.name);
 }
 assert.equal(matches.length,1,'one actual native actor packet encoder');
 const name=matches[0];let nativeOwner=false;
 visit(ast,node=>{if(node.type==='MethodDefinition'&&node.key?.name==='_sendTick')visit(node.value,child=>{if(child.type==='Identifier'&&child.name===name)nativeOwner=true;});});
 assert.ok(nativeOwner,'the selected encoder is used by native _sendTick');
 return code+'\nexport {'+name+' as nativePackActor};\n';
}
