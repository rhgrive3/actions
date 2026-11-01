# 座標台帳 — 図とブロックアウトの共通データ

`tidewater_design.py` / `kelpline_design.py` → `design.json` から自動生成。単位WU、面積WU²。X/Z矩形は `[xmin,xmax,zmin,zmax]`、Yは床上面。床下面と障害物は別欄。ゲーム本体への実装ではない。

床の占有面積は障害物の接地面を差し引く。坂の上下端は軸座標の小さい側→大きい側の順。座標表にない暗黙の全面床は存在しない。

## Tidewater Plaza

### 床・坂

|図ID / データID|XZ範囲|上面Y / 坂端Y|下面 / 厚み|素材|役割|
|---|---|---|---|---|---|
|F01 / `A_spawn`|[-10, 10, -72, -64]|4.8|-4|solid|protected launch court; three exits|
|F02 / `A_arrival`|[-18, 18, -56, -46]|3.6|-4|solid|civic arrival court and ranked goal approach|
|F03 / `A_west_landing`|[-30, -18, -70, -58]|3.6|-4|solid|west departure landing|
|F04 / `A_west_terrace`|[-38, -18, -50, -30]|2.4|-4|solid|broad inhabited terrace; decision to high market or low street|
|F05 / `A_east_civic`|[22, 34, -70, -46]|2.4|-4|solid|east civic courtyard; no continuous back-row floor|
|F06 / `A_lower_court`|[-14, 10, -34, -20]|1.2|-4|solid|lower civic court; regroup and exchange routes|
|F07 / `A_market_hall`|[-36, -24, -18, -6]|4.8|4.2|solid|upper market hall above low street|
|F08 / `A_market_edge`|[-36, -30, -6, 0]|4.8|4.2|solid|solid waterside market edge|
|F09 / `A_market_grate`|[-30, -24, -6, 0]|4.8|4.2|grate|short mesh section; swim falls onto low underpass|
|F10 / `A_market_bridge`|[-24, -8, -6, 0]|4.8|4.2|solid|inhabited bridge across lower routes; offset from opponent|
|F11 / `A_low_entry`|[-28, -22, -30, -24]|0|-4|solid|low street ramp landing|
|F12 / `A_low_turn`|[-28, -16, -24, -20]|0|-4|solid|wide turn; choose underpass or return up|
|F13 / `A_low_street`|[-28, -22, -20, -6]|0|-4|solid|continuous street underneath market; open at both ends|
|F14 / `A_east_terrace`|[18, 38, -38, -28]|1.2|-4|solid|waterside middle terrace; width changes at forecourt|
|F15 / `A_east_turn`|[18, 26, -28, -20]|1.2|-4|solid|turn landing beside belvedere rise|
|F16 / `A_court_cross`|[10, 18, -32, -24]|1.2|-4|solid|lateral merge with lower civic court|
|F17 / `A_belvedere`|[24, 38, -20, -8]|3.6|-4|solid|east viewing court; attack mid from a different height|
|F18 / `A_central_arm`|[10, 16, -18, -8]|0|-4|solid|low return from belvedere; grounded alternative to high market|
|F19 / `B_spawn`|[-10, 10, 64, 72]|4.8|-4|solid|protected launch court; three exits|
|F20 / `B_arrival`|[-18, 18, 46, 56]|3.6|-4|solid|civic arrival court and ranked goal approach|
|F21 / `B_west_landing`|[18, 30, 58, 70]|3.6|-4|solid|west departure landing|
|F22 / `B_west_terrace`|[18, 38, 30, 50]|2.4|-4|solid|broad inhabited terrace; decision to high market or low street|
|F23 / `B_east_civic`|[-34, -22, 46, 70]|2.4|-4|solid|east civic courtyard; no continuous back-row floor|
|F24 / `B_lower_court`|[-10, 14, 20, 34]|1.2|-4|solid|lower civic court; regroup and exchange routes|
|F25 / `B_market_hall`|[24, 36, 6, 18]|4.8|4.2|solid|upper market hall above low street|
|F26 / `B_market_edge`|[30, 36, 0, 6]|4.8|4.2|solid|solid waterside market edge|
|F27 / `B_market_grate`|[24, 30, 0, 6]|4.8|4.2|grate|short mesh section; swim falls onto low underpass|
|F28 / `B_market_bridge`|[8, 24, 0, 6]|4.8|4.2|solid|inhabited bridge across lower routes; offset from opponent|
|F29 / `B_low_entry`|[22, 28, 24, 30]|0|-4|solid|low street ramp landing|
|F30 / `B_low_turn`|[16, 28, 20, 24]|0|-4|solid|wide turn; choose underpass or return up|
|F31 / `B_low_street`|[22, 28, 6, 20]|0|-4|solid|continuous street underneath market; open at both ends|
|F32 / `B_east_terrace`|[-38, -18, 28, 38]|1.2|-4|solid|waterside middle terrace; width changes at forecourt|
|F33 / `B_east_turn`|[-26, -18, 20, 28]|1.2|-4|solid|turn landing beside belvedere rise|
|F34 / `B_court_cross`|[-18, -10, 24, 32]|1.2|-4|solid|lateral merge with lower civic court|
|F35 / `B_belvedere`|[-38, -24, 8, 20]|3.6|-4|solid|east viewing court; attack mid from a different height|
|F36 / `B_central_arm`|[-16, -10, 8, 18]|0|-4|solid|low return from belvedere; grounded alternative to high market|
|F37 / `C_basin`|[-16, 16, -8, 8]|0|-4|solid|neutral civic basin; center objective with several entrances|
|F38 / `C_west_underpass`|[-30, -16, -6, 6]|0|-4|solid|market underpass; open central and street exits|
|F39 / `C_east_underpass`|[16, 30, -6, 6]|0|-4|solid|rotated lower market underpass|
|R40 / `A_arrival_ramp`|[-7, 7, -64, -56]|z: 4.8 → 3.6|厚み0.6（モデル鉛直厚）|ramp|14-wide descent; 4-wide exits around spawn screen|
|R41 / `A_west_exit`|[-18, -10, -70, -64]|x: 3.6 → 4.8|厚み0.6（モデル鉛直厚）|ramp|independent west spawn exit|
|R42 / `A_west_descent`|[-30, -18, -58, -50]|z: 3.6 → 2.4|厚み0.6（モデル鉛直厚）|ramp|descend beside arrival court|
|R43 / `A_east_exit`|[10, 22, -70, -64]|x: 4.8 → 2.4|厚み0.6（モデル鉛直厚）|ramp|independent east spawn exit|
|R44 / `A_civic_cross`|[18, 22, -54, -48]|x: 3.6 → 2.4|厚み0.6（モデル鉛直厚）|ramp|lateral recovery between arrival and east court|
|R45 / `A_main_descent`|[-10, 2, -46, -34]|z: 3.6 → 1.2|厚み0.6（モデル鉛直厚）|ramp|12-wide local descent; tower-compatible corridor|
|R46 / `A_west_exchange`|[-18, -14, -34, -30]|x: 2.4 → 1.2|厚み0.6（モデル鉛直厚）|ramp|short terrace-to-court connection; 4-wide landing|
|R47 / `A_central_descent`|[0, 10, -20, -8]|z: 1.2 → 0|厚み0.6（モデル鉛直厚）|ramp|direct approach to neutral basin|
|R48 / `A_market_west_rise`|[-36, -28, -30, -18]|z: 2.4 → 4.8|厚み0.6（モデル鉛直厚）|ramp|8-wide rise from west terrace|
|R49 / `A_low_street_entry`|[-22, -14, -30, -24]|x: 0 → 1.2|厚み0.6（モデル鉛直厚）|ramp|court to sheltered low market street|
|R50 / `A_market_return`|[-22, -16, -20, -6]|z: 0 → 4.8|厚み0.6（モデル鉛直厚）|ramp|second high-market access, 34.3 percent grade|
|R51 / `A_east_descent`|[22, 34, -46, -38]|z: 2.4 → 1.2|厚み0.6（モデル鉛直厚）|ramp|east court to waterside middle terrace|
|R52 / `A_belvedere_rise`|[26, 34, -28, -20]|z: 1.2 → 3.6|厚み0.6（モデル鉛直厚）|ramp|rise at outside edge; not full-width|
|R53 / `A_belvedere_descent`|[16, 24, -18, -10]|x: 0 → 3.6|厚み0.6（モデル鉛直厚）|ramp|transverse ramp down to low central arm|
|R54 / `B_arrival_ramp`|[-7, 7, 56, 64]|z: 3.6 → 4.8|厚み0.6（モデル鉛直厚）|ramp|14-wide descent; 4-wide exits around spawn screen|
|R55 / `B_west_exit`|[10, 18, 64, 70]|x: 4.8 → 3.6|厚み0.6（モデル鉛直厚）|ramp|independent west spawn exit|
|R56 / `B_west_descent`|[18, 30, 50, 58]|z: 2.4 → 3.6|厚み0.6（モデル鉛直厚）|ramp|descend beside arrival court|
|R57 / `B_east_exit`|[-22, -10, 64, 70]|x: 2.4 → 4.8|厚み0.6（モデル鉛直厚）|ramp|independent east spawn exit|
|R58 / `B_civic_cross`|[-22, -18, 48, 54]|x: 2.4 → 3.6|厚み0.6（モデル鉛直厚）|ramp|lateral recovery between arrival and east court|
|R59 / `B_main_descent`|[-2, 10, 34, 46]|z: 1.2 → 3.6|厚み0.6（モデル鉛直厚）|ramp|12-wide local descent; tower-compatible corridor|
|R60 / `B_west_exchange`|[14, 18, 30, 34]|x: 1.2 → 2.4|厚み0.6（モデル鉛直厚）|ramp|short terrace-to-court connection; 4-wide landing|
|R61 / `B_central_descent`|[-10, 0, 8, 20]|z: 0 → 1.2|厚み0.6（モデル鉛直厚）|ramp|direct approach to neutral basin|
|R62 / `B_market_west_rise`|[28, 36, 18, 30]|z: 4.8 → 2.4|厚み0.6（モデル鉛直厚）|ramp|8-wide rise from west terrace|
|R63 / `B_low_street_entry`|[14, 22, 24, 30]|x: 1.2 → 0|厚み0.6（モデル鉛直厚）|ramp|court to sheltered low market street|
|R64 / `B_market_return`|[16, 22, 6, 20]|z: 4.8 → 0|厚み0.6（モデル鉛直厚）|ramp|second high-market access, 34.3 percent grade|
|R65 / `B_east_descent`|[-34, -22, 38, 46]|z: 1.2 → 2.4|厚み0.6（モデル鉛直厚）|ramp|east court to waterside middle terrace|
|R66 / `B_belvedere_rise`|[-34, -26, 20, 28]|z: 3.6 → 1.2|厚み0.6（モデル鉛直厚）|ramp|rise at outside edge; not full-width|
|R67 / `B_belvedere_descent`|[-24, -16, 10, 18]|x: 3.6 → 0|厚み0.6（モデル鉛直厚）|ramp|transverse ramp down to low central arm|

