"""Regenerate ../data.js from the upstream community tables.

Inputs (set SRC to a directory holding these):
  db.json     - the `DB` object literal extracted from ImThatTeriyaki's
                division2-gear-calculator-v2.html (weapons, gear, talents, brands,
                sets, mods, attribute definitions, farming info)
  specs.json  - the `SPECIALIZATIONS_DB` object literal from the same file

Both are plain data, so they can be lifted out with a brace-matching scan of the
HTML and parsed as JSON after quoting bare keys and dropping trailing commas.

Usage:  python3 build-data.py [SRC_DIR]
"""
import json, re, sys, pathlib

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
SP = SRC
raw = pathlib.Path(SP + '/db.json').read_text()
for a, b in [('Cesk? V?roba', 'Česká Výroba'), ('Cu?lebre', 'Cuélebre'), (' ? ', ' — ')]:
    raw = raw.replace(a, b)
raw = re.sub(r'(\d)%\?(\d)', lambda m: m.group(1) + '%–' + m.group(2), raw)
assert '?' not in raw, re.findall(r'.{8}\?.{8}', raw)[:5]
db = json.loads(raw)
specs = json.loads(pathlib.Path(SP + '/specs.json').read_text())

# The source models every spec's "Signature Weapon Damage" perk as generic weaponDamage,
# which would wrongly inflate sidearm/primary DPS. Signature damage is its own bucket.
fixed = 0
for spec in specs.values():
    for perk in spec['perks']:
        if perk['id'].endswith('_sig_dmg'):
            perk['statType'] = 'signatureWeaponDamage'
            fixed += 1
assert fixed == 6, fixed

# Striker's Battlegear carries both of its talents on "Backpack" upstream, leaving its chest
# piece with none. Risk Management is the chest talent (corroborated by faildruid/division-2-db,
# which lists it under Chest Talent), so re-slot it.
restruck = 0
for t in db['gearTalents']:
    if t['id'] == 'gt_set_striker_bp_risk':
        assert t['slot'] == 'Backpack' and t['gearSet'] == "Striker's Battlegear", t
        t['slot'] = 'Chest'
        restruck += 1
assert restruck == 1, restruck

# Four backpacks carry all three core attributes instead of a core plus two secondary rolls.
# Upstream flags only Memento and NinjaBike; Harrier Pride and the Core Strength backpack are
# the other two. Core Strength having no backpack talent in the source corroborates it — the
# third core takes that slot.
allcore = 0
for x in db['gearItems']:
    if x['id'] in ('gi_bp_harrier', 'gi_bp_corestrength'):
        x['allCores'] = True
        allcore += 1
    if x.get('allCores'):
        # a three-core piece has no secondary attribute lines
        x['maxAttributes'] = 0
assert allcore == 2, allcore
assert sum(1 for x in db['gearItems'] if x.get('allCores')) == 4

# Core Strength's backpack has no set talent of its own; without this it would inherit the
# chest talent through the set's shared pool.
for x in db['gearItems']:
    if x['id'] == 'gi_bp_corestrength':
        x['hasTalent'] = False

# A talent that only pays out on a trigger or a stack count is not part of the resting sheet.
# Flag them so the app can report a floor (nothing proc'd) as well as a ceiling (all maxed).
# Trigger verbs only — "Increase reload speed by 30%" is always on, "Reloading grants..." is not.
TRIGGER = re.compile(
    r"\bstack|\bwhen\b|\bwhile\b|\bafter\b|\bif\b|\bkill|headshot|critical hit|suppress"
    r"|taking damage|hitting|damaging|applying|swapping|reloading|entering|cover to cover"
    r"|\bbelow\b", re.I)

