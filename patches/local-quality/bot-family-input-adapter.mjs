// Bot trigger input by weapon family (owner-forwarded review 2026-11-05: turf
// outliers in a Bot-only survey). Compared with how the same weapon is
// operated in Splatoon 3:
//   - Brella: holding ZR opens the canopy (ink drain, then the canopy shot on
//     Splat/Tenta Brella) and stops the shotgun. The Bot mapped Brellas onto
//     the shooter branch and held Fire continuously, so after one pellet it
//     only opened canopies. Tap the trigger like a player firing the shotgun.
//   - Splatana: tapping ZR is the horizontal swing; only a full charge is the
//     vertical slash (catalogue `c >= 1`). Painting charged to 45 % and then
//     paused 0.3-0.65 s after every release, so the horizontal swing rate was
//     well below the tap cadence. Paint with release-on-next-frame taps, the
//     same edge pattern the quick chargers already use (`fastPaint`).
//   - Brush: turf is painted with rapid ZR flicks; holding ZR (brush-run) is
//     mainly movement, e.g. across enemy ink (game guides: "フデ移動はあくまで
//     移動手段として使って、塗りはZR連打のフデ振りで行う"). The Bot was mapped
//     onto the Roller branch and painted only by holding Fire while moving.
//     Paint with flick taps; brush-run only to cross enemy ink while travelling.
// Bots are an INKWAVE feature: these are input patterns, not Splatoon 3 data.
// Weapon timing, ink cost, paint and damage are unchanged.
export function adaptBotFamilyInput(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  code = once(code,
    "    const brush = w.catalogRecord?.family === 'brush';\n",
    "    const brush = w.catalogRecord?.family === 'brush';\n" +
    "    // Holding a Brella's trigger opens its canopy instead of firing; tap it.\n" +
    "    const brella = w.catalogRecord?.family === 'brella';\n",
    'bot brella identity');
  code = once(code,
    "(family === 'charger' || family === 'stringer') && a.groundTeam !== 1);",
    "(family === 'charger' || family === 'stringer') && a.groundTeam !== 1 ||\n" +
    "      family === 'splatana');   // tap = horizontal swing; only a full charge is the vertical slash",
    'bot splatana paint taps');
  code = once(code,
    "          } else {\n            it.fire = dist < range * 1.08;\n          }",
    "          } else {\n            it.fire = dist < range * 1.08 && (!brella || botReadyPress(a));\n          }",
    'bot brella fight taps');
  code = once(code,
    "      } else {\n        it.fire = needPaint && inkFrac > 0.18;\n      }",
    "      } else {\n        it.fire = needPaint && inkFrac > 0.18 && (!brella || botReadyPress(a));\n      }",
    'bot brella paint taps');
  code = once(code,
    "        else it.fire = true;\n      }\n    }\n    this._tail(",
    "        else it.fire = !brella || botReadyPress(a);\n      }\n    }\n    this._tail(",
    'bot brella foot-paint taps');
  code = once(code,
    "        it.fire = inkFrac > 0.08 && (needPaint || Math.random() < 0.02) && wantMove;\n",
    "        if (brush) {\n" +
    "          // Brushes paint with rapid flicks; brush-run (held ZR) is travel across enemy ink.\n" +
    "          if (needPaint && inkFrac > 0.08) it.fire = botReadyPress(a);\n" +
    "          else it.fire = inkFrac > 0.08 && wantMove && a.groundTeam === 2;\n" +
    "        } else it.fire = inkFrac > 0.08 && (needPaint || Math.random() < 0.02) && wantMove;\n",
    'bot brush paint flicks');
  code = once(code,
    "    if (k !== 'charger' && k !== 'splatling' && k !== 'stringer' && k !== 'splatana') return true;\n",
    "    if (k !== 'charger' && k !== 'splatling' && k !== 'stringer' && k !== 'splatana')\n" +
    "      return this.a.weapon?.catalogRecord?.family !== 'brella' || botReadyPress(this.a);\n",
    'bot brella puddle taps');
  return code;
}