### 坂の幅・勾配

|ID|水平長|幅|勾配|角度|
|---|---:|---:|---:|---:|
|`A_arrival_ramp`|8.00|14.00|15.00%|8.53°|
|`A_west_exit`|8.00|6.00|15.00%|8.53°|
|`A_west_descent`|8.00|12.00|15.00%|8.53°|
|`A_east_exit`|12.00|6.00|20.00%|11.31°|
|`A_civic_cross`|4.00|6.00|30.00%|16.70°|
|`A_main_descent`|12.00|12.00|20.00%|11.31°|
|`A_west_exchange`|4.00|4.00|30.00%|16.70°|
|`A_central_descent`|12.00|10.00|10.00%|5.71°|
|`A_market_west_rise`|12.00|8.00|20.00%|11.31°|
|`A_low_street_entry`|8.00|6.00|15.00%|8.53°|
|`A_market_return`|14.00|6.00|34.29%|18.92°|
|`A_east_descent`|8.00|12.00|15.00%|8.53°|
|`A_belvedere_rise`|8.00|8.00|30.00%|16.70°|
|`A_belvedere_descent`|8.00|8.00|45.00%|24.23°|
|`B_arrival_ramp`|8.00|14.00|15.00%|8.53°|
|`B_west_exit`|8.00|6.00|15.00%|8.53°|
|`B_west_descent`|8.00|12.00|15.00%|8.53°|
|`B_east_exit`|12.00|6.00|20.00%|11.31°|
|`B_civic_cross`|4.00|6.00|30.00%|16.70°|
|`B_main_descent`|12.00|12.00|20.00%|11.31°|
|`B_west_exchange`|4.00|4.00|30.00%|16.70°|
|`B_central_descent`|12.00|10.00|10.00%|5.71°|
|`B_market_west_rise`|12.00|8.00|20.00%|11.31°|
|`B_low_street_entry`|8.00|6.00|15.00%|8.53°|
|`B_market_return`|14.00|6.00|34.29%|18.92°|
|`B_east_descent`|8.00|12.00|15.00%|8.53°|
|`B_belvedere_rise`|8.00|8.00|30.00%|16.70°|
|`B_belvedere_descent`|8.00|8.00|45.00%|24.23°|

