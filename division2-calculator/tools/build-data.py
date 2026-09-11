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

# Attachment "reloadSpeed" is a delta in SECONDS, not a percentage: a Handstop reads -0.2 (faster)
# and an Extended mag +0.3 (slower), and the signs pair correctly with the magazine-size changes
# beside them. Weapon and gear attributes use the same key for a percentage, so rename it here
# rather than let one word mean two units. "magazineSize" is a percentage, so say so.
for kind, mods in db["attachments"].items():
    for mod in mods:
        m = mod.get("modifiers") or {}
        if "reloadSpeed" in m:
            m["reloadSeconds"] = m.pop("reloadSpeed")
        if "magazineSize" in m:
            m["magazineSizePct"] = m.pop("magazineSize")

# An exotic's built-in mods use the same magazine key for a percentage. Its reload figure really
# is a percentage here (10, 20) rather than the seconds the attachment table uses, so leave it.
for weapon in db["weapons"]:
    for slot, mods in (weapon.get("exoticMods") or {}).items():
        if "magazineSize" in mods:
            mods["magazineSizePct"] = mods.pop("magazineSize")

# A weapon's core attribute is its own weapon-type damage, fixed by the weapon — an AR reads
# "Assault Rifle Damage +15%". The source instead modelled Damage to Armor / Damage to Health /
# Critical Hit Chance as selectable cores; the weapons that do carry weaponCoreAttrs disagree,
# both leading with their type damage at 15. Those three are real rolls at those caps though, so
# they move into the attribute pool rather than being dropped, keeping the larger cap on a clash.
by_stat = {a["statType"]: a for a in db["weaponAttributes"]}
for core in db["weaponCoreAttributes"]:
    existing = by_stat.get(core["statType"])
    if existing is None:
        db["weaponAttributes"].append({k: v for k, v in core.items() if k != "id"} | {"id": core["id"]})
    elif core["maxValue"] > existing["maxValue"]:
        existing["maxValue"] = core["maxValue"]

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
    "shd": {
        "maxPerStat": 50,
        "bonusPerPoint": {"weaponDamage": 0.2, "headshotDamage": 0.4, "critDamage": 0.4,
                          "critChance": 0.2, "armor": 0.2, "health": 0.2, "explosiveRes": 0.2,
                          "hazardProtection": 0.2, "skillDamage": 0.2, "skillHaste": 0.2,
                          "skillDuration": 0.4, "skillRepair": 0.2, "accuracy": 0.2,
                          "stability": 0.2, "reloadSpeed": 0.2, "magazineSizePct": 0.4},
        "categories": {
            "Offense": ["weaponDamage", "headshotDamage", "critDamage", "critChance"],
            "Defense": ["armor", "health", "explosiveRes", "hazardProtection"],
            "Utility": ["skillDamage", "skillHaste", "skillDuration", "skillRepair"],
            "Handling": ["accuracy", "stability", "reloadSpeed", "magazineSizePct"]}
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
print('conditional/always-on — gear %s, weapon %s' % (tuple(conditional_counts['gearTalents']), tuple(conditional_counts['weaponTalents'])))
