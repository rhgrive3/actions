// Optional PR1223 compatibility. No ranked module is imported into turf builds.
// A follower may consume only a state that its current host actually restored.
const receipts = new WeakMap();
const wrapped = new WeakSet();
const MODES = new Set(['zones','tower','rainmaker','clams']);
const pair = x => Array.isArray(x)&&x.length===2&&x.every(n=>Number.isFinite(n)&&n>=0&&n<=100);
export function installRankedGearReceipt(api) {
  const P=api.NetMatch?.prototype, incoming=P?.onMessage;
  if(typeof incoming!=='function'||wrapped.has(incoming))return;
  function receive(from,data){
    const m=this.match,e=m?.ranked,before=e?.revision;
    const result=incoming.call(this,from,data);
    const p=data?.rk,s=p?.state;
    if(api.G.netm===this&&api.G.match===m&&this.match===m&&m?.ranked===e&&m.follower===true&&!this.isHost&&
      from===this.s?.hostId&&p?.host===from&&p?.match===this.cfg?.id&&s?.mode===m.mode&&s?.mode===e.mode&&
      Number.isSafeInteger(s?.revision)&&s.revision>before&&e.revision===s.revision&&pair(s.counts)&&pair(e.counts)&&
      s.counts.every((n,i)=>n===e.counts[i])&&e.overtime===s.overtime&&e.winner===s.winner){
      receipts.set(m,{engine:e,net:this,host:from,id:this.cfg.id,revision:e.revision,counts:[...e.counts],overtime:e.overtime});
    }
    return result;
  }
  wrapped.add(receive);P.onMessage=receive;
}
export function trustedRankedState(match, api) {
  const e=match?.ranked,nm=api?.G?.netm;
  if(!match||api?.G?.match!==match||!MODES.has(match.mode)||e?.mode!==match.mode||!pair(e.counts)||
    !Number.isSafeInteger(e.revision)||e.revision<0||e.winner!==null||typeof e.overtime!=='boolean'||
    typeof e.update!=='function'||typeof e.snapshot!=='function')return null;
  if(match.follower===true){
    const r=receipts.get(match);
    if(!r||r.engine!==e||r.net!==nm||nm?.match!==match||nm.isHost||r.host!==nm.s?.hostId||r.id!==nm.cfg?.id||
      r.revision!==e.revision||r.overtime!==e.overtime||!r.counts.every((n,i)=>n===e.counts[i]))return null;
  }else if(nm&&(nm.match!==match||nm.isHost!==true))return null;
  return e;
}
// Sendou's maintained analyzer, pinned 3373f97: floor(18/21 * intensity),
// intensity = 51 - opposing count. This is community analysis, not game code.
export function lastDitchCountAP(count) {
  return Number.isFinite(count)?Math.max(0,Math.min(18,Math.floor(18/21*(51-count)))):0;
}