### 障害物

|ID|XZ範囲|下端Y|上端Y|側面塗装案|役割|
|---|---|---:|---:|---|---|
|`A_spawn_front_screen`|[-3, 3, -64.8, -64]|4.8|7.8|True|block long center-to-spawn sightlines; two 4-wide ramp entries|
|`A_arrival_screen`|[-16, -10, -55, -53]|3.6|6.8|True|turn the spawn-side sightline, leave goal and three exits open|
|`A_terrace_screen`|[-34, -30, -44, -38]|2.4|5.6|True|divide broad terrace into entry and forward court|
|`A_civic_screen`|[28, 32, -60, -55]|2.4|5.6|True|east departure sightline break|
|`A_court_cover`|[5, 9, -32, -30]|1.2|2.4|True|low regroup cover, outside tower corridor|
|`A_east_screen`|[33, 37, -37, -34]|1.2|4.2|True|turn waterside approach without blocking the inner merge|
|`A_market_screen`|[-35, -31, -16, -13]|4.8|7.8|True|upper-market long sightline break|
|`A_bridge_cover`|[-13, -11, -6, -4]|4.8|6.0|True|partial bridge cover leaves a 4-wide passage and return-ramp outlet clear|
|`A_mid_screen`|[-6, -4, -1, 4]|0.0|2.4|True|offset central sightline break; objectives remain clear|
|`A_market_sea_lip`|[-36, -35.5, -12, 0]|4.8|5.7|False|visible water-edge lip; jumpable, not safety guarantee|
|`A_belvedere_sea_lip`|[37.5, 38, -20, -8]|3.6|4.5|False|water-edge reading and brief cover|
|`B_spawn_front_screen`|[-3, 3, 64, 64.8]|4.8|7.8|True|block long center-to-spawn sightlines; two 4-wide ramp entries|
|`B_arrival_screen`|[10, 16, 53, 55]|3.6|6.8|True|turn the spawn-side sightline, leave goal and three exits open|
|`B_terrace_screen`|[30, 34, 38, 44]|2.4|5.6|True|divide broad terrace into entry and forward court|
|`B_civic_screen`|[-32, -28, 55, 60]|2.4|5.6|True|east departure sightline break|
|`B_court_cover`|[-9, -5, 30, 32]|1.2|2.4|True|low regroup cover, outside tower corridor|
|`B_east_screen`|[-37, -33, 34, 37]|1.2|4.2|True|turn waterside approach without blocking the inner merge|
|`B_market_screen`|[31, 35, 13, 16]|4.8|7.8|True|upper-market long sightline break|
|`B_bridge_cover`|[11, 13, 4, 6]|4.8|6.0|True|partial bridge cover leaves a 4-wide passage and return-ramp outlet clear|
|`B_mid_screen`|[4, 6, -4, 1]|0.0|2.4|True|offset central sightline break; objectives remain clear|
|`B_market_sea_lip`|[35.5, 36, 0, 12]|4.8|5.7|False|visible water-edge lip; jumpable, not safety guarantee|
|`B_belvedere_sea_lip`|[-38, -37.5, 8, 20]|3.6|4.5|False|water-edge reading and brief cover|

### スポーン・ルール物

