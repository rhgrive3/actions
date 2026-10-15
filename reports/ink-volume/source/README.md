# 原典素材

`zerokizo/splatoonsweps@a74592726f38f26fd1d3a15ed315701068283847` から、以下のファイルをバイト変更せず収録しています。素材の利用許可を取得済みとのユーザーの指示に基づき、本ゲームへ同梱します。

- `materials/splatoonsweps/effects/rollerink{1,2}.{vtf,vmt}`
- `materials/splatoonsweps/crosshair/{line,dot}.{vtf,vmt}`

元VTFのSHA-256は、同梱packのmanifestの`patterns[].sourceSHA256`に記録しています。通常起動で使用するpackは`patches/local-quality/ink-volume/assets/`にあり、VTFの全RGBAと事前生成した3D形状を含みます。gzipを展開した全バイナリもSHA-256で検証します。

3D形状、可変厚み、ライティング、LODは本実装の追加処理です。上流の平面描画や、本家の公式形状値として扱いません。
