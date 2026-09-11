# SHD Loadout Bench

A standalone Division 2 build calculator: six gear slots and three weapons per loadout, with a
side-by-side comparison matrix so you can see which loadout to actually run.

Open `index.html` in a browser. No build step, no server, no dependencies — the three files are the
whole app.

| File | What it is |
| --- | --- |
| `index.html` | Page shell and all styling |
| `app.js` | Build model, damage/survivability engine, UI |
| `data.js` | Generated reference tables (weapons, gear, talents, brands, sets, mods, specs) |

## What it models

- **Gear** — 6 slots: item (brand piece, gear set piece, named or exotic), core attribute,
  secondary attributes, mods, chest/backpack talents, expertise. Exotic fixed rolls and locked
  cores are enforced from the item data.
- **Talents follow the item.** A gear set chest or backpack only offers that set's own talents and
  comes with one already selected — you cannot put Obliterate on a Striker's Battlegear chest. Brand
  pieces get the generic pool and never a set talent. An exotic's talent is built in and locked.
- **Slot layout.** Every slot carries one core attribute and two secondary attributes. Mod slots
  come from the item: Mask, Chest and Backpack have one, Gloves, Holster and Kneepads none. Chest
  and Backpack are the talent-bearing slots. The attribute count is an editable table (see below).
- **Three-core backpacks.** Memento, NinjaBike Messenger Backpack, Harrier Pride and the Core
  Strength backpack grant Weapon Damage, Armor *and* Skill Tier instead of a core plus two
  secondary rolls, and the app models them that way rather than offering a core picker.
- **Brand and gear set bonuses** — counted across the six slots, with 1/2/3-piece brand tiers and
  2/3/4-piece set tiers lighting up as pieces are added.
- **Weapons** — 3 slots: weapon, core attribute, two attributes, talent, attachments, expertise.
  The sidearm slot accepts pistols plus the shotguns the data marks sidearm-only (the Backup
  Boomstick); the two long-gun slots accept everything else. A saved loadout holding a weapon its
  slot no longer accepts is cleared on load.
- **Specialization** — all six, with per-perk tier allocation, point cost tracking and a cap on how
  many weapon archetypes can be boosted at once (three by default, editable).
- **SHD watch** — point allocation across the four categories.
- **Derived output** — a DPS *range* rather than one number (see below), damage per shot, burst
  DPS, effective RPM, time to kill, armor, health, effective HP, skill tier and skill damage, plus
  the full stat readout.

## The damage model

Per-shot damage is a product of separate buckets, following the community-verified formula:

```
base
  × (1 + headshotRate·(weaponHS + gearHS) + critChance·critDamage)   headshot + crit share one bucket
  × (1 + weaponDamage + weaponTypeDamage)                            additive weapon damage pool
  × (1 + totalWeaponDamage)                                          "total weapon damage" talents
  × (1 + damageToArmor | damageToHealth)                             target condition
  × (1 + damageToOutOfCover)                                         stacks with the above
```

Base character critical hit damage (25%) is always in the crit term and critical hit chance is
clamped to 60%. Sustained DPS folds in magazine size and reload time; burst DPS does not.

Rather than an all-or-nothing headshot toggle, the scenario bar takes a **headshot rate**, so the
crit and headshot buckets are weighted by how often you actually land them. That is what makes two
loadouts comparable on one number.

### Ramping talents, and the DPS range

Most of what makes a Division 2 build strong only pays out once it is running: Obliterate wants
20 critical hits, Striker's Gamble wants 100 stacks, Vigilance drops the moment you are hit. A
single DPS number cannot describe that, so the app reports a band:

| Figure | What it is |
| --- | --- |
| **Resting** | the sheet with nothing procced — no stacks, no triggers |
| **Expected** | resting and peak interpolated by the buff-uptime slider (60% by default) |
| **Peak** | every stacking talent at max stacks |

The interpolation is on the DPS, not on the stats. At any instant a talent is either active or not,
and damage averaged over a fight is the time-weighted average of those two states, so blending the
two DPS figures is correct where blending the underlying percentages would not be.

The **ramp multiplier** in the comparison matrix is peak ÷ resting. A build at 1.1× plays the same
whether or not it is rolling; one at 2.5× is a different weapon before and after it spins up, which
is worth knowing before you take it into a fight you cannot control.

Each talent is classified from its own description: anything with a trigger or a stack count
(*while*, *after*, *killing*, *headshots*, *stacks*, *taking damage*, …) counts as conditional;
flat talents such as "Increase reload speed by 30%" are always on and sit in the resting figure
too. The classification is a text heuristic over the source descriptions, not a curated list.

### Hand-modelled talents

A few talents read the rest of your build, so no stored modifier can describe them. Those carry a
written formula instead, and the slot card shows what it produces for the build you have.

**Memento** (`gt_memento_kill`) is the first. Its short-term buff pays per equipped core, and its
long-term buff stacks per trophy:

```
weapon damage      = redCores   x 5%  + stacks x 1%
bonus armor        = blueCores  x 10%
skill efficiency   = yellowCores x 5% + stacks x 1%
armor regen (%/s)  =                    stacks x 0.1%
```