```json
{
  "spawns": [
    {
      "id": "A",
      "point": [
        0,
        4.8,
        -68
      ],
      "floor": "A_spawn"
    },
    {
      "id": "B",
      "point": [
        0,
        4.8,
        68
      ],
      "floor": "B_spawn"
    }
  ],
  "rules": {
    "zones": [
      {
        "rect": [
          -4,
          4,
          -4,
          4
        ],
        "y": 0.0
      }
    ],
    "rainmaker": {
      "center": [
        0,
        0,
        0
      ],
      "checkpoints": [
        [
          7,
          1.2,
          -25
        ],
        [
          -7,
          1.2,
          25
        ]
      ],
      "goals": [
        [
          8,
          3.6,
          -50
        ],
        [
          -8,
          3.6,
          50
        ]
      ]
    },
    "tower": {
      "path": [
        [
          -4,
          3.6,
          -50
        ],
        [
          -4,
          3.6,
          -46
        ],
        [
          -4,
          1.2,
          -34
        ],
        [
          -4,
          1.2,
          -26
        ],
        [
          4,
          1.2,
          -26
        ],
        [
          4,
          1.2,
          -20
        ],
        [
          4,
          0,
          -8
        ],
        [
          0,
          0,
          -8
        ],
        [
          0,
          0,
          0
        ],
        [
          0,
          0,
          8
        ],
        [
          -4,
          0,
          8
        ],
        [
          -4,
          1.2,
          20
        ],
        [
          -4,
          1.2,
          26
        ],
        [
          4,
          1.2,
          26
        ],
        [
          4,
          1.2,
          34
        ],
        [
          4,
          3.6,
          46
        ],
        [
          4,
          3.6,
          50
        ]
      ],
      "sweepRadius": 2.5,
      "assumedHeight": 8.0
    },
    "clams": {
      "baskets": [
        [
          -12,
          3.6,
          -49
        ],
        [
          12,
          3.6,
          49
        ]
      ],
      "pickupPoints": [
        [
          -24,
          2.4,
          -36
        ],
        [
          24,
          2.4,
          36
        ],
        [
          22,
          1.2,
          -30
        ],
        [
          -22,
          1.2,
          30
        ],
        [
          -25,
          0,
          -22
        ],
        [
          25,
          0,
          22
        ],
        [
          0,
          0,
          0
        ]
      ]
    }
  }
}
```

### 経路・落下・復帰

|経路|3D折線長|用途|座標列|
|---|---:|---|---|
|`A_direct`|87.148|central descent, regroup, neutral basin|`[[0, 4.8, -68], [5, 4.8, -68], [5, 4.8, -64], [5, 3.6, -56], [-4, 3.6, -50], [-4, 3.6, -46], [-4, 1.2, -34], [-4, 1.2, -26], [4, 1.2, -26], [4, 1.2, -20], [4, 0, -8], [0, 0, 0]]`|
|`A_market`|115.246|west terrace and high market; drop to center|`[[0, 4.8, -68], [-10, 4.8, -67], [-18, 3.6, -67], [-24, 3.6, -64], [-24, 3.6, -58], [-24, 2.4, -50], [-24, 2.4, -34], [-32, 2.4, -34], [-32, 2.4, -30], [-32, 4.8, -18], [-32, 4.8, -17.2], [-28, 4.8, -17.2], [-28, 4.8, -10], [-27, 4.8, -3], [-16, 4.8, -3], [-10, 4.8, -3]]`|
|`A_low`|71.745|sheltered low market street; attack center below bridge|`[[-4, 1.2, -26], [-14, 1.2, -27], [-22, 0, -27], [-25, 0, -27], [-25, 0, -22], [-25, 0, -12], [-25, 0, -3], [-10, 0, -3], [-2, 0, -3], [0, 0, 0]]`|
|`A_east`|119.563|east court, local rise, transverse descent to center|`[[0, 4.8, -68], [10, 4.8, -67], [22, 2.4, -67], [25, 2.4, -64], [25, 2.4, -46], [25, 1.2, -38], [30, 1.2, -31], [30, 1.2, -28], [30, 3.6, -20], [30, 3.6, -14], [24, 3.6, -14], [16, 0, -14], [13, 0, -14], [13, 0, -8], [8, 0, -5], [2, 0, -5], [0, 0, 0]]`|
|`A_market_return`|46.043|safe mesh/drop recovery via second ramp|`[[-25, 0, -3], [-25, 0, -12], [-25, 0, -22], [-19, 0, -22], [-19, 0, -20], [-19, 4.8, -6], [-16, 4.8, -3]]`|
|`A_mesh_recovery`|48.043|exact mesh landing to upper market|`[[-27, 0, -3], [-25, 0, -3], [-25, 0, -12], [-25, 0, -22], [-19, 0, -22], [-19, 0, -20], [-19, 4.8, -6], [-16, 4.8, -3]]`|
|`A_bridge_recovery`|64.243|exact bridge drop landing to upper market|`[[-6.8, 0, -3], [-25, 0, -3], [-25, 0, -12], [-25, 0, -22], [-19, 0, -22], [-19, 0, -20], [-19, 4.8, -6], [-16, 4.8, -3]]`|
|`B_direct`|87.148|central descent, regroup, neutral basin|`[[0, 4.8, 68], [-5, 4.8, 68], [-5, 4.8, 64], [-5, 3.6, 56], [4, 3.6, 50], [4, 3.6, 46], [4, 1.2, 34], [4, 1.2, 26], [-4, 1.2, 26], [-4, 1.2, 20], [-4, 0, 8], [0, 0, 0]]`|
|`B_market`|115.246|west terrace and high market; drop to center|`[[0, 4.8, 68], [10, 4.8, 67], [18, 3.6, 67], [24, 3.6, 64], [24, 3.6, 58], [24, 2.4, 50], [24, 2.4, 34], [32, 2.4, 34], [32, 2.4, 30], [32, 4.8, 18], [32, 4.8, 17.2], [28, 4.8, 17.2], [28, 4.8, 10], [27, 4.8, 3], [16, 4.8, 3], [10, 4.8, 3]]`|
|`B_low`|71.745|sheltered low market street; attack center below bridge|`[[4, 1.2, 26], [14, 1.2, 27], [22, 0, 27], [25, 0, 27], [25, 0, 22], [25, 0, 12], [25, 0, 3], [10, 0, 3], [2, 0, 3], [0, 0, 0]]`|
|`B_east`|119.563|east court, local rise, transverse descent to center|`[[0, 4.8, 68], [-10, 4.8, 67], [-22, 2.4, 67], [-25, 2.4, 64], [-25, 2.4, 46], [-25, 1.2, 38], [-30, 1.2, 31], [-30, 1.2, 28], [-30, 3.6, 20], [-30, 3.6, 14], [-24, 3.6, 14], [-16, 0, 14], [-13, 0, 14], [-13, 0, 8], [-8, 0, 5], [-2, 0, 5], [0, 0, 0]]`|
|`B_market_return`|46.043|safe mesh/drop recovery via second ramp|`[[25, 0, 3], [25, 0, 12], [25, 0, 22], [19, 0, 22], [19, 0, 20], [19, 4.8, 6], [16, 4.8, 3]]`|
|`B_mesh_recovery`|48.043|exact mesh landing to upper market|`[[27, 0, 3], [25, 0, 3], [25, 0, 12], [25, 0, 22], [19, 0, 22], [19, 0, 20], [19, 4.8, 6], [16, 4.8, 3]]`|
|`B_bridge_recovery`|64.243|exact bridge drop landing to upper market|`[[6.8, 0, 3], [25, 0, 3], [25, 0, 12], [25, 0, 22], [19, 0, 22], [19, 0, 20], [19, 4.8, 6], [16, 4.8, 3]]`|