# Attachment values read off the game's own mod screens. These replace the source's numbers,
# which were both incomplete (only offensive stats recorded) and wrong in places. Two units are
# settled by the screens: "Rounds" is a flat count, and Reload Speed is a percentage.
#
# Scopes and underbarrels are shared across weapons, so those are complete. Muzzles and magazines
# are per calibre and only 5.56 was captured; the other calibres keep the source's values.
VERIFIED_ATTACHMENTS = {
    # --- optics (Long Optics Rail, shared by every weapon) ---
    "att_scope_acog":         {"optimalRange": 50},
    "att_scope_c79":          {"critChance": 5},
    "att_scope_cqbss":        {"headshotDamage": 30},
    "att_scope_vx1":          {"headshotDamage": 35, "reloadSpeed": -10},
    "att_scope_552holo":      {"accuracy": 30},
    "att_scope_exps3":        {"headshotDamage": 10},
    "att_scope_red_dot":      {"stability": 30},
    "att_scope_small_rds":    {"accuracy": -20, "stability": 50},
    "att_scope_russian_rds":  {"critDamage": 10},
    "att_scope_reflex":       {"weaponHandling": 12},
    "att_scope_t2micro":      {"accuracy": 30},
    "att_scope_digital":      {"headshotDamage": 45, "critDamage": -5},
    # --- underbarrel (Long Underbarrel Rail, shared) ---
    "att_ub_laser":           {"critChance": 5},
    "att_ub_angled":          {"stability": 30},
    "att_ub_handstop":        {"reloadSpeed": 14},
    "att_ub_short_grip":      {"critDamage": 10},
    "att_ub_tac_short_grip":  {"critDamage": 15},
    "att_ub_vertical":        {"accuracy": 30},
    "att_ub_linked_laser":    {},   # pulses the target; no stat line on the card
    # --- 5.56 muzzles ---
    "att_muzzle_brake556":    {"critChance": 5},
    "att_muzzle_comp556":     {"stability": 30},
    "att_muzzle_flash556":    {"critDamage": 10},
    "att_muzzle_vent556":     {"optimalRange": 50},
    "att_muzzle_omega556":    {"stability": 40, "optimalRange": -10},
    # --- 5.56 magazines ---
    "att_mag_sturdy556":      {"magazineRounds": 20, "reloadSpeed": -10},
    "att_mag_bal556":         {"stability": 30},
    "att_mag_light556":       {"magazineRounds": 15},
    "att_mag_tac556":         {"critDamage": 10},
}

# Sturdy Extended 5.56 Mag is tagged for marksman rifles while its four 5.56 siblings are all
# assault rifle. 5.56 is the AR calibre and the game shows it in the AR's 5.56 magazine slot.
for mod in db["attachments"]["Magazine"]:
    if mod["id"] == "att_mag_sturdy556":
        assert mod["weaponTypes"] == ["MMR"], mod["weaponTypes"]
        mod["weaponTypes"] = ["AR"]

verified = 0
for kind, mods in db["attachments"].items():
    for mod in mods:
        if mod["id"] in VERIFIED_ATTACHMENTS:
            mod["modifiers"] = dict(VERIFIED_ATTACHMENTS[mod["id"]])
            mod["verified"] = True
            verified += 1
            continue
        # everything else keeps the source's numbers; its magazine figure is a round count
        m = mod.get("modifiers") or {}
        if "magazineSize" in m:
            m["magazineRounds"] = m.pop("magazineSize")
assert verified == len(VERIFIED_ATTACHMENTS), (verified, len(VERIFIED_ATTACHMENTS))

# An exotic's built-in magazine figure is a flat round count too, not a percentage: St Elmo's
# Engine is a 40-round base plus its built-in 30, and the game shows 70.
for weapon in db["weapons"]:
    for slot, mods in (weapon.get("exoticMods") or {}).items():
        if "magazineSize" in mods:
            mods["magazineRounds"] = mods.pop("magazineSize")

conditional_counts = {"gearTalents": [0, 0], "weaponTalents": [0, 0]}
for key in ("gearTalents", "weaponTalents"):
    for t in db[key]:
        cond = bool(TRIGGER.search(t.get("description") or ""))
        t["conditional"] = cond
        conditional_counts[key][0 if cond else 1] += 1

# Every gear set's 4-piece talent is stored as a zero-valued placeholder, so the headline set
# bonus contributes nothing. The two hand-modelled below own their own maths (see
# dynamicSetTalents); the rest stay at zero and are flagged in the app until someone fills them in.

