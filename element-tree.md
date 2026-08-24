# Element Tree

Working design doc. **Plain text = decided by Zhiming. *Italic with `?` = Claude's proposal, awaiting a ruling.***

Nothing here is implemented. The four basics live in `ELEMENT_DEFS` in `game.js`; everything
else is design only.

---

## Conventions

- **Type is thematic, not mechanical.** No resistances or synergies, but elements of a type
  share a theme in what they *do* (Fire → burn, Air → knockback, Ice → freeze, Stone → blocks).
- **Range** in tiles (32px each) — matches how `ELEMENT_DEFS` stores it (`def.range * 32`).
- **Speed** in px/s — passed straight to `setVelocityX`.
- **Reload** in seconds here; milliseconds in code.
- **Flight time** = range × 32 ÷ speed. Keep under ~1s or the element feels sluggish.
- Benchmarks: player 18px wide, runs at 200 px/s. Zombie: 10 HP, 5 damage, 70 px/s,
  68px attack range, 460px aggro, ~1.37s per swing cycle. Guard: 30 HP, 15 damage,
  300px attack range, 560px aggro, 50% knockback resist.

---

## Projectiles

| Element | Type | Parents | Dmg | Range | Speed | Flight | Reload | Effect |
|---|---|---|---|---|---|---|---|---|
| **Fire** | Fire | — (basic) | 3 | 10 | 380 | 0.84s | 3s | Burn I |
| **Water** | Water | — (basic) | 2 | 8 | 420 | 0.61s | 2s | Knockback I |
| **Air** | Air | — (basic) | 1 | 5 | 320 | 0.50s | 0.5s | Knockback I |
| **Earth** | Earth | — (basic) | 8 | 15 | 560 | 0.86s | 5s | — |
| **Ice** | Ice | — (basic) | 0 | 3 | 480 | 0.20s | 5s | Freeze III |
| **Heat** | Fire | Fire + Air | 1 | 5 | 480 | 0.33s | 1.5s | Burn III |
| **Wind** | Air | Air (evo) | 2 | 8 | 480 | 0.53s | 1.5s | Knockback II + jump boost |
| **Tornado** | Air | Wind (evo) | 3 | 15 | 560 | 0.86s | 5s | Knockback III |
| **Snow** | Ice | Ice + Destruction | 1 | 10 | 380 | 0.84s | 6s | Knockback I, then Freeze II |
| **Shock** | Electric | Electricity (evo) | 0 | 5 | 800 | 0.20s | 5s | Stun III |
| **Ash** | Fire | Fire + Earth | *0?* | *8?* | *420?* | *0.61s?* | *8s?* | *Coats target 4s: ×2 burn damage taken* |

## Area effects (no travel — resolve at a location)

| Element | Type | Parents | Dmg | Distance | Size | Duration | Reload | Effect |
|---|---|---|---|---|---|---|---|---|
| **Lava** | Fire | Fire (evo) | 5 | 5 tiles, fixed | 1 tile wide | ~1s lingering | 5s | Burn II |
| **Explosion** | Fire | Fire + Destruction | 15 | 4 tiles | 3-tile radius | instant | 15s | Burn III. No self-damage. |
| **Destruction** | — | — (basic, mid-game) | 20 | *4 tiles?* | *4-tile radius?* | instant | 15s | Widest blast in the game |
| **Tsunami** | Water | Water (evo) | 5 | sweeps whole floor | — | — | 5s | Knockback II |
| **Cloud** | Air | Air (evo) | 0 | in front | *4 tiles?* | 4s | 5s | Un-aggro while inside |
| **Mud** | *Earth?* | Water + Earth | 0 | in front | *4 tiles?* | *10s?* | 8s | Slows enemies **and the player** 50% |
| **Mist** | *Water?* | *Water + Air?* | 0 | in front | *4 tiles?* | *2s?* | *10s?* | *Applies "wet" 4s: ×2 stun duration* |
| **Electricity** | Electric | — (basic) | 5 | *6 tiles, fixed?* | *2 tiles wide?* | instant | 3s | Stun I. Falls from sky — sweeps the column. |
| **Storm** | Electric | Cloud + Electricity | *1 per 0.5s tick?* | *6 tiles?* | *5 tiles wide?* | *4s?* | 10s | Stun III refreshed every 0.5s |
| **Blizzard** | Ice | Snow + Storm | *0?* | *6 tiles?* | *6 tiles wide?* | 5s | 12s | Freeze III refreshed every 0.5s |
| **Meteor** | Stone | Stone + Light | 3 × 10 | from sky | — | 1s fall | 15s | Needs Light designed first |