高台で終わる経路・下層中央で終わる経路・主経路からの枝を同じ終点への最短距離として比較しない。移動速度・泳ぎ・インク・加減速・敵による妨害を含まない。

```json
[
  {
    "id": "A_mesh_drop",
    "fromPoint": [
      -27,
      4.8,
      -3
    ],
    "to": [
      -27,
      0,
      -3
    ],
    "returnRoute": "A_mesh_recovery",
    "kind": "grate",
    "note": "4.8-WU fall; animation/hard landing unverified"
  },
  {
    "id": "A_bridge_drop",
    "fromPoint": [
      -8.8,
      4.8,
      -3
    ],
    "to": [
      -6.8,
      0,
      -3
    ],
    "returnRoute": "A_bridge_recovery",
    "kind": "edge",
    "note": "predeparture point; move east past x=-8 then fall, never vertically through the solid slab"
  },
  {
    "id": "B_mesh_drop",
    "fromPoint": [
      27,
      4.8,
      3
    ],
    "to": [
      27,
      0,
      3
    ],
    "returnRoute": "B_mesh_recovery",
    "kind": "grate",
    "note": "4.8-WU fall; animation/hard landing unverified"
  },
  {
    "id": "B_bridge_drop",
    "fromPoint": [
      8.8,
      4.8,
      3
    ],
    "to": [
      6.8,
      0,
      3
    ],
    "returnRoute": "B_bridge_recovery",
    "kind": "edge",
    "note": "predeparture point; move east past x=-8 then fall, never vertically through the solid slab"
  }
]
```

## Kelpline Terminal

### 床・坂

