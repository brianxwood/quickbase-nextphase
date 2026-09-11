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
    "constants": {"baseCritDamage": 25, "critChanceCap": 60, "baseHealth": 100000,
                  "skillTierMax": 6, "skillDamagePerTier": 15,
                  "pvpMultiplier": 0.5, "falloffWorst": 0.5}
}
js = ("/* The Division 2 reference tables. Generated — see README.md for provenance and licences.\n"
      "   Every number here can be overridden in the app's Tables view without touching this file. */\n"
      "window.TD2_DATA = " + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ";\n")
p = pathlib.Path(__file__).resolve().parent.parent / 'data.js'
p.write_text(js)
print('wrote', p.stat().st_size // 1024, 'KB; sig perks remapped:', fixed)