**Why Blizzard does no damage but Storm does:** Freeze III carries a shatter multiplier, so
Blizzard's output *is* the setup — damage would kill the targets it froze for you to shatter.
Stun grants no multiplier, so Storm needs chip damage or it is lockdown with no reward.

## Light / Shadow / ultimate

| Element | Type | Parents | Dmg | Size | Duration | Reload | Effect |
|---|---|---|---|---|---|---|---|
| **Light** | Light | — (basic) | 0 | on player | 5s | 20s | Heals 25 HP over 5s |
| **Star** | Light | Light (evo) | *2 DPS?* | *3-tile radius?* | 10s | 30s | Orb spawns above the player and **stays put** |
| **Supernova** | Light | Star (evo) | 50 | *6 tiles?* | instant | 60s | In front of the player |
| **Black Hole** | Light | Star (evo) | *1 DPS?* | *4-tile radius?* | 10s | *45s?* | Pulls enemies to centre and traps them |
| **Shadow** | Shadow | — (basic) | 8 | range 8 | — | 20s | Heals 2× damage dealt (16 HP) |
| **Darkness** | Shadow | Shadow (evo) | 1 dmg/s to **every** enemy on screen | screen | 10s | 30s | Screen goes dark (enemies still see you). Player gains a **flat** 1 HP/s. |
| **Poison** | *Water?* | Mud + Shadow | 0 | *4 tiles?* | *10s?* | *12s?* | *Poison II on anything standing in it* |
| **Magic** | — (off-tree) | — | 100 to every enemy on screen | screen | instant | **once per level** | Late-game |
| **Chaos** | — (off-tree) | — | — | screen | instant | **once per level** | Rolls **separately per enemy** — Burn / Poison / Freeze / Stun at Lv. V |

**Light and Shadow are deliberate opposites:** Light heals you directly and works when you are
alone; Shadow drains enemies and only works when there are targets. Neither replaces the other.
Player max HP is **100** (`game.js:1061`), which anchors every healing number here.

**Darkness:** each enemy loses 1 HP/s, but the player's gain is **flat** 1 HP/s regardless of
enemy count — otherwise 25 enemies would heal 250 HP, 2.5× the player's maximum. Note that
10 damage kills every normal zombie outright (they have exactly 10 HP), so it is a wave-wipe.

**Chaos** rolls **independently for each enemy**, so variance averages out across a crowd rather
than being one all-or-nothing gamble. The pool is restricted to the four effects that have
badges in `EFFECT_ICON_FRAME` (burning, poisoned, frozen, stunned) — knockback is excluded, so
every outcome is legible on screen at a glance.

**Black Hole's pull** ignores knockback *resistance* (it is positional, like the block shove),
but the **Emperor is immune** — otherwise a boss can be dragged out of his arena.

**Poison's pool re-applies constantly**, so it maxes all 3 stacks immediately — that is why
tier II rather than III.

## Placements