|図ID / データID|XZ範囲|上面Y / 坂端Y|下面 / 厚み|素材|役割|
|---|---|---|---|---|---|
|F01 / `A_spawn`|[-12, 12, -72, -66]|6|-4|solid|protected departure terrace|
|F02 / `B_spawn`|[-12, 12, 66, 72]|6|-4|solid|protected departure terrace|
|F03 / `A_headhouse`|[-38, -4, -66, -60]|6|-4|solid|outer departure terrace|
|F04 / `B_headhouse`|[4, 38, 60, 66]|6|-4|solid|outer departure terrace|
|F05 / `A_outer_top`|[-44, -38, -66, -58]|6|-4|solid|outer switchback landing|
|F06 / `B_outer_top`|[38, 44, 58, 66]|6|-4|solid|outer switchback landing|
|F07 / `A_high_neck`|[-38, -30, -60, -52]|6|5.4|solid|transfer gallery above service quay|
|F08 / `B_high_neck`|[30, 38, 52, 60]|6|5.4|solid|transfer gallery above service quay|
|F09 / `A_high_gantry`|[-38, -20, -52, -34]|6|5.4|solid|transfer gantry above service quay|
|F10 / `B_high_gantry`|[20, 38, 34, 52]|6|5.4|solid|transfer gantry above service quay|
|F11 / `A_rear_concourse`|[-20, 22, -60, -50]|4.8|-4|solid|public distribution concourse|
|F12 / `B_rear_concourse`|[-22, 20, 50, 60]|4.8|-4|solid|public distribution concourse|
|F13 / `A_rear_wing`|[12, 22, -66, -60]|4.8|-4|solid|return terrace beside spawn ramp|
|F14 / `B_rear_wing`|[-22, -12, 60, 66]|4.8|-4|solid|return terrace beside spawn ramp|
|F15 / `A_low_quay`|[-38, -20, -58, -34]|1.2|-4|solid|service quay beneath transfer gantry|
|F16 / `B_low_quay`|[20, 38, 34, 58]|1.2|-4|solid|service quay beneath transfer gantry|
|F17 / `A_outer_foot`|[-44, -38, -42, -34]|1.2|-4|solid|outer ramp recovery landing|
|F18 / `B_outer_foot`|[38, 44, 34, 42]|1.2|-4|solid|outer ramp recovery landing|
|F19 / `A_boarding_rear`|[-12, 12, -42, -32]|3.6|-4|solid|boarding approach|
|F20 / `B_boarding_rear`|[-12, 12, 32, 42]|3.6|-4|solid|boarding approach|
|F21 / `A_boarding_main`|[-22, 12, -32, -10]|3.6|3|solid|boarding court above service street|
|F22 / `B_boarding_main`|[-12, 22, 10, 32]|3.6|3|solid|boarding court above service street|
|F23 / `A_boarding_west`|[-30, -22, -22, -10]|3.6|3|solid|boarding balcony and local recovery entrance|
|F24 / `B_boarding_west`|[22, 30, 10, 22]|3.6|3|solid|boarding balcony and local recovery entrance|
|F25 / `A_boarding_grate`|[-30, -22, -28, -22]|3.6|3.45|grate|optional side grate beside existing recovery loop|
|F26 / `B_boarding_grate`|[22, 30, 22, 28]|3.6|3.45|grate|optional side grate beside existing recovery loop|
|F27 / `A_service`|[-30, 0, -28, -10]|0|-4|solid|covered service street with two exits|
|F28 / `B_service`|[0, 30, 10, 28]|0|-4|solid|covered service street with two exits|
|F29 / `A_service_turn`|[-42, -30, -28, -20]|0|-4|solid|open drop landing and recovery court|
|F30 / `B_service_turn`|[30, 42, 20, 28]|0|-4|solid|open drop landing and recovery court|
|F31 / `A_recovery_foot`|[-42, -38, -20, -12]|0|-4|solid|local boarding ramp landing|
|F32 / `B_recovery_foot`|[38, 42, 12, 20]|0|-4|solid|local boarding ramp landing|
|F33 / `A_cargo`|[20, 40, -50, -24]|2.4|-4|solid|cargo court around ferry basin|
|F34 / `B_cargo`|[-40, -20, 24, 50]|2.4|-4|solid|cargo court around ferry basin|
|F35 / `A_cargo_inner`|[12, 20, -42, -30]|2.4|-4|solid|cargo approach terrace|
|F36 / `B_cargo_inner`|[-20, -12, 30, 42]|2.4|-4|solid|cargo approach terrace|
|F37 / `A_ferry`|[24, 40, -16, -4]|1.2|-4|solid|low ferry finger beside central channel|
|F38 / `B_ferry`|[-40, -24, 4, 16]|1.2|-4|solid|low ferry finger beside central channel|
|F39 / `central_service`|[-18, 18, -10, 10]|0|-4|solid|low cross-terminal junction|
|F40 / `central_west`|[-12, -4, -10, 10]|3.6|3|solid|central transfer bridge|
|F41 / `central_east`|[4, 12, -10, 10]|3.6|3|solid|central transfer bridge|
|F42 / `central_solid`|[-4, 4, -10, 10]|3.6|3|solid|solid objective saddle|
|R43 / `A_spawn_ramp`|[-4, 12, -66, -60]|z: 6 → 4.8|厚み0.6（モデル鉛直厚）|ramp|broad primary spawn descent|
|R44 / `B_spawn_ramp`|[-12, 4, 60, 66]|z: 4.8 → 6|厚み0.6（モデル鉛直厚）|ramp|broad primary spawn descent|
|R45 / `A_high_to_concourse`|[-30, -20, -60, -54]|x: 6 → 4.8|厚み0.6（モデル鉛直厚）|ramp|local terrace connector|
|R46 / `B_high_to_concourse`|[20, 30, 54, 60]|x: 4.8 → 6|厚み0.6（モデル鉛直厚）|ramp|local terrace connector|
|R47 / `A_outer_descent`|[-44, -38, -58, -42]|z: 6 → 1.2|厚み0.6（モデル鉛直厚）|ramp|waterside switchback to service quay|
|R48 / `B_outer_descent`|[38, 44, 42, 58]|z: 1.2 → 6|厚み0.6（モデル鉛直厚）|ramp|waterside switchback to service quay|
|R49 / `A_main_descent`|[-8, 8, -50, -42]|z: 4.8 → 3.6|厚み0.6（モデル鉛直厚）|ramp|main boarding approach|
|R50 / `B_main_descent`|[-8, 8, 42, 50]|z: 3.6 → 4.8|厚み0.6（モデル鉛直厚）|ramp|main boarding approach|
|R51 / `A_gantry_to_boarding`|[-20, -12, -42, -34]|x: 6 → 3.6|厚み0.6（モデル鉛直厚）|ramp|high flank rejoins boarding court|
|R52 / `B_gantry_to_boarding`|[12, 20, 34, 42]|x: 3.6 → 6|厚み0.6（モデル鉛直厚）|ramp|high flank rejoins boarding court|
|R53 / `A_quay_to_service`|[-30, -22, -34, -28]|z: 1.2 → 0|厚み0.6（モデル鉛直厚）|ramp|low flank enters covered street|
|R54 / `B_quay_to_service`|[22, 30, 28, 34]|z: 0 → 1.2|厚み0.6（モデル鉛直厚）|ramp|low flank enters covered street|
|R55 / `A_boarding_recovery`|[-38, -30, -20, -12]|x: 0 → 3.6|厚み0.6（モデル鉛直厚）|ramp|local return from safe drop court|
|R56 / `B_boarding_recovery`|[30, 38, 12, 20]|x: 3.6 → 0|厚み0.6（モデル鉛直厚）|ramp|local return from safe drop court|
|R57 / `A_rear_to_cargo`|[12, 20, -50, -42]|z: 4.8 → 2.4|厚み0.6（モデル鉛直厚）|ramp|independent cargo approach|
|R58 / `B_rear_to_cargo`|[-20, -12, 42, 50]|z: 2.4 → 4.8|厚み0.6（モデル鉛直厚）|ramp|independent cargo approach|
|R59 / `A_cargo_to_boarding`|[12, 20, -30, -24]|x: 3.6 → 2.4|厚み0.6（モデル鉛直厚）|ramp|cross-route choice between cargo and boarding|
|R60 / `B_cargo_to_boarding`|[-20, -12, 24, 30]|x: 2.4 → 3.6|厚み0.6（モデル鉛直厚）|ramp|cross-route choice between cargo and boarding|
|R61 / `A_cargo_to_ferry`|[28, 36, -24, -16]|z: 2.4 → 1.2|厚み0.6（モデル鉛直厚）|ramp|ferry basin descent|
|R62 / `B_cargo_to_ferry`|[-36, -28, 16, 24]|z: 1.2 → 2.4|厚み0.6（モデル鉛直厚）|ramp|ferry basin descent|
|R63 / `A_ferry_to_center`|[18, 24, -10, -6]|x: 0 → 1.2|厚み0.6（モデル鉛直厚）|ramp|low central side entrance|
|R64 / `B_ferry_to_center`|[-24, -18, 6, 10]|x: 1.2 → 0|厚み0.6（モデル鉛直厚）|ramp|low central side entrance|

