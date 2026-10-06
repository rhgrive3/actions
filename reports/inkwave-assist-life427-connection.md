# Authoritative assist helper life connection

Refs #427. Integration-only start: https://github.com/rhgrive3/actions/issues/427#issuecomment-6025850639
Base496cc8f9, composed current Flow481/deferred lethal/clothing owners retained.

Actual packet reproduction: a helper damages the victim in life1, then respawns into life2 before the victim terminal arrives. The old ID-only authoritative assist list aliases the new actor life and grants it0.5 Flow. This is a production connection defect, distinct from the legacy fixture's immediate-death and old damage-weight assumptions.

The writer keeps the existing assists ID array intact and adds an assistLives map of known safe helper epochs. Current consumers compare that metadata with the actor's actual netLife. They never synthesize an unknown old-wire epoch from the current actor. Metadata-free legacy packets can use existing local accepted credit; when the ACK is delayed, the bounded terminal record allows that validated ACK to finish the award. Without either kind of proof, the legacy award remains unproven rather than guessed. Same-life native owner adoption accepts the victim's explicit life metadata without requiring an ACK held by the old owner. Malformed/negative/string/missing/future life metadata cannot grant an immediate award.

The protocol test fixture now exports native Hit, resolves patch/native paths, steps the real Actor phase for deferred lethal, uses current configured Flow weights/streak awards and checks actual confirmed damage even when its configured weight is zero. It preserves false sender, malformed ACK, ownership, victim/helper life, duplicate and terminal/ACK ordering boundaries. Current terminal notification and Quick Respawn history replace retired synchronous/previousLifeNoSplat assumptions.

Twenty actual-module cases pass, including original sixteen updated boundaries and four new groups: old life-alias negative, ID-array preservation, both legacy ACK orders, native owner adoption, duplicate delivery and malformed epoch inputs. No broad protocol rewrite, numerical tuning or main merge. Mixed-old-client epoch safety is limited to locally provable credit; physical browser/network acceptance remains pending.