| Element | Type | Parents | HP | Cooldown | Lifetime | Max alive | Special |
|---|---|---|---|---|---|---|---|
| **Stone** | Stone | — | 20 | 10s | 40s | 4 | — |
| **Sand** | Stone | Stone + Destruction | 1 | 2s | 3s | 1–2 | One absorbed swing |
| **Iron** | Stone | Stone (evo) | 50 | 20s | 60s | 3 | Ground only |
| **Coral** | Stone | Stone + Water | 20 | 15s | 30s | 2 | *1 dmg / 0.5s to anything touching, incl. player. **No knockback.*** |
| **Clay** | Stone | Fire + Mud | 1 → 30 (+1 / 0.5s) | 10s | 30s | 3 | Reaches 30 HP at 14.5s — full strength for its last 15.5s |
| **Crystal** | Stone | Stone + Ice | 20 | 20s | 40s | 2 | Freeze II **per attack** (not on a timer) — sets up the shatter multiplier. ~13.5s life vs a zombie. |
| **Glass** | Stone | Fire + Sand | 15 | 10s | 30s | 3 | *Projectiles pass through both ways; bodies do not* |

**Placement rules agreed:** cannot place while standing on a block (anti-ladder);
placing shoves overlapping enemies clear (positional correction, ignores knockback
resistance, never moves the player); if the space can't be cleared, placement fails
without consuming the cooldown.

---

## Status effect rules