Cores are counted across the six gear slots, and a three-core piece counts as one of each — which
is why Memento feeds itself one red, one blue and one yellow. On a five-weapon-damage-core build
that is 6 red / 1 blue / 1 yellow, giving +60% weapon damage, +10% bonus armor, +35% skill
efficiency and +3%/s armor regeneration at 30 trophies. Every number in that formula is editable
under Tables.

The whole talent is conditional, so it sits entirely in the gap between resting and peak.

Percentage-based armour regeneration is a real stat now, applied against the armour pool after the
pool is worked out, rather than being confused with the flat per-second attribute.

### Assumptions worth knowing
- **Base health is 100,000**, used as the pool that percentage health bonuses multiply. It is an
  editable constant.
- **Skill damage per tier is 15%**, also editable.
- **Most gear sets' 4-piece talents are not modelled.** The source stores every set's headline
  talent as a zero-valued placeholder, so Heartstopper, Apex Predator, Crowd Control and the rest
  contribute nothing to the numbers. Striker's Gamble is the exception: the set's own talent text
  quotes it (0.65% weapon damage per stack, 100 stacks), so it ships at +65%. A 4-piece set whose
  talent is still unmodelled is flagged in the brand and set bonus panel, and the value is editable
  in Tables like any other — set it and it feeds the peak figure immediately.
- **The stat readout shows the resting sheet**, with anything a talent adds once it has procced
  riding alongside as a green "+n" rather than folded into the total.
- **Talent armour is flat, not proportional.** Talent modifiers encode armour the way a gear core
  does — Cold grants 5,000, Hardened 10,000 — so it is added to the pool rather than multiplying it.
  Every other talent modifier is a percentage.
- **Specialization budgets are derived, not quoted.** The source stores a flat 165-point budget for
  all six specializations while their own perk costs total anywhere from 150 to 180, so "spent /
  165" never reconciles. The budget shown is computed from the perks themselves: every unique perk
  maxed plus as many weapon archetypes as the limit allows.
- Signature weapon damage is tracked separately so specialization signature perks do not inflate
  normal weapon DPS.

## Every number is editable

The **Tables** view exposes the underlying data — brand bonuses, gear set bonuses, attribute and mod
caps, attribute lines per gear slot, SHD per-point values and the game constants. Edit any of them and every loadout recalculates.
Edits are saved alongside your loadouts and marked against their shipped default, and "Reset all"
puts everything back. This matters because the tables were read off community sources rather than
game files, so a tuning pass can leave a value stale.

## Storage

Loadouts save to your account when the page runs as a published artifact, and fall back to browser
local storage otherwise. "Export JSON" writes the full state (loadouts, scenario and table edits);
"Import" takes it back.

## Data provenance and licences

The reference tables in `data.js` are compiled from two MIT-licensed community projects:

- [ImThatTeriyaki/Tom-Clancy-The-Division-2-Gear-calculator](https://github.com/ImThatTeriyaki/Tom-Clancy-The-Division-2-Gear-calculator)
  — weapons, gear items, talents with quantified modifiers, brands, gear sets, mods, attribute caps
  and specialization perk trees. MIT License, Copyright (c) 2026 ImThatTeriyaki - Sleepy Inc Clan.
- [siriusarc7/TD2_GARL](https://github.com/siriusarc7/TD2_GARL) — used to cross-check brand and gear
  set attribute values.

`data.js` is regenerated by `tools/build-data.py` rather than hand-edited. Three corrections are
applied to the source data:

1. Mojibake in accented names and dashes was repaired.
2. Each specialization's "Signature Weapon Damage" perk was re-pointed from the generic
   `weaponDamage` stat to `signatureWeaponDamage`, so it no longer inflates normal weapon DPS.
3. Striker's Battlegear carried both of its talents on the backpack slot, leaving its chest with
   none. Risk Management is re-slotted to Chest, corroborated by
   [faildruid/division-2-db](https://github.com/faildruid/division-2-db), which lists it as a chest
   talent.
4. Only Memento and NinjaBike Messenger Backpack were flagged as three-core pieces. Harrier Pride
   and the Core Strength backpack are flagged too, and all four are given zero secondary attribute
   lines. The Core Strength backpack's talent flag is cleared — the set has no backpack talent, so
   without this it would inherit the chest's through the set's shared pool.

The per-slot attribute count is taken as two everywhere. The fixed rolls on exotics are the evidence:
Coyote's Mask is 6% critical hit chance plus 12% critical hit damage, and the Waveform holster and
Acosta's Kneepads carry the same pair, so those slots hold two attribute lines rather than one. If
your reading of a slot differs, change it in the Tables view — nothing is hard-coded.

**Known limitation in the upstream talent data:** the `gearSet` field on each set talent is
reliable, but the chest-vs-backpack `slot` label is not always. Core Strength has no backpack talent
and Ongoing Directive no chest talent in the source, and a few sets (Measured Assembly,
Negotiator's Dilemma, Tip of the Spear) appear to carry talents that belong to one of the others.
Because of this the app offers a set's full talent pool on both its chest and backpack and defaults
to the slot-matched one, so a mislabelled entry is something you can correct in place rather than a
talent you cannot reach.

This is an unofficial fan tool. Not affiliated with, endorsed by, or sponsored by Ubisoft.
