import { nativeStageBuild } from './build-config.mjs';
import {SOURCE_STAGES,sourceURL} from './source-catalog.mjs';
export const nativeStageEnabled = !!nativeStageBuild;
export const NATIVE_IDS = Object.freeze(['scorch','hagglefish','inkblot','mako','brinewater']);
export const NATIVE_MAPS = (nativeStageBuild?.stages || []).map(s => ({
 id:s.id, name:s.name, blurb:nativeStageBuild.mode==='browser-direct'?'初回はKiTrixの公開モデルを取得します。物理・ルール配置は検証中。':'原典表示メッシュによる検証版。物理・ルール配置は推定。',
 theme:'day',times:{day:'day',dusk:'sunset'},nativeSource:true,noBoss:true,
}));
export const NATIVE_LAYOUTS = Object.fromEntries((nativeStageBuild?.stages || []).map(s => [s.id,{
 id:s.id,nativeSource:true,bounds:s.bounds,spawnPads:s.spawnPads,spawnBarrier:s.spawnBarrier,
 single:[],half:[],decor:{},
}]));
export function nativeStageURL(id, file) {
 if (!nativeStageEnabled || !NATIVE_IDS.includes(id)) throw new RangeError('Native stage unavailable: '+id);
 if(nativeStageBuild.mode==='browser-direct')return sourceURL(SOURCE_STAGES.find(s=>s.id===id),file);
 return new URL(nativeStageBuild.baseURL + id + '/' + file, document.baseURI).href;
}

export function nativeStageFingerprint(id){
 const stage=nativeStageBuild?.stages.find(s=>s.id===id);
 return stage?'native-stage-v1:'+id+':'+stage.integritySha256+':'+nativeStageBuild.runtimeSha256:null;
}
export function nativeStageCompatible(cfg){return (cfg.nativeStage??null)===nativeStageFingerprint(cfg.map);}