out = {
    "dataVersion": "Sept 2026 tables",
    "weapons": db["weapons"],
    "attachments": db["attachments"],
    "weaponTalents": db["weaponTalents"],
    "gearItems": db["gearItems"],
    "gearTalents": db["gearTalents"],
    "brands": db["brands"],
    "gearSets": db["gearSets"],
    "mods": db["mods"],
    "gearCoreAttributes": db["gearCoreAttributes"],
    "gearAttributes": db["gearAttributes"],
    "prototypeGearAttributes": db["prototypeGearAttributes"],
    "weaponAttributes": db["weaponAttributes"],
    "weaponCoreAttributes": db["weaponCoreAttributes"],
    "farmingInfo": db["farmingInfo"],
    "specializations": specs,
    "slotBaseArmor": {"Mask": 80000, "Gloves": 80000, "Holster": 112000,
                      "Kneepads": 99000, "Backpack": 131000, "Chest": 158000},
    # Secondary attribute lines per slot, on top of the core. Every slot carries two: the fixed
    # rolls on exotics confirm it (Coyote's Mask 6% CHC + 12% CHD, Waveform holster and Acosta's
    # Kneepads the same). Mod slots are per item and come from the item data, not from here.
    "slotAttributeSlots": {"Mask": 2, "Chest": 2, "Backpack": 2,
                           "Gloves": 2, "Holster": 2, "Kneepads": 2},
    # A gear set piece trades a supporting attribute for the set bonus. Community sources say a
    # gear set piece carries one supporting attribute in every slot; the chest and backpack are
    # left at two here because they also carry a talent and are reported that way in play. Both
    # tables are editable in the app, so this is a starting point rather than a ruling.
    "gearSetAttributeSlots": {"Mask": 1, "Chest": 2, "Backpack": 2,
                              "Gloves": 1, "Holster": 1, "Kneepads": 1},
    "shd": {
        "maxPerStat": 50,
        "bonusPerPoint": {"weaponDamage": 0.2, "headshotDamage": 0.4, "critDamage": 0.4,
                          "critChance": 0.2, "armor": 0.2, "health": 0.2, "explosiveRes": 0.2,
                          "hazardProtection": 0.2, "skillDamage": 0.2, "skillHaste": 0.2,
                          "skillDuration": 0.4, "skillRepair": 0.2, "accuracy": 0.2,
                          "stability": 0.2, "reloadSpeed": 0.2, "ammoCapacity": 0.4},
        "categories": {
            "Offense": ["weaponDamage", "headshotDamage", "critDamage", "critChance"],
            "Defense": ["armor", "health", "explosiveRes", "hazardProtection"],
            "Utility": ["skillDamage", "skillHaste", "skillDuration", "skillRepair"],
            "Handling": ["accuracy", "stability", "reloadSpeed", "ammoCapacity"]}
    },
    # A gear set's 4-piece talent, where its chest and backpack talents change the maths rather
    # than adding a flat bonus of their own. Each entry names the amplifier talents so the app can
    # tell whether they are equipped — and so it knows to ignore their placeholder modifiers.
    "dynamicSetTalents": {
        "Striker's Battlegear": {
            "talent": "Striker's Gamble",
            "note": "stacks on weapon hits; missing drops them",
            "amplifiers": {"chest": "gt_set_striker_bp_risk", "backpack": "gt_set_striker_bp"},
            "params": {
                "maxStacks": 100,
                "perStackWeaponDamage": 0.65,
                "chestPerStackWeaponDamage": 0.9,
                "backpackMaxStacks": 200
            }
        },
        "Heartbreaker": {
            "talent": "Heartstopper",
            "note": "headshots pulse; the weapon damage applies to pulsed targets only",
            "amplifiers": {"chest": "gt_set_heartbreaker_chest", "backpack": "gt_set_heartbreaker_bp"},
            "params": {
                "maxStacks": 50,
                "perStackWeaponDamage": 1.1,
                "perStackBonusArmor": 1,
                "chestMaxStacks": 100,
                "backpackPerStackBonusArmor": 2
            }
        }
    },
    # Talents whose effect depends on the rest of the build cannot be a flat modifier bag, so the
    # app carries hand-written formulas for them and reads the numbers from here.
    "dynamicTalents": {
        "gt_memento_kill": {
            "name": "Kill Confirmed",
            "item": "Memento",
            "params": {
                # short-term buff (10s), one step per equipped core of that colour
                "redWeaponDamage": 5,
                "blueBonusArmor": 10,
                "yellowSkillEfficiency": 5,
                # long-term buff (300s), per trophy collected
                "maxStacks": 30,
                "stackWeaponDamage": 1,
                "stackSkillEfficiency": 1,
                "stackArmorRegenPct": 0.1
            }
        }
    },
    "constants": {"weaponTypeCoreDamage": 15, "baseCritDamage": 25, "critChanceCap": 60, "baseHealth": 100000,
                  "skillTierMax": 6, "skillDamagePerTier": 15,
                  "pvpMultiplier": 0.5, "falloffWorst": 0.5,
                  # How many weapon-type perks a specialization may run at once. The source has
                  # seven per spec with no cap; set to 0 to remove the limit.
                  "specWeaponArchetypes": 3}
}
js = ("/* The Division 2 reference tables. Generated — see README.md for provenance and licences.\n"
      "   Every number here can be overridden in the app's Tables view without touching this file. */\n"
      "window.TD2_DATA = " + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ";\n")
p = pathlib.Path(__file__).resolve().parent.parent / 'data.js'
p.write_text(js)
print('wrote', p.stat().st_size // 1024, 'KB; sig perks remapped:', fixed)
print('verified attachments: %d' % verified)
print('conditional/always-on — gear %s, weapon %s' % (tuple(conditional_counts['gearTalents']), tuple(conditional_counts['weaponTalents'])))
