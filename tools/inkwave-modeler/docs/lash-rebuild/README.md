# まつ毛とライナーの作り直し（候補。まだマージしない）

- 目の開き（眼裂）は変えない。ライナーの下の線 = 今の開きの上のふち。
- ライナー: 参照の上の線と下の線から、別パーツ（厚さ 0.12 mm の板）として作る。
- 上まつ毛 4 本、下まつ毛 6 本: 別パーツの細い管。下のふちの線も別パーツ。
- 古い下まつ毛の塗りは、顔の材料スロットを元に戻して消した。`HEAD_face` の形は同じ。
- 髪は触っていない。

作り方:

```bash
cd tools/inkwave-modeler
blender -b <A_baseline.blend> --python scripts/inkwave_lash_rebuild.py -- --save <out.blend>
```

設計: `analysis/lash_rebuild/design.json`
画像: `img/`（左から 参照 | 今のマスター | 候補）

まだのこと: 眼裂の一部だけの直し、頬・口・鼻・あご、QA。
