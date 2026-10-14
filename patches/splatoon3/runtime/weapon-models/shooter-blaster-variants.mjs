// Source-row IDs are the canonical pinned 11.3.0 kit identities, not invented
// main-catalogue IDs. These are standalone derived visuals, pending selection wiring.
import { M } from './kit.mjs';
import { tentatekShell } from './tentatek-shell.mjs';
import { MODELS as A } from './shooters.mjs';
import { MODELS as B } from './shooters-b.mjs';
import { MODELS as C } from './blasters.mjs';
import { recolor, fixedSurfaces, fixedCanSurface, canAccessoryAnimation, stones, lamp, glowSticks, greenFoil, paintPattern, colorRing, starSticker, plainSticker, fixedInkSurface, partitionInk, coralTag, squidCharm } from './variant-shooter-surfaces.mjs';
const BASE = { ...A, ...B, ...C };
const SOURCE = 'https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json';
function variant(baseId, sourceRow, name, article, palette, decorate, followsCan = false) {
  const base = BASE[baseId];
  if (!base) throw new Error(`Missing base model ${baseId}`);
  return Object.freeze({ ...base, baseId, sourceRow, name, sourceUrl: `https://splatoonwiki.org/wiki/${article}`,
    sourceInfoUrl: SOURCE, referenceVersion: '11.3.0',
    // Hex values are authored approximations, not extracted Nintendo textures.
    visualStatus: 'procedural-approximation-awaiting-multiview-review',
    ...(followsCan ? { animate: canAccessoryAnimation(base.animate) } : {}),
    build(freshFamilyDef) {
      const d = base.build(freshFamilyDef);
      fixedSurfaces(d, palette); decorate?.(d);
      d.variantSourceRow = sourceRow; d.baseModelId = baseId;
      return d;
    },
  });
}
export const VARIANT_MODELS = Object.freeze({
  Shooter_First_01: variant('s3-shooter-first', 'Shooter_First_01', 'もみじシューター', 'Custom_Splattershot_Jr.', {}, starSticker, true),
  Shooter_Gravity_01: variant('s3-shooter-gravity', 'Shooter_Gravity_01', '.52ガロンデコ', '.52_Gal_Deco', {}, stones),
  Shooter_Blaze_02: variant('s3-shooter-blaze', 'Shooter_Blaze_02', 'プロモデラー彩', 'Colorz_Aerospray', { '#a8acb2':'#647cbb', '#6e737a':'#794c9f' }, d => colorRing(d)),
  Shooter_Heavy_02: variant('s3-shooter-heavy', 'Shooter_Heavy_02', '.96ガロン爪', 'Clawz_.96_Gal', {}, d => paintPattern(d, ['#9d9a92'], ['#b89054','#3e3025'], 'spots')),
  Shooter_TripleMiddle_02: variant('s3-shooter-triplemiddle', 'Shooter_TripleMiddle_02', 'H3リールガンSNAK', 'H-3_Nozzlenose_VIP-R', { '#2a3ec2':'#5c7850', '#2b43b8':'#5c7850', '#c9c8dc':'#809778' }, d => paintPattern(d,['#5c7850','#26282d'],['#607c4c','#354632'])),
  Blaster_Long_01: variant('s3-blaster-long', 'Blaster_Long_01', 'ロングブラスターカスタム', 'Custom_Range_Blaster', {}, plainSticker),
  Blaster_LightLong_01: variant('s3-blaster-lightlong', 'Blaster_LightLong_01', 'Rブラスターエリートデコ', 'Rapid_Blaster_Pro_Deco', { '#d0234f':'#3272be' }, plainSticker),
  Blaster_LightLong_02: variant('s3-blaster-lightlong', 'Blaster_LightLong_02', 'RブラスターエリートWNTR', 'Rapid_Blaster_Pro_WNT-R', { '#d0234f':'#b39c78', '#f5a21f':'#bfc3c7', '#d7d6cf':'#9a9e9c', '#bdbcb4':'#737b79' }, d => {
    fixedInkSurface(d,'#e68a35');paintPattern(d,['#9a9e9c','#737b79'],['#979d99','#636e68']);coralTag(d,'rapid');
  }),
  Blaster_Middle_02: variant('blaster', 'Blaster_Middle_02', 'ホットブラスター艶', 'Gleamz_Blaster', { '#c9ccd0':'#262831', '#8d9299':'#30333e', '#d5262b':'#6063e2' }, d => {
    d.ink.computeBoundingBox();const bb=d.ink.boundingBox.clone();fixedInkSurface(d,'#6765dc');
    colorRing(d,(bb.min.z+bb.max.z)/2,(bb.max.x-bb.min.x)/2+.003,(bb.min.y+bb.max.y)/2);
    // Existing flame topology retained; only the warm flame pigments shift hue.
    const g=d.parts.front.src,c=g.attributes.color.clone();
    for(let i=0;i<c.count;i++)if(c.getX(i)>c.getY(i)*1.3&&c.getX(i)>.12){const v=c.getX(i);c.setXYZ(i,v*.35,v*.27,v);}
    g.setAttribute('color',c);
  }),
  Shooter_Short_01: variant('s3-shooter-short', 'Shooter_Short_01', 'ボールドマーカーネオ', 'Neo_Sploosh-o-matic', { '#b48c36':'#c0c5cc' }),
  Shooter_Precision_01: variant('s3-shooter-precision', 'Shooter_Precision_01', 'シャープマーカーネオ', 'Neo_Splash-o-matic', { '#b48c36':'#c0c5cc' }),
  Shooter_Precision_02: variant('s3-shooter-precision', 'Shooter_Precision_02', 'シャープマーカーGECK', 'Splash-o-matic_GCK-O', { '#b48c36':'#594331' }, lamp),
  Shooter_Blaze_01: variant('s3-shooter-blaze', 'Shooter_Blaze_01', 'プロモデラーRG', 'Aerospray_RG', { '#a8acb2':'#d0a646', '#6e737a':'#8e6927' }),
  Shooter_Normal_01: variant('shooter', 'Shooter_Normal_01', 'スプラシューターコラボ', 'Tentatek_Splattershot', {}, tentatekShell, true),
  Shooter_Normal_02: variant('shooter', 'Shooter_Normal_02', 'スプラシューター煌', 'Glamorz_Splattershot', { '#3d2ba0':'#b9c0cd', '#efbf2a':'#d5d9df' }, d => {
    fixedCanSurface(d, 'can', '#c5a9d3'); glowSticks(d);
  }, true),
  Shooter_QuickMiddle_01: variant('s3-shooter-quickmiddle', 'Shooter_QuickMiddle_01', 'N-ZAP89', "N-ZAP_'89", { '#3d3e42':'#e8652c', '#c8262b':'#242529' }),
  Shooter_Expert_01: variant('s3-shooter-expert', 'Shooter_Expert_01', 'プライムシューターコラボ', 'Forge_Splattershot_Pro', { '#2a4896':'#25272c', '#1d3268':'#191b20', '#3d62b8':'#34363a', '#e0262e':'#ec7835', '#a8151c':'#af4e20' }, d => {
    recolor(d.body, {'#e7e3d6':'#e67d34'}, (_x, _y, z) => z > .2);
  }),
  Shooter_Expert_02: variant('s3-shooter-expert', 'Shooter_Expert_02', 'プライムシューターFRZN', 'Splattershot_Pro_FRZ-N', { '#2a4896':'#29544f', '#1d3268':'#203d39', '#3d62b8':'#376d63', '#e7e3d6':'#baa98b', '#e0262e':'#ea7f32', '#a8151c':'#a65428' }, d => {
    fixedCanSurface(d, 'can', '#bfc8ce', M.metal);
    // Only the rear hose's former red geometry is chrome; trigger/tip stay orange.
    recolor(d.body, {'#ea7f32':'#bfc8ce'}, (x, y, z) => z < -.15 || (x < -.025 && y > .05 && z < .03));coralTag(d);
  }, true),
  Shooter_Heavy_01: variant('s3-shooter-heavy', 'Shooter_Heavy_01', '.96ガロンデコ', '.96_Gal_Deco', {}, stones),
  Shooter_Long_01: variant('s3-shooter-long', 'Shooter_Long_01', 'ジェットスイーパーカスタム', 'Custom_Jet_Squelcher', {}, d => partitionInk(d, 'ink', '#ecd047')),
  Shooter_Long_02: variant('s3-shooter-long', 'Shooter_Long_02', 'ジェットスイーパーCOBR', 'Jet_Squelcher_COB-R', {}, d => paintPattern(d,['#0d6366','#0a4f52'],['#a0865b','#6c593c'])),
  Shooter_QuickLong_01: variant('s3-shooter-quicklong', 'Shooter_QuickLong_01', 'スペースシューターコラボ', 'Annaki_Splattershot_Nova', { '#e9e22a':'#ac2858' }),
  Shooter_TripleQuick_01: variant('s3-shooter-triplequick', 'Shooter_TripleQuick_01', 'L3リールガンD', 'L-3_Nozzlenose_D', { '#2a3ec2':'#93bce3', '#1e1f23':'#e6e9e9', '#c9c8dc':'#dee2eb' }),
  Shooter_TripleMiddle_01: variant('s3-shooter-triplemiddle', 'Shooter_TripleMiddle_01', 'H3リールガンD', 'H-3_Nozzlenose_D', { '#2a3ec2':'#93bce3', '#2b43b8':'#93bce3', '#1e1f23':'#e6e9e9', '#26282d':'#e6e9e9', '#3b3d44':'#bbc4ce', '#c9c8dc':'#dee2eb' }),
  Shooter_TripleQuick_02: variant('s3-shooter-triplequick', 'Shooter_TripleQuick_02', 'L3リールガン箔', 'Glitterz_L-3_Nozzlenose', { '#2a3ec2':'#67c857', '#1e1f23':'#b7c7b0', '#c9c8dc':'#caa9c2', '#7ccfb8':'#eb923c' }, squidCharm, true),
  Shooter_Flash_01: variant('s3-shooter-flash', 'Shooter_Flash_01', 'ボトルガイザーフォイル', 'Foil_Squeezer', { '#a85d2a':'#633b28', '#e5e2d8':'#c8a44e' }, greenFoil),
  Blaster_Middle_01: variant('blaster', 'Blaster_Middle_01', 'ホットブラスターカスタム', 'Custom_Blaster', { '#d5262b':'#eeece6' }),
  Blaster_Short_01: variant('s3-blaster-short', 'Blaster_Short_01', 'ノヴァブラスターネオ', 'Luna_Blaster_Neo', { '#e9e6df':'#22242b', '#d4d0c8':'#353840', '#55575c':'#eeece6' }, d => {
    recolor(d.parts.trigger.src, {'#2c2e33':'#eeece6'});
    // Source rear sphere is wholly behind z=-.07; front-shell triangles stay ink.
    partitionInk(d, 'ink', '#eeece6', M.gloss, (face, pos) => face.every(i => pos.getZ(i) < -.07));
  }),
  Blaster_LightShort_01: variant('s3-blaster-lightshort', 'Blaster_LightShort_01', 'クラッシュブラスターネオ', 'Clash_Blaster_Neo', { '#2b2f7a':'#772b3c', '#1d2058':'#4e1d29' }),
  Blaster_Light_01: variant('s3-blaster-light', 'Blaster_Light_01', 'ラピッドブラスターデコ', 'Rapid_Blaster_Deco', { '#d0234f':'#3272be' }),
  Blaster_Precision_01: variant('s3-blaster-precision', 'Blaster_Precision_01', 'S-BLAST91', "S-BLAST_'91", { '#a9a9a6':'#e9e8e2', '#8a8a87':'#c9c8c2', '#3c3d3f':'#9c9da3', '#e2401f':'#68538e', '#4a3fa0':'#76659b' }),
});
