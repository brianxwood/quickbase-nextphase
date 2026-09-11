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
- **Specialization** — all six, with per-perk tier allocation and point cost tracking.
- **SHD watch** — point allocation across the four categories.
- **Derived output** — sustained/burst DPS, damage per shot, effective RPM, time to kill, armor,
  health, effective HP, skill tier and skill damage, plus the full stat readout.

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

### Assumptions worth knowing

- **Talents count at full stacks.** A stacking talent contributes its ceiling value, so the figures
  rank loadouts well but read optimistically as absolutes.
- **Base health is 100,000**, used as the pool that percentage health bonuses multiply. It is an
  editable constant.
- **Skill damage per tier is 15%**, also editable.
- Conditional talents (positional, on-kill, below-armor-threshold) are applied unconditionally.
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