### 坂の幅・勾配

|ID|水平長|幅|勾配|角度|
|---|---:|---:|---:|---:|
|`A_spawn_ramp`|6.00|16.00|20.00%|11.31°|
|`B_spawn_ramp`|6.00|16.00|20.00%|11.31°|
|`A_high_to_concourse`|10.00|6.00|12.00%|6.84°|
|`B_high_to_concourse`|10.00|6.00|12.00%|6.84°|
|`A_outer_descent`|16.00|6.00|30.00%|16.70°|
|`B_outer_descent`|16.00|6.00|30.00%|16.70°|
|`A_main_descent`|8.00|16.00|15.00%|8.53°|
|`B_main_descent`|8.00|16.00|15.00%|8.53°|
|`A_gantry_to_boarding`|8.00|8.00|30.00%|16.70°|
|`B_gantry_to_boarding`|8.00|8.00|30.00%|16.70°|
|`A_quay_to_service`|6.00|8.00|20.00%|11.31°|
|`B_quay_to_service`|6.00|8.00|20.00%|11.31°|
|`A_boarding_recovery`|8.00|8.00|45.00%|24.23°|
|`B_boarding_recovery`|8.00|8.00|45.00%|24.23°|
|`A_rear_to_cargo`|8.00|8.00|30.00%|16.70°|
|`B_rear_to_cargo`|8.00|8.00|30.00%|16.70°|
|`A_cargo_to_boarding`|8.00|6.00|15.00%|8.53°|
|`B_cargo_to_boarding`|8.00|6.00|15.00%|8.53°|
|`A_cargo_to_ferry`|8.00|8.00|15.00%|8.53°|
|`B_cargo_to_ferry`|8.00|8.00|15.00%|8.53°|
|`A_ferry_to_center`|6.00|4.00|20.00%|11.31°|
|`B_ferry_to_center`|6.00|4.00|20.00%|11.31°|

### 障害物

|ID|XZ範囲|下端Y|上端Y|側面塗装案|役割|
|---|---|---:|---:|---|---|
|`A_spawn_screen`|[-4, 4, -66.8, -66]|6|8.6|True|spawn sightline screen; two side exits|
|`B_spawn_screen`|[-4, 4, 66, 66.8]|6|8.6|True|spawn sightline screen; two side exits|
|`A_concourse_kiosk`|[-12, -8, -56, -52]|4.8|7.2|True|concourse view break|
|`B_concourse_kiosk`|[8, 12, 52, 56]|4.8|7.2|True|concourse view break|
|`A_gantry_cargo`|[-34, -30, -48, -44]|6|8.4|True|upper gantry view break|
|`B_gantry_cargo`|[30, 34, 44, 48]|6|8.4|True|upper gantry view break|
|`A_quay_cargo`|[-34, -30, -48, -44]|1.2|3.4|True|lower service quay view break|
|`B_quay_cargo`|[30, 34, 44, 48]|1.2|3.4|True|lower service quay view break|
|`A_boarding_kiosk`|[-16, -10, -24, -18]|3.6|6.0|True|boarding court shelter|
|`B_boarding_kiosk`|[10, 16, 18, 24]|3.6|6.0|True|boarding court shelter|
|`A_service_cover`|[-10, -6, -24, -20]|0|1.8|True|lower street corner shelter clear of grate landing|
|`B_service_cover`|[6, 10, 20, 24]|0|1.8|True|lower street corner shelter clear of grate landing|
|`A_cargo_stack`|[28, 34, -38, -35]|2.4|4.8|True|cargo court view break|
|`B_cargo_stack`|[-34, -28, 35, 38]|2.4|4.8|True|cargo court view break|
|`A_ferry_cover`|[34, 38, -12, -8]|1.2|3.2|True|ferry finger shelter|
|`B_ferry_cover`|[-38, -34, 8, 12]|1.2|3.2|True|ferry finger shelter|
|`A_bridge_edge`|[-12, -10, -9, -5]|3.6|5.8|True|bridge edge shelter clear of tower envelope|
|`B_bridge_edge`|[10, 12, 5, 9]|3.6|5.8|True|bridge edge shelter clear of tower envelope|
|`central_service_cover`|[-3, 3, -2, 2]|0|1.8|True|low junction view break|

### スポーン・ルール物

```json
{
  "spawns": [
    {
      "id": "A",
      "point": [
        0,
        6,
        -68
      ],
      "floor": "A_spawn"
    },
    {
      "id": "B",
      "point": [
        0,
        6,
        68
      ],
      "floor": "B_spawn"
    }
  ],
  "rules": {
    "zones": [
      {
        "rect": [
          -18,
          -12,
          -6,
          2
        ],
        "y": 0
      },
      {
        "rect": [
          12,
          18,
          -2,
          6
        ],
        "y": 0
      }
    ],
    "rainmaker": {
      "center": [
        0,
        3.6,
        0
      ],
      "checkpoints": [
        [
          0,
          3.6,
          -35
        ],
        [
          0,
          3.6,
          35
        ]
      ],
      "goals": [
        [
          0,
          4.8,
          -54
        ],
        [
          0,
          4.8,
          54
        ]
      ]
    },
    "tower": {
      "path": [
        [
          7,
          3.6,
          -28
        ],
        [
          7,
          3.6,
          -14
        ],
        [
          7,
          3.6,
          0
        ],
        [
          -7,
          3.6,
          0
        ],
        [
          -7,
          3.6,
          14
        ],
        [
          -7,
          3.6,
          28
        ]
      ],
      "sweepRadius": 2.5
    },
    "clams": {
      "baskets": [
        [
          0,
          4.8,
          -54
        ],
        [
          0,
          4.8,
          54
        ]
      ],
      "pickupPoints": [
        [
          -18,
          0,
          -16
        ],
        [
          18,
          0,
          16
        ],
        [
          24,
          2.4,
          -32
        ],
        [
          -24,
          2.4,
          32
        ],
        [
          -26,
          6,
          -48
        ],
        [
          26,
          6,
          48
        ],
        [
          0,
          3.6,
          0
        ]
      ]
    }
  }
}
```

