// Query-gated controls on the actual game, never a separate fake gameplay renderer.
import { STAGE25_CATALOG, STAGE_RULES, getStageRuleData } from './index.js';
export function installStageLab(game,G) {
  if(typeof document==='undefined'||!new URLSearchParams(location.search).has('stage25lab')||game._stageLab)return;
  const panel=document.createElement('div');panel.id='stage25-lab';
  panel.style.cssText='position:fixed;right:10px;top:10px;z-index:99999;background:#102735ee;color:#edfaff;padding:12px;border:1px solid #4da5b7;border-radius:12px;font:13px system-ui;max-width:290px;max-height:70vh;overflow:auto;';
  const header=document.createElement('strong');header.textContent='STAGE 25 / 地形検証';panel.append(header);
  const note=document.createElement('p');note.textContent='原寸未照合の試作。ガチ4ルールは配置プレビューです。勝敗処理はナワバリ。';note.style.cssText='font-size:11px;line-height:1.5;color:#f4d197';panel.append(note);
  const select=document.createElement('select'),rule=document.createElement('select');
  for(const s of STAGE25_CATALOG){const o=document.createElement('option');o.value=s.id;o.textContent=s.nameJa;select.append(o);}
  for(const [i,r] of STAGE_RULES.entries()){const o=document.createElement('option');o.value=r;o.textContent=['ナワバリ','エリア配置','ヤグラ配置','ホコ配置','アサリ配置'][i];rule.append(o);}
  for(const s of [select,rule]){s.style.cssText='display:block;width:100%;padding:8px;margin:6px 0;background:#e4f4f6;color:#102735';panel.append(s);}
  const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;b.style.cssText='margin:3px;padding:7px;background:#c5ee80;color:#162529;border:0;border-radius:5px';panel.append(b);return b;};
  const status=document.createElement('pre');status.style.cssText='white-space:pre-wrap;font-size:11px;line-height:1.4';
  button('この地形で開始',async()=>{status.textContent='読み込み中';try{await game.startMatch({mapId:select.value,stageRule:rule.value});status.textContent=JSON.stringify(G.stage25?.descriptor,null,2);}catch(e){status.textContent=e.message;}});
  button('ルールデータ',()=>{status.textContent=JSON.stringify(getStageRuleData(select.value,rule.value),null,2);});
  button('水位を下げる',()=>G.stage25?.setRuleState({waterLow:true}));
  button('エリア所有 0',()=>G.stage25?.setRuleState({zoneOwner:0}));
  button('エリア所有 1',()=>G.stage25?.setRuleState({zoneOwner:1}));
  button('閉じる',()=>{panel.style.display='none';});panel.append(status);document.body.append(panel);game._stageLab=panel;
}
