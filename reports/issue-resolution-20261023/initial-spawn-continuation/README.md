# 初回Squid Spawn replay継続

実装 `cc5625d4`。本番から分離したnative Charger限定の実験。待機→飛行→着地→最初の発射を30/60/120Hzで実Actor/Physics/資源/WeaponRunnerにより再実行する。

- 最終receiver24/24、input/replay/実Worker quota39/39がNode22.23.4で成功。個別suiteの結果であり、full125-fileまたはブラウザ検証ではない。
- 偽resource/effective/body、aim request欠落は拒否。初回の失敗ログも保持する。
- introからplayingへの過去入力を現在phaseで処理するとbody不一致で失効する。過去Match/worldの信頼できる順序、後続life・loading・移管、残64main・sub/special、必須damage gateは未完成。#1665/#1666はOpen。

[現在の正確な契約](../../../patches/network-replication/native-charger-replay-contract.md)。Nintendoの未公開値は追加せず、CPU検証を実機比較と扱わない。
