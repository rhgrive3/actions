# 2026-10-19：ギア実consumer再監査（スペ増のガチ自然増加・ジャン短の各相丸め）

監査の比較基準は公開 main `1cbe15538e6fb98a7ab18a58473caf75006bf6ad`、Splatoon 3 Ver.11.3.0。公開時は最新main `56bbf33832563f32f18662353a160d0e049d1672` を親にし、監査対象consumerが変わっていないことを確認した。変更した3 runtime filesと関連 consumer/fixture 計20 pathsを GitHub tree blob と照合した。公開版 `inkwave-public/` の Actor を出荷時 `adaptBuildSource` と全 runtime installer で構成し、Match / NetMatch の実consumerを実行した。画面・音声はfixture、ジャンプは実Physicsの平床。ブラウザ実表示とSwitch実機比較は未実施。

根拠：
- [任天堂 Ver.11.3.0 更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html)（参照版の固定。以下の丸め・自然加算の数式を公式が公表したという意味ではない）
- [Leanny 原パラメータ 1130、固定commit 7280ff9](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json)：IncreaseRt_Special=[1.3,1.15,1]、SuperJump_ChargeFrm=[20,35,80]、SuperJump_MoveFrm=[96.6,132.3,138] を取得して既存profileと一致確認。
- [攻略＆検証Wiki スペシャル増加量アップ](https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割2#special_charge_up)：塗り以外（ガチ自然増加、ナイス応援、逆境強化）には倍率が乗らない。
- [同Wiki スーパージャンプ時間短縮](https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割2#quick_super_jump)：各相の小数点以下を切り捨てる計算と試し撃ち場ビーコンでの検証記載。Wikiは2026-10-19取得の非固定版であり、11.3.0実機を今回新規計測した証拠ではない。

### 1. スペシャル増加量アップがガチ自然増加まで増幅していた

`runtime/gear.mjs` は塗りptを増やす代わりに必要SPを倍率で割っている。従来 `runtime/ranked/install.mjs` の `Match.playRankedEvents` と `runtime/ranked/network.mjs` の `acceptState` は、未補正の baseline points をそのゲージに加算し、自然増加にも倍率を掛けていた。

スプラシューター・必要200p・自然増加45p・0/3/10/30/57APで、修正前のhost/follower双方はゲージ22.5/23.1518475/24.54525/27.54225/29.25%。修正後は全て22.5%。両consumerのみ加算量を現在の `specialCharge` で除算し、wireの累積 `rankedGains` は元のbaseline pointsを保持した。装備を変えても既存のゲージ割合維持を使い、過去の累積を割り直さない。

塗りは実 `Actor.addTurf` のまま、同45pでスペ増の倍率が有効。kill receipt自体には独立のSP加算がなく、キル由来の床塗りは通常の塗り経路に属する。逆境強化とナイス応援consumerは既にこの単位補正を持っているため変更していない。ガチ4ルールの「いつ・どちらのチームへ自然加算するか」のモデルも変更していない。

### 2. ジャン短の小数フレームが各相で切り上がっていた

`runtime/gear.mjs` の charge/flight は小数秒のままnative Actorの `>=` 完了条件へ渡され、60Hzで実質ceilになっていた。入力確定をt=0、初回updateを1Fとし、既存の開始形態項（イカ1F・ヒト22F）を別に計上して再現。0APの80/138Fは一致するが、3APは58/138F（Wiki57/137F）、10AP44/137F（43/136F）、30AP27/121F（26/120F）、48AP21/101F（20/100F）、57AP20/97F（20/96F）だった。一律の初回frame数え違いではない。

ギア適用後の各相を個別に `floor(seconds*60+1e-10)/60` へ量子化した。原パラメータ・AP曲線・初回入力・開始形態項・ステルスジャンプの後付けflight項・着地処理は変えていない。WikiのS3ヒト形態補足+18Fと現行実装のイカ1F/ヒト22F（差21F）は未解決。Inkipediaの+21F記述および2020年の81/102F動画はS2の情報であり、S3初動の根拠に転用しない。現行1/22Fは出典bindingのないcalibrationとして扱い、startupを変更せず、総所要時間がS3実機と完全一致するとはしない。

### 回帰と確認範囲

追加：
- `patches/splatoon3/tests/ranked-special-charge-consumer.test.mjs`：実Match/NetMatch.onMessage、ガチ4ルール、0/3/10/30/57AP、host/follower 30/60/120Hz、累積重複、非host/旧match/旧revision拒否、動的ギア・死亡/復活・死中加算の未繰越、paint倍率・cap保持。
- `patches/splatoon3/tests/quick-super-jump-frames.test.mjs`：0/3/6/10/20/30/48/57AP×イカ/ヒト×30/60/120Hz。実Actor.superJump→_updateSuperJump→実Physics着地。直前tick/境界tick、charge/flight各phase、全timeline、refresh/respawnを検証。

実行：`node --experimental-vm-modules --test patches/splatoon3/tests/{ranked-special-charge-consumer,quick-super-jump-frames}.test.mjs`。修正前main consumerを残した別コピーに同じtestを載せた負対照では6件全てが期待差分で失敗、修正候補では6件全て成功。関連13 test files（復短・復ペナ・条件付きギア・起動形態・ジャンプ動作・ステジャン・ギア移管・ガチ同期・エナスタロック・動作中SPを含む）の149 testsは成功。任意source motionのdynamic-import callback警告は既存fixtureから出るが、当該149件に失敗はない。

今回確認した復活時間短縮は、初回敵death不発、連続無kill敵death、kill後の次の無kill life、落下/水没が条件を消さないこと、assist非阻害・死後kill、0/3/6/10/20/30/57AP短縮、復ペナAP補正を既存実consumer回帰で確認。スペシャル減少は通常・水没/落下、復ペナ自身/相手、AP補正・ゲージ維持を確認した。ホコ固有death等の別レーン、実機の同期誤差、今回未実行の全スイートを網羅したとはしない。


ローカル環境ではesbuildが未導入で、全build・emitted bundle・ブラウザQAは未実行。PRの固定headでCI/build/browserの結果を別途確認する。149件は対象consumerのCPU回帰結果であり、全build完了の代替ではない。