All statuses **refresh** on re-application, but a **lower tier can never overwrite a higher
one**, and a lower tier does **nothing at all** — it cannot even refresh the duration.
(Otherwise a cheap fast element sustains an expensive slow one's effect indefinitely.)

| | I | II | III |
|---|---|---|---|
| **Freeze** (duration) | 1s | 2s | 3s |
| **Freeze** (shatter ×) | 1.2× | 1.4× | 1.6× |
| **Stun** (duration) | 0.5s | 1s | 1.5s |
| **Knockback** (value) | *pending* | *pending* | *pending* |

Tiers IV and V exist for all effects but are **reserved for late-game equipment** — no element
uses them.

| | I | II | III | IV | V |
|---|---|---|---|---|---|
| **Burn** | 1 DPS, 3s | 1 DPS, 5s | 2 DPS, 5s | 2 DPS, 8s | 3 DPS, 10s |
| **Poison** (per stack) | 1 per 3s, 10s | 1 per 2.5s, 12s | 1 per 2s, 15s | 1 per 1.5s, 20s | 1 per 1s, 25s |
| **Freeze** | 1s, 1.2× | 2s, 1.4× | 3s, 1.6× | 4s, 1.8× | 5s, 2.0× |
| **Stun** | 0.5s | 1s | 1.5s | 2s | 2.5s |

**Poison stacks (cap 3); burn refreshes.** At 3 stacks poison matches burn's DPS but delivers
~2.5× the total damage over ~2.5× the duration. Poison also **blocks healing**, and that part
is binary — one stack of Poison I shuts off the Emperor's lifesteal as completely as three
stacks of Poison V, so low-tier poison never becomes dead weight.

*Open:* stacks should share one refreshed timer rather than each tracking its own expiry.

> Burn I is the only tier in code: `{ ticks: 3, dmgPerTick: 1, tickMs: 1000 }`.
> Knockback still needs renumbering — Water is 260 and Air is 320 but both are labelled I.
> **Burn's duration does nothing on an element whose reload is shorter than it** — Heat
> re-applies Burn III every 1.5s against a 5s duration, so only the DPS half matters there.

**Freeze** anchors the target and makes it knockback-immune; the breaking hit gets the
multiplier. **Stun** suspends the target in place without interrupting — it resumes exactly
where it left off.

**Freeze blocks *new* knockback but does not cancel momentum already applied by the same hit.**
So a single element may shove and then freeze (Snow does exactly this — the snowball knocks
them back, the shove plays out over ~300ms, and the frost anchors them where they land).
What it rules out is knocking back a target that is *already* frozen.

---

## Reserved verbs (so branches don't collide)

| Verb | Owner |
|---|---|
| Un-aggro / break pursuit | Cloud |
| Amplify burn | Ash |
| Amplify stun | Mist |
| Slowing ground pool | Mud |
| DoT pool, blocks healing | Poison |
| Solid placeable block | Stone branch |
| Freeze + shatter multiplier | Ice branch |
| Suspend-and-resume | Electric branch |

*Fog was cut — same substance as Cloud and Mist, with no verb that followed from what fog is.*
*Wave was cut — Water already owns knockback, so it was a strict upgrade over its own parent.*

---

## Balance notes worth keeping

- **Destruction is held in check by having lower single-target DPS than Earth** (1.33 vs 1.6).
  If its reload ever drops, that is what breaks.
- **Snow's reload is 6s specifically so Ice stays relevant** — at 3s, Snow had higher freeze
  uptime (67% vs 60%) from three times the range, obsoleting a base element with its own child.
- **Blocks are balanced on HP generated per second, not HP.** Stone is 20 HP / 10s = 2.0 HP/s;
  Iron at 30 HP / 20s would be 1.5, so two Stones beat one Iron for the same time spent *and*
  can be placed in the air. Iron needs ~50 HP to justify its restriction. Reference DPS against
  a block: zombie 3.65, butler 5.99, guard 0 (ranged, never touches it).
- **Contact-damage blocks must not knock back**, or enemies bounce off repeatedly and the block
  takes no damage in return. Coral deals damage and takes hits back — an honest trade.
- **An amplifier's effect must be shorter than its reload.** Above 100% uptime it stops being
  an element and becomes a passive buff — the decision of *when* to spend the slot disappears.
  Applies to Ash and Mist; does **not** apply to Mud, which attaches to a location rather than
  a target and is therefore limited spatially instead of temporally.
- **Effect tiers IV and V are reserved for late-game equipment**, not elements. Elements own
  I–III. This keeps the tree's ceiling below the game's ceiling, so finishing the tree is not
  the end of progression. The hook already exists: `mods: { elementDamage, elementEffect }`
  on skins, applied at `game.js:3973`.
- **Two amplification languages — keep them separate.** A *tier* describes what an effect is
  (set by its source: element or equipment). A *multiplier* applies on top (Ash, Mist, skins).
  Resolve the tier first, then multiply. Amplifiers should stack **additively** (×2 and ×2
  becomes ×3, not ×4) — multiplicative stacking already reaches ×4 burn with just the gold
  skin and Ash, which is 12 DPS on Burn V.
- **Freeze is worth more the closer the target is.** Freezing at 10 tiles delays an approach
  that would have taken 4.5s anyway; freezing at 96px stops a swing that was about to land.
  That is what lets Ice's 3-tile range be a cost rather than a death sentence.

---

## Open questions

All 38 elements are specified. What remains:

1. **Knockback tier values** — the only effect table still unset. Water is 260 and Air is 320
   in code but both are labelled I; Tornado needs a value too.
2. Remaining italic cells are Claude's proposals awaiting a ruling — mostly radii, reloads and
   damage values rather than anything that changes how an element plays.
3. EX level's Golden Door logic needs edits before Wind's jump boost is final.
   (Level 2 reviewed and fine; future layouts will assume Wind exists.)

## Implementation order (nothing is built yet)

Roughly half the tree resolves to "apply effect X at tier Y", so the effect machinery is the
bottleneck:

1. **Effect tiers** — only Burn I exists in code. Freeze, Stun and Poison have no
   implementation at all, though `EFFECT_ICON_FRAME` and `activeStatuses()` already read the
   flags and the badges already render.
2. **Booster Points** — the currency exists unused in both `status-sheet.js` (`booster: 0`,
   `badge-booster`) and the stat tracker's `app.js` (`boosterPoints`). Nothing spends it yet.
3. **The tree UI** and unlock persistence.
4. **Elements themselves** — `ELEMENT_DEFS` is already a plain data table, so most of these are
   data entries rather than code once the effects exist.

Blocked-on-other-systems: Crystal needs Ice, Mist needs a stun source, Meteor needs Light,
Blizzard needs Snow **and** Storm (six unlocks deep — the deepest node in the tree).
