# カイトウ・フック / Dapperdasher Hat reference record

Scope: Splatoon 3 FrostyFest headgear, introduced January 2024. This implementation is original procedural Three.js geometry. Public pictures are used only as visual research, not as runtime textures. No Nintendo mesh, ripped asset, model download, extracted texture, or generated reference was used.

## Identity and available evidence

- Nintendo original announcement, January 8 2024: https://splatoon.nintendo.com/en/news/put-on-your-fanciest-finery-for-frosty-fest-in-splatoon-3/ . Confirms English item name and FrostyFest context.
- Japanese identity/icon: https://game8.jp/splatoon3/587345 . Icon actually downloaded and visually inspected from https://img.game8.jp/9349305/54df9daf547d46be514516e610da6370.png/show . Shows black upward-flared cylinder, flat crown roof, full narrow oval brim, broad colored satin ribbon and bow, gold monocle and delicate hanging hook.
- Bilingual identity and appearance: https://splatoonwiki.org/wiki/Dapperdasher_Hat . Indexed text associates カイトウ・フック with Dapperdasher Hat and describes ink-color ribbon darker than player color, gold monocle and small hook.
- Nintendo original promo attribution: https://splatoonwiki.org/wiki/File:S3_FrostyFest_gear_JP.jpg (SplatoonJP Twitter promo, 1920x1080). Metadata confirmed; pixels not yet obtained.
- Four public game screenshot source records, 2024: https://splatoonwiki.org/wiki/File:S3_Dapperdasher_Hat_Front.png (940x835), https://splatoonwiki.org/wiki/File:S3_Dapperdasher_Hat_Back.png (895x780), https://splatoonwiki.org/wiki/File:S3_Dapperdasher_Hat_Left.png (930x810), https://splatoonwiki.org/wiki/File:S3_Dapperdasher_Hat_Right.png (930x835).

## Actual four-angle review

All four original screenshot PNGs were inspected directly after normal cloud-browser gallery retrieval succeeded: front, back, left, right. Direct CLI requests returned 403, but browser image retrieval worked. Front confirms monocle on VIEWER LEFT / WEARER RIGHT; bow is wearer LEFT. The text description's left-side wording was not used to override actual pixels.

Front: wide brim, upward-flared flat-topped crown, lower satin band approximately one-third of crown, round gold monocle, nasal bridge/two pads, chain and gold fishhook. Left: prominent folded bow near ear; rear brim extends behind head. Right: long gold temple arm reaches ear, ending with a bent black earpiece. Back: continuous crown and ribbon with no invented rear badge. All views: dark felt, nonmetallic crown, subtly ribbed brim edge, flat tonal diagonal checks/folds on satin; front of hat sits lower than rear.

Source files were inspection-only, never sampled into runtime textures. Current dimensions are authored native-fit interpretation, not measured proprietary game units. Top/underside angles remain unavailable; lining and exact top construction cannot be claimed verified. The native render/clearance gate is separate and remains pending.

## Native behavior distinction

This is visual headgear only, mounted to existing head bone and existing native hair-clearance descriptor. It does not alter body, face, hair geometry algorithms, physics, shooting, gear abilities, movement, or frame timing. No claim of Splatoon 3 gameplay parity follows from the visual reconstruction.

## Construction

Closed flat top, flared cylinder, complete double-surface brim with edge thickness, broad satin wrap with separate low-relief folds, small gold optical rim, low-cost clear lens, delicate linked chain (single chain curve for far LOD), and small hook. Gold and satin are separate materials. No invented extruded lettering/printed marks. 4 render batches hero/game; 3 far, with no lens at far distance. Native headSurface supplies the lower opening and monocle placement; crown height is authored independently without stretching scalp/hair.

## Reproducible integrated regression
From repository root, build with `node scripts/build-inkwave.mjs inkwave-public _site`, then run `INKWAVE_HEADGEAR_SITE="$PWD/_site" node --experimental-loader ./patches/local-quality/tests/headgear-production-loader.mjs --test patches/local-quality/tests/headgear-hook.fixture.mjs`. Earlier candidate-folder commands and local image paths above document development history; this committed fixture is the reproducible emitted-module gate. Native capture and visual acceptance are recorded in the integration report.