### 経路・落下・復帰

|経路|3D折線長|用途|座標列|
|---|---:|---|---|
|`A_main`|88.673|primary upper approach|`[[0, 6, -68], [8, 6, -68], [8, 6, -66], [8, 4.8, -60], [0, 4.8, -54], [0, 4.8, -50], [0, 3.6, -42], [0, 3.6, -32], [7, 3.6, -16], [7, 3.6, 0], [0, 3.6, 0]]`|
|`B_main`|88.673|primary upper approach|`[[0, 6, 68], [-8, 6, 68], [-8, 6, 66], [-8, 4.8, 60], [0, 4.8, 54], [0, 4.8, 50], [0, 3.6, 42], [0, 3.6, 32], [-7, 3.6, 16], [-7, 3.6, 0], [0, 3.6, 0]]`|
|`A_high_flank`|130.352|outer high transfer route|`[[0, 6, -68], [-8, 6, -68], [-8, 6, -63], [-34, 6, -63], [-34, 6, -56], [-34, 6, -50], [-26, 6, -50], [-26, 6, -38], [-20, 6, -38], [-12, 3.6, -38], [-6, 3.6, -38], [-6, 3.6, -14], [-6, 3.6, 0]]`|
|`B_high_flank`|130.352|outer high transfer route|`[[0, 6, 68], [8, 6, 68], [8, 6, 63], [34, 6, 63], [34, 6, 56], [34, 6, 50], [26, 6, 50], [26, 6, 38], [20, 6, 38], [12, 3.6, 38], [6, 3.6, 38], [6, 3.6, 14], [6, 3.6, 0]]`|
|`A_low_flank`|135.594|waterside low service route|`[[0, 6, -68], [-8, 6, -68], [-8, 6, -63], [-41, 6, -63], [-41, 6, -58], [-41, 1.2, -42], [-41, 1.2, -38], [-26, 1.2, -38], [-26, 1.2, -34], [-26, 0, -28], [-26, 0, -26], [-18, 0, -26], [-18, 0, -16], [-8, 0, -12], [-8, 0, -4]]`|
|`B_low_flank`|135.594|waterside low service route|`[[0, 6, 68], [8, 6, 68], [8, 6, 63], [41, 6, 63], [41, 6, 58], [41, 1.2, 42], [41, 1.2, 38], [26, 1.2, 38], [26, 1.2, 34], [26, 0, 28], [26, 0, 26], [18, 0, 26], [18, 0, 16], [8, 0, 12], [8, 0, 4]]`|
|`A_cargo_flank`|96.882|cargo and ferry approach to low center|`[[0, 6, -68], [8, 6, -68], [8, 6, -66], [8, 4.8, -60], [16, 4.8, -54], [16, 4.8, -50], [16, 2.4, -42], [24, 2.4, -38], [32, 2.4, -30], [32, 2.4, -24], [32, 1.2, -16], [28, 1.2, -8], [24, 1.2, -8], [18, 0, -8], [15, 0, -4]]`|
|`B_cargo_flank`|96.882|cargo and ferry approach to low center|`[[0, 6, 68], [-8, 6, 68], [-8, 6, 66], [-8, 4.8, 60], [-16, 4.8, 54], [-16, 4.8, 50], [-16, 2.4, 42], [-24, 2.4, 38], [-32, 2.4, 30], [-32, 2.4, 24], [-32, 1.2, 16], [-28, 1.2, 8], [-24, 1.2, 8], [-18, 0, 8], [-15, 0, 4]]`|
|`A_recovery`|28.273|short return from drop court to boarding|`[[-31.5, 0, -21], [-40, 0, -21], [-40, 0, -16], [-38, 0, -16], [-30, 3.6, -16], [-26, 3.6, -16]]`|
|`B_recovery`|28.273|short return from drop court to boarding|`[[31.5, 0, 21], [40, 0, 21], [40, 0, 16], [38, 0, 16], [30, 3.6, 16], [26, 3.6, 16]]`|
|`A_grate_recovery`|37.773|short return from side grate landing to boarding|`[[-26, 0, -25], [-40, 0, -25], [-40, 0, -16], [-38, 0, -16], [-30, 3.6, -16], [-26, 3.6, -16]]`|
|`B_grate_recovery`|37.773|short return from side grate landing to boarding|`[[26, 0, 25], [40, 0, 25], [40, 0, 16], [38, 0, 16], [30, 3.6, 16], [26, 3.6, 16]]`|

高台で終わる経路・下層中央で終わる経路・主経路からの枝を同じ終点への最短距離として比較しない。移動速度・泳ぎ・インク・加減速・敵による妨害を含まない。

```json
[
  {
    "id": "A_boarding_drop",
    "fromPoint": [
      -29.2,
      3.6,
      -21
    ],
    "to": [
      -31.5,
      0,
      -21
    ],
    "returnRoute": "A_recovery",
    "departure": "move west past x=-30 before descent; the landing is outside the balcony footprint"
  },
  {
    "id": "B_boarding_drop",
    "fromPoint": [
      29.2,
      3.6,
      21
    ],
    "to": [
      31.5,
      0,
      21
    ],
    "returnRoute": "B_recovery",
    "departure": "move east past x=30 before descent; the landing is outside the balcony footprint"
  },
  {
    "id": "A_grate_drop",
    "fromPoint": [
      -26,
      3.6,
      -25
    ],
    "to": [
      -26,
      0,
      -25
    ],
    "returnRoute": "A_grate_recovery"
  },
  {
    "id": "B_grate_drop",
    "fromPoint": [
      26,
      3.6,
      25
    ],
    "to": [
      26,
      0,
      25
    ],
    "returnRoute": "B_grate_recovery"
  }
]
```

