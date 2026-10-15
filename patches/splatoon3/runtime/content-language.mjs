// Player instructions belong in the loadout panel; source calibration status is
// retained on catalogue records and in the engineering reports.
const FAMILIES = Object.freeze({
 shooter:['シューター','Shooter','連射で塗りながら相手をねらう。','Fire repeatedly to paint and aim at opponents.'],
 blaster:['ブラスター','Blaster','弾の直撃と爆風で相手をねらう。','Aim for direct hits or catch opponents in the blast.'],
 dualies:['マニューバー','Dualies','二丁で射撃。撃ちながらジャンプでスライドできる。','Fire both weapons; jump while firing to dodge roll.'],
 roller:['ローラー','Roller','転がして塗り、振ってインクを飛ばす。','Roll to paint, or flick to throw ink.'],
 brush:['フデ','Brush','振ってインクを飛ばし、押したまま走って塗る。','Swing to fling ink, or hold fire to run and paint.'],
 charger:['チャージャー','Charger','長押しでチャージし、はなして遠くをねらう。','Hold to charge, then release to shoot at range.'],
 splatling:['スピナー','Splatling','長押しでチャージし、はなすと連射する。','Hold to charge, then release for sustained fire.'],
 slosher:['スロッシャー','Slosher','インクを放物線状に飛ばし、段差の向こうもねらう。','Lob ink in an arc to reach over cover.'],
 brella:['シェルター','Brella','射撃後に押し続けるとカサを開いて防ぐ。','Keep holding after firing to open the canopy and block attacks.'],
 stringer:['ストリンガー','Stringer','長押しでチャージ。地上と空中で矢の並びが変わる。','Hold to charge; jumping changes the arrow spread.'],
 splatana:['ワイパー','Splatana','振って斬撃を飛ばす。長押しでタメ斬り。','Swing to launch slashes; hold for a charged slash.'],
});
const SPECIALS_JA = Object.freeze({
 trizooka:['ウルトラショット','らせん状のインク弾を3回発射する。'],bubbler:['グレートバリア','その場にバリアを設置する。相手は中に入れるので、発生装置も守ろう。'],
 inkVac:['キューインキ','相手の弾を吸い込み、ためた力で反撃弾を発射する。'],tentaMissiles:['マルチミサイル','相手を照準に入れ、ロックしてミサイルを発射する。'],
 inkjet:['ジェットパック','空中に浮かび、インク弾を発射する。終了すると発動地点にもどる。'],booyahBomb:['ナイスダマ','ナイスで力をため、大きなインクの球を投げる。'],
 ultraStamp:['ウルトラハンコ','ハンコを連続で振り下ろす。サブ操作で投げられる。'],zipcaster:['ショクワンダー','腕を伸ばして壁に飛びつき、移動しながら攻撃する。'],
 killerWail:['メガホンレーザー5.1ch','相手を追いかけるレーザーを発射する。'],crabTank:['カニタンク','連射とカノン砲を使い分ける。イカ操作で球になって移動する。'],
 reefslider:['サメライド','前方へ突進し、爆発して周囲を攻撃する。'],tripleInkstrike:['トリプルトルネード','ガイド装置を投げ、狙った場所に竜巻を起こす。'],
 superChump:['デコイチラシ','着地点を選び、爆発するデコイをまとめて送り込む。'],krakenRoyale:['テイオウイカ','巨大なイカになり、ジャンプやタメ突進で攻撃する。'],
 splattercolorScreen:['スミナガシート','前方へ進むシートを放ち、通過した相手の視界を妨げる。'],waveBreaker:['ホップソナー','設置した装置から波を送り、相手を探知してダメージを与える。'],
 tacticooler:['エナジースタンド','ドリンクスタンドを設置し、味方の動きを強化する。'],tripleSplashdown:['ウルトラチャクチ','ジャンプして、2つの拳とともに周囲へ攻撃する。'],
});
const SUBS_JA = Object.freeze({bomb:'スプラッシュボム',suction:'キューバンボム',curling:'カーリングボム',burst:'クイックボム',autobomb:'ロボットボム',fizzy:'タンサンボム',torpedo:'トーピード',inkMine:'トラップ',toxicMist:'ポイズンミスト',angleShooter:'ラインマーカー',splashWall:'スプラッシュシールド',sprinkler:'スプリンクラー',beakon:'ジャンプビーコン',pointSensor:'ポイントセンサー'});
export function familyDescription(family, language = 'en') { return FAMILIES[family]?.[language === 'ja' ? 2 : 3] || ''; }
export function localizeGameContent({ WEAPONS = {}, SUB = {}, SPECIALS = {}, LANG = 'en' }) {
 const ja=LANG==='ja';
 for(const weapon of Object.values(WEAPONS)) {
  const family=weapon.behaviorKind||weapon.catalogRecord?.family||weapon.kind,row=FAMILIES[family];
  if(row)weapon.class=row[ja?0:1];
  if(weapon.catalogRecord||weapon.variantOf)weapon.blurb=familyDescription(family,LANG);
  if(weapon.referenceNames?.[LANG])weapon.name=weapon.referenceNames[LANG];
 }
 if(ja) {
  for(const [id,name]of Object.entries(SUBS_JA))if(SUB[id])SUB[id].name=name;
  for(const [id,[name,blurb]]of Object.entries(SPECIALS_JA))if(SPECIALS[id])Object.assign(SPECIALS[id],{name,blurb});
 }
}
