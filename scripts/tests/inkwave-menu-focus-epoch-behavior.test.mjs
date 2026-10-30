import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real source-epoch decorators and checker-owned audit with a
// minimal dynamic DOM. This is a semantic fixture, not a browser result.
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const historical = read('../../patches/splatoon3/tests/fixtures/menu-layout-cache-1915-before.mjs.txt');
const current = read('../../patches/splatoon3/runtime/menu-layout.mjs');
const checker = read('../check-inkwave-menu-focus.mjs');

function fixture(source) {
  const start=source.indexOf('function decorateMode('),end=source.indexOf('\nfunction decorateResults(',start);
  assert(start>=0&&end>start,'actual mode decorator source');
  const root={children:[],appendChild(node){node.remove();this.children.push(node);node.parentNode=this;},
    insertBefore(node,next){node.remove();const i=this.children.indexOf(next);this.children.splice(i<0?this.children.length:i,0,node);node.parentNode=this;},
    querySelector(selector){return selector==='.iw-modesel__row'&&row.parentNode===this?row:null;}};
  const row={parentNode:root,style:{gridTemplateColumns:'repeat(2,minmax(0,1fr))'},
    get isConnected(){return this.parentNode===root;},get nextSibling(){return null;},
    remove(){if(this.parentNode){const children=this.parentNode.children;children.splice(children.indexOf(this),1);this.parentNode=null;}},
    querySelectorAll(){return cards.filter(card=>card.parentNode===this);},
    appendChild(card){card.remove();card.parentNode=this;}};
  root.children.push(row);
  const cards=Array.from({length:6},()=>({parentNode:row,remove(){this.parentNode=null;}}));
  const audit={graphNavigation:[]},menus={_input:'touch',_focus:cards[0],_setFocus(card){this._focus=card;},_moveFocus(card){this._focus=card;}};
  const mode={el:root,onNav(dir){audit.graphNavigation.push({dir});return false;}};
  const ctx=vm.createContext({touchMenu:()=>false,globalThis:null});ctx.globalThis=ctx;
  ctx.getComputedStyle=()=>({gridTemplateColumns:'100px 100px'});
  vm.runInContext(source.slice(start,end)+';globalThis.decorate=decorateMode;',ctx);
  ctx.decorate(menus,mode);
  return {ctx,mode,modeRow:row,modeCards:cards,menus,audit};
}

function ownershipAudit(f) {
  const begin='    const auditModeOwnership = () => {';
  const end='    }; // End epoch-specific mode ownership audit';
  const first=checker.indexOf(begin),last=checker.indexOf(end,first);
  assert(first>=0&&last>first,'checker contains one epoch-specific ownership audit');
  assert.equal(checker.indexOf(begin,first+begin.length),-1);
  const body=checker.slice(first+begin.length,last);
  return vm.runInContext('(function(){'+body+'})',f.ctx);
}

test('historical detached row throws while current source delegates, confirming distinct epoch contracts',()=>{
  const old=fixture(historical);old.modeRow.remove();assert.throws(()=>old.mode.onNav('right'),e=>e?.name==='TypeError');assert.equal(old.audit.graphNavigation.length,0);
  const now=fixture(current);now.modeRow.remove();assert.equal(now.mode.onNav('right'),false);assert.equal(now.audit.graphNavigation.length,1);
});

test('checker applies the real historical and current ownership expectations without weakening current controls',()=>{
  for(const [source,epoch,labels] of [[historical,'historical-stage-picker',['historical detached row preserves prior TypeError','historical reparented card uses the live grid']],
    [current,'a1381283-screen-owned-caches',['disconnected cached row delegates native graph without disconnected focus','reparented cached card delegates the native graph']]]){
    const f=fixture(source),checks=[];Object.assign(f.ctx,f,{menuEpoch:epoch,check:(ok,label)=>{assert.ok(ok,label);checks.push(label);}});
    ownershipAudit(f)();assert.deepEqual(checks,labels);assert.equal(f.modeRow.parentNode,f.mode.el);assert.equal(f.modeCards.at(-1).parentNode,f.modeRow);
  }
});

test('checker fails closed for an unknown epoch',()=>{
  const f=fixture(current);Object.assign(f.ctx,f,{menuEpoch:'unknown',check:()=>{}});
  assert.throws(()=>ownershipAudit(f)(),/Unknown menu-layout source epoch/);
});

test('swapping the admitted epoch cannot make either owner pass the other audit',()=>{
  for(const [source,menuEpoch] of [[historical,'a1381283-screen-owned-caches'],[current,'historical-stage-picker']]){
    const f=fixture(source);Object.assign(f.ctx,f,{menuEpoch,check:(ok,label)=>assert.ok(ok,label)});
    assert.throws(()=>ownershipAudit(f)());
  }
});
