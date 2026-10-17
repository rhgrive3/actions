// New gear only. Original upstream remains locked; existing hair fitting is reused unchanged.
function once(code,before,after,label){const i=code.indexOf(before);if(i<0||code.indexOf(before,i+before.length)!==-1)throw Error('INKWAVE headgear conflict: '+label);return code.slice(0,i)+after+code.slice(i+before.length);}
export function adaptHeadgear(rel,code){
 if(rel==='src/game/character-style.js'){
  code=once(code,"export const HATS = ['none', 'cap', 'beanie', 'bucket'];","export const HATS = ['none', 'cap', 'beanie', 'bucket', 'armor-helmet-replica', 'two-line-mesh', 'camo-headphones-suiton', 'ink-black-flap-cap'];",'catalog IDs');
  code=once(code,"export const HAT_NAMES = ['None', 'Snapback', 'Beanie', 'Bucket Hat'];","export const HAT_NAMES = ['None', 'Snapback', 'Beanie', 'Bucket Hat', 'Armor Helmet Replica', 'Two-Stripe Mesh', \"Seafoam 'Phones\", 'Ink-Black Flap Cap'];",'catalog names');
  code=once(code,'1 + pick(HATS.length - 1)','1 + pick(3)','preserve existing random pool');
 }
 if(rel==='src/i18n.js')code=once(code,"HAT_NAMES: ['なし', 'スナップバック', 'ニット帽', 'バケットハット'],","HAT_NAMES: ['なし', 'スナップバック', 'ニット帽', 'バケットハット', 'アーマーメット レプリカ', '2ラインメッシュ', 'カモヘッドホン スイトン', 'シェーディングキャップ スミ'],",'Japanese labels');
 if(rel==='src/game/character-geo.js'){
  code="import { HEADGEAR_FITS } from '../../patches/local-quality/headgear/catalog.mjs';\n"+code;
  code=once(code,'];\n\n/** Classify every strand against a dome hat','  ...HEADGEAR_FITS,\n];\n\n/** Classify every strand against a dome hat','fit catalog');
  code=once(code,'if (hatCtx) buildHat(B, hat, hatCtx, D);','if (hatCtx && !hat.separateAttachment) buildHat(B, hat, hatCtx, D);','avoid duplicate shell');
  code=once(code,"return { geo: B.build('aTint', 'aHair'), rest, meta, name: style.name, hat: hat.name, lod: D.lod, dropped:","return { hatContext: hatCtx, geo: B.build('aTint', 'aHair'), rest, meta, name: style.name, hat: hat.name, lod: D.lod, dropped:",'native fit result');
 }

 if(rel==='src/game/character-mats.js') code += `
// Rigid new headgear uses the same existing hurt and flash signals as native hat fabric.
const headgearSignalMaterials = new WeakSet();
export function withHeadgearSignals(material, u) {
  if (headgearSignalMaterials.has(material)) return material;
  headgearSignalMaterials.add(material);
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    for (const key of ['uHurt', 'uHurtSeed', 'uFlash']) shader.uniforms[key] = u[key];
    inject(shader, {
      vPars: 'varying vec3 vBindPos;',
      vBegin: 'vBindPos = position + vec3(0.0, 1.05, -0.002);',
      fPars: 'uniform vec4 uHurt; uniform float uHurtSeed; uniform vec3 uFlash; varying vec3 vBindPos;' + NOISE,
      fColor: '',
      fEmissive: 'totalEmissiveRadiance += uFlash;',
    });
    // Apply native damage after any authored textile color hook.
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', HURT_FRAG + '\\n#include <roughnessmap_fragment>');
  };
  material.customProgramCacheKey = () => cacheKey + '|iw-headgear-signals-v1';
  material.needsUpdate = true;
  return material;
}
`;
 if(rel==='src/game/character.js'){
  code="import { syncHeadgear, warmHeadgear, setHeadgearColor, disposeHeadgear } from '../../patches/local-quality/headgear/lifecycle.mjs';\n"+code;
  code=once(code,'  _tierProps(t) {\n','  _tierProps(t) {\n    syncHeadgear(this, TIERS[t]);\n','rigid LOD handoff');
  code=once(code,'      // build every tier + the dither twins','      warmHeadgear(this);\n      // build every tier + the dither twins','precompile gear tiers');
  code=once(code,'    this.color.set(color);\n','    this.color.set(color);\n    setHeadgearColor(this, this.color);\n','team color');
  code=once(code,'    LIVE.delete(this);','    disposeHeadgear(this);\n    LIVE.delete(this);','owned resource cleanup');
 }
 return code;
}
