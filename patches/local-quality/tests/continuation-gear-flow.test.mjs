// Production gearPanel and continuation helper; bounded DOM/storage stand-ins.
// Browser hit testing remains the existing responsive continuation click gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import * as continuation from '../result-continuation.mjs';
import {adaptResultContinuation} from '../result-continuation-adapter.mjs';
import {ABILITIES,SHOES_ABILITIES,abilityAllowed,emptyLoadout} from '../../splatoon3/runtime/gear.mjs';
import {CLOTHING_ABILITIES,SPLATFEST_TEE} from '../../splatoon3/runtime/clothing-gear.mjs';
import {HEAD_ABILITIES} from '../../splatoon3/runtime/conditional-gear.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../../splatoon3/runtime/gear.mjs'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const install=ast.body.find(n=>n.declaration?.id?.name==='installGear').declaration;
const panel=install.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='gearPanel');assert(panel);
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners=new Map();this.className='';this.classList={add:n=>this.className+=' '+n};}
 append(...nodes){for(const n of nodes)this.appendChild(n);}
 appendChild(node){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);this.children.push(node);node.parentNode=this;return node;}
 setAttribute(k,v){this[k]=v;}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 querySelectorAll(s){const matches=n=>s.startsWith('.')?n.className.split(/\s+/).includes(s.slice(1)):s==='[data-slot]'?n.dataset.slot!==undefined:n.tagName===s.toUpperCase();return this.children.flatMap(n=>[...(matches(n)?[n]:[]),...n.querySelectorAll(s)]);}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
function rig({active=true,gear=true}={}){
 const saved=[],tuning=JSON.parse(read('../../splatoon3/profile.json'));
 const create=vm.runInNewContext('('+source.slice(panel.start,panel.end)+')',{document:{createElement:tag=>new Node(tag)},readLoadout:()=>emptyLoadout(),ABILITIES,SHOES_ABILITIES,abilityAllowed,CLOTHING_ABILITIES,SPLATFEST_TEE,HEAD_ABILITIES,tuning,G:{},STORAGE:'inkwave.splatoon3.gear.v1',localStorage:{setItem:(key,value)=>saved.push([key,JSON.parse(value)])}});
 const el=new Node('div'),box=new Node('div'),look=new Node('button');box.className='iw-loadout__look';box.append(look);el.append(box);const details=gear?create():null;if(details)el.append(details);
 const result={win:true,players:[]},screen={name:'loadout',el},calls=[],menus={current:'loadout',_results:result,_scr:screen,_resultContinuation:active?{result,committed:false}:null,_btn:opts=>Object.assign(new Node('button'),{opts}),api:{prepareMatch:()=>calls.push('prepare'),rematch:()=>calls.push('rematch')}};
 return {el,box,look,details,screen,menus,calls,saved};
}
test('continuation keeps live native gear controls below both actions in one scroll owner',()=>{
 const f=rig(),selects=f.details.querySelectorAll('select');assert.equal(selects.length,12);f.details.open=true;
 continuation.augmentContinuationLoadout(f.menus,f.screen);
 assert.equal(f.el.querySelector('.s3-gear'),f.details);assert.equal(f.details.parentNode,f.box);assert.equal(f.details.open,true);
 assert.deepEqual(f.details.querySelectorAll('select'),selects,'reparenting does not clone live controls');
 assert.equal(f.box.children[0],f.look);const button=f.box.children[1];assert.equal(button.opts.id,'continue-with-gear');assert.equal(f.box.children[2],f.details);
 selects[0].value='runSpeed';selects[0].listeners.get('change')();assert.equal(f.saved.length,1);assert.equal(f.saved[0][1][0].main,'runSpeed');
 button.opts.accept();button.opts.accept();assert.deepEqual(f.calls,['prepare','rematch']);
 const css=adaptResultContinuation('styles/ui.css','',()=>{throw Error('unexpected');});
 assert.match(css,/\.iw-continuation-actions \{[^}]*overflow-y: auto;/);
 assert.match(css,/\.iw-continuation-actions > \* \{ flex-shrink: 0; \}/);
 assert.match(css,/\.iw-continuation-actions > \.s3-gear \{ position: relative; inset: auto; width: 100%; max-height: none; box-sizing: border-box; \}/);
});
test('ordinary loadout keeps the gear owner untouched; mirrors without gear retain continuation',()=>{
 const f=rig({active:false});continuation.augmentContinuationLoadout(f.menus,f.screen);assert.equal(f.details.parentNode,f.el);assert.deepEqual(f.box.children,[f.look]);
 const plain=rig({gear:false});continuation.augmentContinuationLoadout(plain.menus,plain.screen);assert.equal(plain.box.children.length,2);plain.box.children[1].opts.accept();assert.deepEqual(plain.calls,['prepare','rematch']);
});
test('#272 actual gear panel offers Stealth Jump only in shoes main and saves that choice',()=>{
 const f=rig(),selects=f.details.querySelectorAll('select');
 assert.equal(selects.length,12);
 for(const select of selects){
  const visible=select.children.some(option=>option.value==='stealthJump');
  assert.equal(visible,select['aria-label']==='クツ メイン',select['aria-label']);
 }
 const shoesMain=selects.find(select=>select['aria-label']==='クツ メイン');
 shoesMain.value='stealthJump';shoesMain.listeners.get('change')();
 assert.equal(f.saved.length,1);
 assert.equal(f.saved[0][1][2].main,'stealthJump');
});
test('old continuation leaves the absolute gear sibling outside its action flow as a negative control',()=>{
 const current=read('../result-continuation.mjs'),needle="  const gear = screen.el.querySelector('.s3-gear');\n  if (gear) box.appendChild(gear);";assert(current.includes(needle));
 const old=vm.runInNewContext(current.replace(needle,'').replaceAll('export ','')+';({augmentContinuationLoadout})');const f=rig();old.augmentContinuationLoadout(f.menus,f.screen);
 assert.equal(f.details.parentNode,f.el);assert.equal(f.box.children.length,2);assert.equal(f.box.children[1].opts.id,'continue-with-gear');
 // The separate baseline stylesheet paints this sibling at top:15%, z-index:10.
 assert.match(read('../../splatoon3/ui.css'),/\.s3-gear \{ position: absolute;[^}]*top: 15%;[^}]*z-index: 10;/);
});
