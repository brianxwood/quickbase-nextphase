/* SHD Loadout Bench — build editor, damage/survivability engine, loadout comparison.
   Reference tables live in data.js; every number there can be overridden in the Tables view. */
'use strict';
(function () {

const D = window.TD2_DATA;
const SLOTS = ['Mask', 'Chest', 'Backpack', 'Gloves', 'Holster', 'Kneepads'];
const WEAPON_SLOT_NAMES = ['Primary', 'Secondary', 'Sidearm'];
const TYPE_DAMAGE_STAT = {
  AR: 'arDamage', SMG: 'smgDamage', LMG: 'lmgDamage', Rifle: 'rifleDamage',
  MMR: 'mmrDamage', Shotgun: 'shotgunDamage', Pistol: 'pistolDamage'
};
const TYPE_LABEL = {
  AR: 'Assault Rifle', SMG: 'SMG', LMG: 'LMG', Rifle: 'Rifle',
  MMR: 'Marksman Rifle', Shotgun: 'Shotgun', Pistol: 'Pistol'
};
const ATTACHMENT_KINDS = ['Scope', 'Muzzle', 'Underbarrel', 'Magazine'];
const MAX_EXPERTISE = 21;

/* Stats that are absolute amounts rather than percentages. */
const FLAT_STATS = new Set(['armorFlat', 'healthFlat', 'armorRegen']);

/* What an attachment can give. The source only ever recorded the offensive half, so the handling
   stats most mods actually grant are absent — they are listed here so they can be filled in. */
const ATTACHMENT_STATS = [
  'critChance', 'critDamage', 'headshotDamage', 'weaponDamage',
  'accuracy', 'stability', 'weaponHandling', 'optimalRange',
  'rateOfFire', 'magazineSizePct', 'reloadSeconds'
];

/* Brand, gear-set and specialization bonuses express armor and health as percentages of the
   pool, while a gear roll adds a flat amount. Same stat name, different bucket. */
const PCT_SOURCE_REMAP = { health: 'healthPct', totalArmor: 'armorPct', armor: 'armorPct' };
const FLAT_SOURCE_REMAP = { health: 'healthFlat', armor: 'armorFlat' };

const STAT_LABEL = {
  weaponDamage: 'Weapon damage', totalWeaponDamage: 'Total weapon damage',
  critChance: 'Critical hit chance', critDamage: 'Critical hit damage',
  headshotDamage: 'Headshot damage', weaponHandling: 'Weapon handling',
  damageToArmor: 'Damage to armor', damageToHealth: 'Damage to health',
  damageToOutOfCover: 'Damage out of cover', damageToElites: 'Protection from elites',
  signatureWeaponDamage: 'Signature weapon damage', explosiveDamage: 'Explosive damage',
  arDamage: 'Assault rifle damage', smgDamage: 'SMG damage', lmgDamage: 'LMG damage',
  rifleDamage: 'Rifle damage', mmrDamage: 'Marksman rifle damage',
  shotgunDamage: 'Shotgun damage', pistolDamage: 'Pistol damage',
  armorFlat: 'Armor (flat)', armorPct: 'Total armor', healthFlat: 'Health (flat)',
  healthPct: 'Total health', bonusArmorPct: 'Bonus armor', armorRegen: 'Armor regeneration',
  armorRegenPct: 'Armor regeneration (% of pool)', armorOnKill: 'Armor on kill',
  incomingRepairs: 'Incoming repairs', hazardProtection: 'Hazard protection',
  explosiveRes: 'Explosive resistance', pulseResistance: 'Pulse resistance',
  bleedRes: 'Bleed resistance', burnRes: 'Burn resistance', blindDeafRes: 'Blind/deaf resistance',
  disorientRes: 'Disorient resistance', disruptRes: 'Disrupt resistance',
  ensnareRes: 'Ensnare resistance', poisonRes: 'Poison resistance', shockRes: 'Shock resistance',
  skillTier: 'Skill tier', skillDamage: 'Skill damage', skillHaste: 'Skill haste',
  skillRepair: 'Skill repair', skillDuration: 'Skill duration', statusEffects: 'Status effects',
  skillEfficiency: 'Skill efficiency', skillHealth: 'Skill health', shieldHealth: 'Shield health',
  burnDamage: 'Burn damage', burnDuration: 'Burn duration', bleedDamage: 'Bleed damage',
  reloadSeconds: 'Reload time', meleeDamage: 'Melee damage',
  stability: 'Stability', accuracy: 'Accuracy',
  optimalRange: 'Optimal range',
  reloadSpeed: 'Reload speed', rateOfFire: 'Rate of fire', magazineSizePct: 'Magazine size',
  magazineSize: 'Magazine size', swapSpeed: 'Swap speed', ammoCapacity: 'Ammo capacity',
  increasedThreat: 'Increased threat', reducedThreat: 'Reduced threat'
};

/* ------------------------------------------------------------------ indexes */

const byId = (arr) => { const o = {}; for (const x of arr) o[x.id] = x; return o; };
const WEAPONS = byId(D.weapons);
const GEAR = byId(D.gearItems);
const GEAR_TALENTS = byId(D.gearTalents);
const WEAPON_TALENTS = byId(D.weaponTalents);
const GEAR_ATTRS = byId(D.gearAttributes);
const PROTO_ATTRS = byId(D.prototypeGearAttributes);
const MODS = byId(D.mods);
const GEAR_CORES = byId(D.gearCoreAttributes);
const WEAPON_ATTRS = byId(D.weaponAttributes);
const ATTACHMENTS = {};
for (const kind of ATTACHMENT_KINDS) for (const a of (D.attachments[kind] || [])) ATTACHMENTS[a.id] = a;

const GEAR_BY_SLOT = {};
for (const slot of SLOTS) GEAR_BY_SLOT[slot] = D.gearItems.filter((g) => g.slot === slot);
const WEAPONS_BY_TYPE = {};
for (const w of D.weapons) (WEAPONS_BY_TYPE[w.type] = WEAPONS_BY_TYPE[w.type] || []).push(w);

/* The sidearm slot takes pistols, plus the handful of shotguns the data marks sidearm-only
   (the Backup Boomstick). The two long-gun slots take everything else. */
const SIDEARM_SLOT = 2;
const fitsSlot = (w, slotIndex) => (slotIndex === SIDEARM_SLOT
  ? (w.type === 'Pistol' || !!w.sidearmOnly)
  : (w.type !== 'Pistol' && !w.sidearmOnly));
const weaponsForSlot = (slotIndex) => D.weapons.filter((w) => fitsSlot(w, slotIndex));

/** Quality colour class, shared with the gear picker's groups. */
const qualityOptionClass = (quality) => (
  quality === 'Exotic' ? 'q-exotic'
    : quality === 'Named' ? 'q-named'
      : quality === 'Prototype' ? 'q-proto' : '');

/* ------------------------------------------------- overrides over the tables */

let overrides = {};
const ov = (key, dflt) => (Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : dflt);
const capOf = (def) => (def ? ov('cap:' + def.id, def.maxValue) : 0);
const konst = (name) => Number(ov('const:' + name, D.constants[name]));
const shdPerPoint = (stat) => Number(ov('shd:' + stat, D.shd.bonusPerPoint[stat]));

/** An attachment's effect, with any corrections made in Tables applied. */
function attachmentMods(att) {
  const out = {};
  for (const stat of ATTACHMENT_STATS) {
    const value = Number(ov('att:' + att.id + ':' + stat, (att.modifiers || {})[stat] || 0)) || 0;
    if (value) out[stat] = value;
  }
  return out;
}

const dynParam = (talentId, key) => {
  const def = (D.dynamicTalents || {})[talentId];
  const dflt = def && def.params ? def.params[key] : 0;
  return Number(ov('dyn:' + talentId + ':' + key, dflt)) || 0;
};

const dynSetParam = (setName, key) => {
  const def = (D.dynamicSetTalents || {})[setName];
  const dflt = def && def.params ? def.params[key] : 0;
  return Number(ov('dynset:' + setName + ':' + key, dflt)) || 0;
};

/* A set's 4-piece talent whose chest and backpack talents rewrite the maths rather than adding a
   flat bonus. The amplifiers' own stored modifiers are placeholders, so they are ignored here. */
const DYNAMIC_SET_TALENTS = {
  "Striker's Battlegear": {
    compute(ctx) {
      const p = (k) => dynSetParam("Striker's Battlegear", k);
      const amp = D.dynamicSetTalents["Striker's Battlegear"].amplifiers;
      const stacks = ctx.talentIds.has(amp.backpack) ? p('backpackMaxStacks') : p('maxStacks');
      const per = ctx.talentIds.has(amp.chest) ? p('chestPerStackWeaponDamage') : p('perStackWeaponDamage');
      return { weaponDamage: stacks * per, _stacks: 0 };
    },
    describe(ctx) {
      const p = (k) => dynSetParam("Striker's Battlegear", k);
      const amp = D.dynamicSetTalents["Striker's Battlegear"].amplifiers;
      const stacks = ctx.talentIds.has(amp.backpack) ? p('backpackMaxStacks') : p('maxStacks');
      const per = ctx.talentIds.has(amp.chest) ? p('chestPerStackWeaponDamage') : p('perStackWeaponDamage');
      return stacks + ' stacks × ' + per + '% = +' + round2(stacks * per) + '% weapon damage';
    }
  },
  Heartbreaker: {
    compute(ctx) {
      const p = (k) => dynSetParam('Heartbreaker', k);
      const amp = D.dynamicSetTalents.Heartbreaker.amplifiers;
      const stacks = ctx.talentIds.has(amp.chest) ? p('chestMaxStacks') : p('maxStacks');
      const armorPer = ctx.talentIds.has(amp.backpack)
        ? p('backpackPerStackBonusArmor') : p('perStackBonusArmor');
      return { weaponDamage: stacks * p('perStackWeaponDamage'), bonusArmorPct: stacks * armorPer };
    },
    describe(ctx) {
      const p = (k) => dynSetParam('Heartbreaker', k);
      const amp = D.dynamicSetTalents.Heartbreaker.amplifiers;
      const stacks = ctx.talentIds.has(amp.chest) ? p('chestMaxStacks') : p('maxStacks');
      const armorPer = ctx.talentIds.has(amp.backpack)
        ? p('backpackPerStackBonusArmor') : p('perStackBonusArmor');
      return stacks + ' stacks × ' + p('perStackWeaponDamage') + '% = +'
        + round2(stacks * p('perStackWeaponDamage')) + '% weapon damage vs pulsed, and × '
        + armorPer + '% = +' + round2(stacks * armorPer) + '% bonus armor';
    }
  }
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Every amplifier talent id belonging to a hand-modelled set. */
const AMPLIFIER_IDS = new Set(
  Object.values(D.dynamicSetTalents || {})
    .flatMap((def) => Object.values(def.amplifiers || {}))
);

/** Red / blue / yellow cores across the six gear slots; a three-core piece counts as one of each. */
function coreCounts(build) {
  const counts = { weaponDamage: 0, armor: 0, skillTier: 0 };
  for (const g of build.gear) {
    const item = itemOf(g);
    if (!item) continue;
    if (item.allCores) {
      counts.weaponDamage += 1; counts.armor += 1; counts.skillTier += 1;
      continue;
    }
    const core = g.coreId ? GEAR_CORES[g.coreId] : null;
    if (core && core.statType in counts) counts[core.statType] += 1;
  }
  return counts;
}

/* Some talents read the rest of the build, so a flat modifier bag cannot describe them. These
   compute against it instead, and return stat keys directly rather than statTypes to route. */
const DYNAMIC_TALENTS = {
  gt_memento_kill: {
    conditional: true,
    compute(ctx) {
      const p = (k) => dynParam('gt_memento_kill', k);
      const stacks = p('maxStacks');
      return {
        weaponDamage: ctx.cores.weaponDamage * p('redWeaponDamage')
          + stacks * p('stackWeaponDamage'),
        bonusArmorPct: ctx.cores.armor * p('blueBonusArmor'),
        skillEfficiency: ctx.cores.skillTier * p('yellowSkillEfficiency')
          + stacks * p('stackSkillEfficiency'),
        armorRegenPct: stacks * p('stackArmorRegenPct')
      };
    },
    describe(ctx) {
      const p = (k) => dynParam('gt_memento_kill', k);
      const c = ctx.cores;
      const bag = DYNAMIC_TALENTS.gt_memento_kill.compute(ctx);
      return 'Your cores: ' + c.weaponDamage + ' red · ' + c.armor + ' blue · ' + c.skillTier
        + ' yellow. At ' + p('maxStacks') + ' trophies that is +' + bag.weaponDamage
        + '% weapon damage, +' + bag.bonusArmorPct + '% bonus armor, +' + bag.skillEfficiency
        + '% skill efficiency and +' + bag.armorRegenPct.toFixed(1) + '% armor regen per second.';
    }
  }
};

function applyBag(stats, bag) {
  for (const [key, value] of Object.entries(bag || {})) {
    if (!value) continue;
    if (!(key in stats)) stats[key] = 0;
    stats[key] += value;
  }
}

/** How many weapon-type perks a specialization may have active at once; 0 means no limit. */
function weaponPerkLimit() {
  const n = Math.round(konst('specWeaponArchetypes'));
  return n > 0 ? n : Infinity;
}

/** Weapon-type perks currently taken, oldest choice first. */
function weaponPerksTaken(build, spec) {
  return spec.perks.filter((p) => p.type === 'weapon' && (Number(build.perkTiers[p.id]) || 0) > 0);
}

/* The source stores a flat 165-point budget for every specialization, but the perks themselves
   total anywhere from 150 to 180, so "spent / 165" never reconciles. The reachable total is the
   unique perks plus as many weapon archetypes as the limit allows. */
function specBudget(spec) {
  const cost = (p) => p.tiers * p.costPerTier;
  const unique = spec.perks.filter((p) => p.type !== 'weapon').reduce((n, p) => n + cost(p), 0);
  const weapon = spec.perks.filter((p) => p.type === 'weapon').map(cost).sort((a, b) => b - a);
  return unique + weapon.slice(0, weaponPerkLimit()).reduce((n, c) => n + c, 0);
}

/** Brand bonuses are cumulative: 3 pieces grant the 1-, 2- and 3-piece lines. */
function brandLines(brandName) {
  const brand = D.brands[brandName];
  if (!brand) return [];
  return Object.keys(brand.bonuses).sort().map((n) => ({
    pieces: Number(n),
    statType: brand.bonuses[n].statType,
    value: Number(ov('brand:' + brandName + ':' + n, brand.bonuses[n].value))
  }));
}

/** Gear set bonuses unlock at 2, 3 and 4 pieces; a tier may carry several stats. */
function setLines(setName) {
  const set = D.gearSets[setName];
  if (!set) return [];
  const out = [];
  for (const n of Object.keys(set.bonuses).sort()) {
    const tier = set.bonuses[n];
    const list = Array.isArray(tier) ? tier : [tier];
    list.forEach((b, i) => {
      if (!b.statType) return;
      out.push({
        pieces: Number(n),
        statType: b.statType,
        value: Number(ov('set:' + setName + ':' + n + ':' + i, b.value))
      });
    });
  }
  return out;
}

/* --------------------------------------------------------------- build model */

let uid = 0;
const nextId = () => 'b' + Date.now().toString(36) + (uid++).toString(36);

const emptyGear = (slot) => ({
  slot, itemId: null, coreId: null, coreValue: null,
  attrs: [{ id: null, value: null }, { id: null, value: null }],
  mods: [{ id: null, value: null }, { id: null, value: null }],
  talentId: null, expertise: 0
});

const emptyWeapon = () => ({
  weaponId: null, coreValue: null,
  attrs: [{ id: null, value: null }, { id: null, value: null }],
  talentId: null, attachments: {}, expertise: 0
});

const emptyBuild = (name) => ({
  id: nextId(), name: name || 'New loadout',
  gear: SLOTS.map(emptyGear),
  weapons: [emptyWeapon(), emptyWeapon(), emptyWeapon()],
  spec: null, perkTiers: {}, shd: {}
});

/* Keep older or hand-edited payloads usable. */
function normalizeBuild(b) {
  const out = emptyBuild(b && b.name);
  if (!b || typeof b !== 'object') return out;
  out.id = b.id || out.id;
  out.spec = D.specializations[b.spec] ? b.spec : null;
  out.perkTiers = (b.perkTiers && typeof b.perkTiers === 'object') ? b.perkTiers : {};
  out.shd = (b.shd && typeof b.shd === 'object') ? b.shd : {};
  SLOTS.forEach((slot, i) => {
    const src = (b.gear || [])[i];
    if (!src) return;
    const g = out.gear[i];
    g.itemId = GEAR[src.itemId] ? src.itemId : null;
    g.coreId = src.coreId || null;
    g.coreValue = src.coreValue == null ? null : Number(src.coreValue);
    g.expertise = Number(src.expertise) || 0;
    g.talentId = validTalentFor(g, src.talentId || null);
    (src.attrs || []).slice(0, 2).forEach((a, j) => {
      g.attrs[j] = { id: a && a.id ? a.id : null, value: a && a.value != null ? Number(a.value) : null };
    });
    (src.mods || []).slice(0, 2).forEach((m, j) => {
      g.mods[j] = { id: m && m.id ? m.id : null, value: m && m.value != null ? Number(m.value) : null };
    });
  });
  (b.weapons || []).slice(0, 3).forEach((src, i) => {
    const w = out.weapons[i];
    w.weaponId = WEAPONS[src.weaponId] && fitsSlot(WEAPONS[src.weaponId], i) ? src.weaponId : null;
    w.coreValue = src.coreValue == null ? null : Number(src.coreValue);
    w.talentId = validWeaponTalent(w, src.talentId || null);
    w.expertise = Number(src.expertise) || 0;
    w.attachments = (!builtInModsOf(WEAPONS[w.weaponId])
      && src.attachments && typeof src.attachments === 'object') ? src.attachments : {};
    (src.attrs || []).slice(0, 2).forEach((a, j) => {
      w.attrs[j] = { id: a && a.id ? a.id : null, value: a && a.value != null ? Number(a.value) : null };
    });
  });
  return out;
}

/* ------------------------------------------------------------ item behaviour */

const itemOf = (g) => (g.itemId ? GEAR[g.itemId] : null);
const pieceArmor = (g) => {
  const item = itemOf(g);
  if (!item) return 0;
  const base = item.baseArmor || D.slotBaseArmor[g.slot] || 0;
  return base * (1 + (g.expertise || 0) / 100);
};
const fixedAttrsOf = (g) => (itemOf(g) || {}).fixedAttributes || [];

const slotAttrLines = (slot) => Number(ov('slotattrs:' + slot, D.slotAttributeSlots[slot] || 2));

/** Exotics spend their attribute lines on fixed rolls; what is left is editable. */
function attrSlotCount(g) {
  const item = itemOf(g);
  if (!item) return 0;
  if (item.allCores) return 0;
  if (item.maxAttributes != null) return item.maxAttributes;
  return Math.max(0, slotAttrLines(g.slot) - fixedAttrsOf(g).length);
}

/** Memento, NinjaBike, Harrier Pride and the Core Strength backpack carry all three cores. */
const allCoresOf = (item) => !!(item && item.allCores);
const modSlotCount = (g) => (itemOf(g) ? (itemOf(g).modSlots || 0) : 0);
const attrPoolFor = (g) => {
  const item = itemOf(g);
  if (item && item.quality === 'Prototype') return D.prototypeGearAttributes;
  return D.gearAttributes.filter((a) => !a.slots || a.slots.indexOf(g.slot) >= 0);
};
const coreChoicesFor = (g) => {
  const item = itemOf(g);
  if (item && item.lockedCore && !item.allCores) {
    return D.gearCoreAttributes.filter((c) => c.statType === item.lockedCore);
  }
  return D.gearCoreAttributes;
};
/** An exotic's talent is part of the item, whether the data flags it locked or just default. */
function lockedTalentOf(item) {
  if (!item || !item.hasTalent) return null;
  if (item.lockedTalent) return item.lockedTalent;
  if (item.quality === 'Exotic' && item.defaultTalent) return item.defaultTalent;
  return null;
}

/* A gear set chest or backpack carries one of that set's own talents — the generic pool is not
   available on it, and a set talent is never available on a brand piece. The upstream slot labels
   have known gaps, so the whole set's pool is offered and the slot-matched one is the default. */
function talentChoicesFor(g) {
  const item = itemOf(g);
  if (!item || !item.hasTalent) return [];
  const locked = lockedTalentOf(item);
  if (locked) return [GEAR_TALENTS[locked]].filter(Boolean);
  if (item.quality === 'Prototype') {
    const proto = D.gearTalents.filter((t) => t.slot === 'Prototype');
    if (proto.length) return proto;
  }
  if (item.gearSet) {
    const pool = D.gearTalents.filter((t) => t.gearSet === item.gearSet);
    if (pool.length) return pool;
  }
  return D.gearTalents.filter((t) => t.slot === g.slot && !t.gearSet);
}

/** The talent a piece comes with; a set or exotic piece is never left blank. */
function defaultTalentFor(g) {
  const item = itemOf(g);
  if (!item || !item.hasTalent) return null;
  const locked = lockedTalentOf(item);
  if (locked) return locked;
  if (!item.gearSet) return null;
  const match = talentChoicesFor(g).find((t) => t.slot === g.slot);
  return match ? match.id : null;
}

/** Drop a talent that this piece could not actually roll. */
function validTalentFor(g, talentId) {
  const item = itemOf(g);
  if (!item || !item.hasTalent) return null;
  const locked = lockedTalentOf(item);
  if (locked) return locked;
  const allowed = talentChoicesFor(g).some((t) => t.id === talentId);
  return allowed ? talentId : defaultTalentFor(g);
}
const weaponOf = (w) => (w.weaponId ? WEAPONS[w.weaponId] : null);
/** An exotic's mods are welded in: fixed per slot, not chosen. */
const builtInModsOf = (def) => (def && def.exoticMods && Object.keys(def.exoticMods).length
  ? def.exoticMods : null);

function attachmentChoices(w, kind) {
  const def = weaponOf(w);
  if (!def || builtInModsOf(def)) return [];
  if ((def.supportedSlots || []).indexOf(kind) < 0) return [];
  return (D.attachments[kind] || []).filter((a) =>
    !a.weaponTypes || a.weaponTypes.indexOf(def.type) >= 0);
}
/* An exotic or named weapon comes with its talent; only a plain High-End rolls one, and it rolls
   from neither the exotic talents nor the Perfect versions, which arrive attached to an item. */
const EXOTIC_TALENT = /\(Exotic\)/i;
const PERFECT_TALENT = /^Perfect(ly)?\b/i;

const lockedWeaponTalentOf = (def) => (def && def.defaultTalent
  && WEAPON_TALENTS[def.defaultTalent] ? def.defaultTalent : null);

function weaponTalentChoices(w) {
  const def = weaponOf(w);
  if (!def) return [];
  const locked = lockedWeaponTalentOf(def);
  if (locked) return [WEAPON_TALENTS[locked]];
  return D.weaponTalents.filter((t) =>
    !EXOTIC_TALENT.test(t.name) && !PERFECT_TALENT.test(t.name) &&
    (!t.weaponTypes || !def.type || t.weaponTypes.indexOf(def.type) >= 0));
}

/** Drop a talent this weapon could not actually carry. */
function validWeaponTalent(w, talentId) {
  const def = weaponOf(w);
  if (!def) return null;
  const locked = lockedWeaponTalentOf(def);
  if (locked) return locked;
  return weaponTalentChoices(w).some((t) => t.id === talentId) ? talentId : null;
}

/* ------------------------------------------------------------------- engine */

function blankStats() {
  const s = { armorFlat: 0, armorPct: 0, healthFlat: 0, healthPct: 0 };
  for (const key of Object.keys(STAT_LABEL)) if (!(key in s)) s[key] = 0;
  return s;
}

function add(stats, statType, value, source) {
  if (!statType || !value) return;
  let key = statType;
  if (source === 'pct' && PCT_SOURCE_REMAP[statType]) key = PCT_SOURCE_REMAP[statType];
  else if (source === 'flat' && FLAT_SOURCE_REMAP[statType]) key = FLAT_SOURCE_REMAP[statType];
  else if (PCT_SOURCE_REMAP[statType] && !(statType in stats)) key = PCT_SOURCE_REMAP[statType];
  if (!(key in stats)) stats[key] = 0;
  stats[key] += Number(value) || 0;
}

/* Talent modifiers encode armour as a flat amount (Cold grants 5000, Hardened 10000) the same way
   a gear core does, while every other stat is a percentage. Routing armour through the percentage
   bucket turns +5000 armour into +5000% of the pool. */
const TALENT_FLAT_STATS = new Set(['armor', 'armorRegen']);

function applyTalentModifiers(stats, talent, withConditional) {
  if (!talent || !talent.modifiers) return;
  if (talent.conditional && !withConditional) return;
  for (const [statType, value] of Object.entries(talent.modifiers)) {
    add(stats, statType, value, TALENT_FLAT_STATS.has(statType) ? 'flat' : 'pct');
  }
}

/* The NinjaBike Messenger Backpack's Resourceful counts as a piece of every set and brand you
   already have at least one of, so three Striker pieces plus this backpack reach the 4-piece
   bonus. It stacks into every active set at once, not just one. */
const RESOURCEFUL_TALENT = 'gt_ninjabike_resource';

/** Brand and gear-set counts across the six slots, plus which tiers are live. */
function countSets(build) {
  const brands = {}, sets = {};
  for (const g of build.gear) {
    const item = itemOf(g);
    if (!item) continue;
    if (item.brand) brands[item.brand] = (brands[item.brand] || 0) + 1;
    if (item.gearSet) sets[item.gearSet] = (sets[item.gearSet] || 0) + 1;
  }
  return { brands, sets };
}

/** Everything the gear, brands, sets, specialization and watch contribute. */
function gearStats(build, withConditional) {
  const stats = blankStats();
  const talentIds = new Set();
  for (const g of build.gear) {
    const item = itemOf(g);
    if (!item || !item.hasTalent) continue;
    const id = lockedTalentOf(item) || g.talentId;
    if (id) talentIds.add(id);
  }
  const ctx = { cores: coreCounts(build), talentIds, build };

  for (const g of build.gear) {
    const item = itemOf(g);
    if (!item) continue;
    stats.armorFlat += pieceArmor(g);

    if (allCoresOf(item)) {
      for (const c of D.gearCoreAttributes) add(stats, c.statType, capOf(c), 'flat');
    } else {
      const core = g.coreId ? GEAR_CORES[g.coreId] : null;
      if (core) {
        const value = g.coreValue == null ? capOf(core) : g.coreValue;
        add(stats, core.statType, value, 'flat');
      }
    }
    for (const fixed of fixedAttrsOf(g)) add(stats, fixed.statType, fixed.value, 'flat');
    for (let i = 0; i < attrSlotCount(g); i++) {
      const a = g.attrs[i];
      if (!a || !a.id) continue;
      const def = GEAR_ATTRS[a.id] || PROTO_ATTRS[a.id];
      if (!def) continue;
      add(stats, def.statType, a.value == null ? capOf(def) : a.value, 'flat');
    }
    for (let i = 0; i < modSlotCount(g); i++) {
      const m = g.mods[i];
      if (!m || !m.id) continue;
      const def = MODS[m.id];
      if (!def) continue;
      add(stats, def.statType, m.value == null ? capOf(def) : m.value, 'flat');
    }
    if (item.hasTalent) {
      const talentId = lockedTalentOf(item) || g.talentId;
      const dynamic = DYNAMIC_TALENTS[talentId];
      if (dynamic) {
        if (withConditional || !dynamic.conditional) applyBag(stats, dynamic.compute(ctx));
      } else if (!AMPLIFIER_IDS.has(talentId)) {
        applyTalentModifiers(stats, GEAR_TALENTS[talentId], withConditional);
      }
    }
  }

  const counts = countSets(build);
  const resourceful = talentIds.has(RESOURCEFUL_TALENT);
  /** an equipped set gains a piece from Resourceful; something you own none of does not */
  const effective = (raw) => (raw > 0 && resourceful ? raw + 1 : raw);
  const activeBrands = [], activeSets = [];
  for (const [name, raw] of Object.entries(counts.brands)) {
    const n = effective(raw);
    const lines = brandLines(name);
    for (const line of lines) if (line.pieces <= n) add(stats, line.statType, line.value, 'pct');
    activeBrands.push({ name, pieces: n, worn: raw, boosted: n > raw, lines });
  }
  for (const [name, raw] of Object.entries(counts.sets)) {
    const n = effective(raw);
    const lines = setLines(name);
    const dynamicSet = DYNAMIC_SET_TALENTS[name];
    for (const line of lines) {
      if (line.pieces > n) continue;
      if (line.pieces >= 4 && (!withConditional || dynamicSet)) continue;
      add(stats, line.statType, line.value, 'pct');
    }
    if (dynamicSet && n >= 4 && withConditional) applyBag(stats, dynamicSet.compute(ctx));
    const four = lines.filter((l) => l.pieces >= 4);
    activeSets.push({
      name, pieces: n, worn: raw, boosted: n > raw, lines,
      talentName: (D.gearSets[name] || {}).talentName,
      talentDetail: dynamicSet && n >= 4 ? dynamicSet.describe(ctx) : null,
      // a 4-piece set whose headline talent is neither modelled nor given a value
      talentUnmodelled: n >= 4 && !dynamicSet && (!four.length || four.every((l) => !l.value))
    });
  }
  activeBrands.sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name));
  activeSets.sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name));

  const spec = build.spec ? D.specializations[build.spec] : null;
  if (spec) {
    const allowed = new Set(weaponPerksTaken(build, spec).slice(0, weaponPerkLimit()).map((p) => p.id));
    for (const perk of spec.perks) {
      const tier = Number(build.perkTiers[perk.id]) || 0;
      if (tier <= 0) continue;
      if (perk.type === 'weapon' && !allowed.has(perk.id)) continue;
      const value = perk.valuePerTier * Math.min(tier, perk.tiers);
      add(stats, perk.statType, value, perk.statType === 'armor' ? 'flat' : 'pct');
    }
  }

  for (const [stat, points] of Object.entries(build.shd || {})) {
    const pts = Number(points) || 0;
    if (!pts || !(stat in D.shd.bonusPerPoint)) continue;
    const value = pts * shdPerPoint(stat);
    if (stat === 'armor') stats.armorPct += value;
    else if (stat === 'health') stats.healthPct += value;
    else add(stats, stat, value, 'pct');
  }

  stats._brands = activeBrands;
  stats._sets = activeSets;
  return stats;
}

/** Gear stats plus the contributions of one weapon's own rolls, mods and talent. */
function statsForWeapon(base, build, index, withConditional) {
  const stats = Object.assign({}, base);
  const w = build.weapons[index];
  const def = weaponOf(w);
  if (!def) return stats;

  add(stats, 'weaponDamage', w.expertise || 0, 'pct');
  const coreStat = TYPE_DAMAGE_STAT[def.type];
  if (coreStat) {
    const value = w.coreValue == null ? konst('weaponTypeCoreDamage') : w.coreValue;
    add(stats, coreStat, value, 'pct');
  }
  for (const a of w.attrs) {
    if (!a || !a.id) continue;
    const adef = WEAPON_ATTRS[a.id];
    if (!adef) continue;
    add(stats, adef.statType, a.value == null ? capOf(adef) : a.value, 'pct');
  }
  const builtIn = builtInModsOf(def);
  if (builtIn) {
    for (const mods of Object.values(builtIn)) {
      for (const [statType, value] of Object.entries(mods)) add(stats, statType, value, 'pct');
    }
  } else {
    for (const kind of ATTACHMENT_KINDS) {
      const att = ATTACHMENTS[w.attachments[kind]];
      if (!att) continue;
      for (const [statType, value] of Object.entries(attachmentMods(att))) {
        add(stats, statType, value, 'pct');
      }
    }
  }
  applyTalentModifiers(stats, WEAPON_TALENTS[lockedWeaponTalentOf(def) || w.talentId], withConditional);
  if (def.critChance) add(stats, 'critChance', def.critChance, 'pct');
  if (def.critDamage) add(stats, 'critDamage', def.critDamage, 'pct');
  return stats;
}

function skillTierOf(stats) {
  return Math.max(0, Math.min(konst('skillTierMax'), Math.floor(stats.skillTier || 0)));
}

/* Bonus armour is an overshield the build accrues, not part of the armour pool, so it is tracked
   separately and only joins the total once. Armour regeneration scales off the pool itself. */
function survivability(stats) {
  const armor = stats.armorFlat * (1 + stats.armorPct / 100);
  const bonusArmor = armor * ((stats.bonusArmorPct || 0) / 100);
  const health = konst('baseHealth') * (1 + stats.healthPct / 100) + stats.healthFlat;
  const regen = (stats.armorRegen || 0) + armor * ((stats.armorRegenPct || 0) / 100);
  return { armor, bonusArmor, health, ehp: armor + bonusArmor + health, regen };
}

/* The Division 2 per-shot damage is a product of separate buckets. Headshot and critical
   damage share one additive bucket; weapon-damage rolls share another; "total weapon damage"
   talents are their own multiplier, as are the target-condition bonuses. */
function damage(build, index, stats, sc) {
  const def = weaponOf(build.weapons[index]);
  if (!def) return null;

  const rpm = def.rpm * (1 + (stats.rateOfFire || 0) / 100);
  const mag = Math.max(1, Math.round(def.magazineSize * (1 + (stats.magazineSizePct || 0) / 100)));
  const reload = Math.max(0.1,
    def.reloadSpeed * (1 - (stats.reloadSpeed || 0) / 100) + (stats.reloadSeconds || 0));

  const critChance = Math.min(stats.critChance || 0, konst('critChanceCap')) / 100;
  const critDamage = (konst('baseCritDamage') + (stats.critDamage || 0)) / 100;
  const hsRate = Math.max(0, Math.min(100, sc.headshotRate)) / 100;
  const headshotPool = ((def.headshotDamage || 0) + (stats.headshotDamage || 0)) / 100;

  const hsCritBucket = 1 + hsRate * headshotPool + critChance * critDamage;
  const typeStat = TYPE_DAMAGE_STAT[def.type];
  const weaponPool = 1 + ((stats.weaponDamage || 0) + (typeStat ? stats[typeStat] || 0 : 0)) / 100;
  const totalWd = 1 + (stats.totalWeaponDamage || 0) / 100;
  const target = 1 + ((sc.target === 'health' ? stats.damageToHealth : stats.damageToArmor) || 0) / 100;
  const cover = sc.outOfCover ? 1 + (stats.damageToOutOfCover || 0) / 100 : 1;

  let perShot = def.baseDamage * hsCritBucket * weaponPool * totalWd * target * cover;
  if (sc.pvp) perShot *= konst('pvpMultiplier');

  const shotsPerSecond = rpm / 60;
  const magSeconds = mag / shotsPerSecond;
  return {
    weapon: def, perShot, rpm, mag, reload,
    burstDps: perShot * shotsPerSecond,
    sustainedDps: (perShot * mag) / (magSeconds + reload),
    magSeconds
  };
}

/* A loadout has two damage numbers, not one. The floor is the resting sheet — nothing procced,
   no stacks. The ceiling is every talent firing at max stacks, which is what a build "can" do.
   Real play sits between, so the expected figure interpolates by the uptime you set. Blending the
   DPS rather than the stats is the right way round: a talent is on or off at any instant, and
   average damage over time is the time-weighted average of the two states. */
function blend(floor, ceiling, uptime) {
  return floor + (ceiling - floor) * uptime;
}

/** Everything the readout and the comparison matrix need for one loadout. */
function evaluate(build, sc) {
  const uptime = Math.max(0, Math.min(100, sc.buffUptime == null ? 60 : sc.buffUptime)) / 100;
  const base = gearStats(build, true);
  const baseFloor = gearStats(build, false);

  const perWeapon = build.weapons.map((_, i) => {
    const stats = statsForWeapon(base, build, i, true);
    const statsFloor = statsForWeapon(baseFloor, build, i, false);
    const ceiling = damage(build, i, stats, sc);
    const floor = damage(build, i, statsFloor, sc);
    return {
      stats, statsFloor, ceiling, floor,
      dmg: ceiling && floor ? {
        weapon: ceiling.weapon,
        rpm: ceiling.rpm, mag: ceiling.mag, reload: ceiling.reload,
        perShot: blend(floor.perShot, ceiling.perShot, uptime),
        burstDps: blend(floor.burstDps, ceiling.burstDps, uptime),
        sustainedDps: blend(floor.sustainedDps, ceiling.sustainedDps, uptime)
      } : null
    };
  });

  const armed = perWeapon.filter((w) => w.dmg);
  const lead = perWeapon[sc.weaponIndex] && perWeapon[sc.weaponIndex].dmg
    ? perWeapon[sc.weaponIndex]
    : (armed[0] || null);
  const tier = skillTierOf(base);
  return {
    build, base, baseFloor, perWeapon, lead, uptime,
    surv: survivability(base),
    survFloor: survivability(baseFloor),
    tier,
    skillDamageTotal: (base.skillDamage || 0) + tier * konst('skillDamagePerTier'),
    ttk: lead && lead.dmg && lead.dmg.sustainedDps > 0 ? sc.targetHp / lead.dmg.sustainedDps : null
  };
}

/* --------------------------------------------------------------------- state */

const state = {
  builds: [], activeId: null, compare: [], tab: 'build',
  scenario: {
    headshotRate: 35, target: 'armor', outOfCover: false, pvp: false,
    targetHp: 1500000, weaponIndex: 0, buffUptime: 60
  },
  tableFilter: ''
};

const activeBuild = () => state.builds.find((b) => b.id === state.activeId) || state.builds[0];

/* ------------------------------------------------------------- seed examples */

function findGearByBrandOrSet(slot, opts) {
  const pool = GEAR_BY_SLOT[slot] || [];
  const match = pool.find((g) =>
    (opts.set ? g.gearSet === opts.set : g.brand === opts.brand) &&
    !g.isNamedItem && g.quality !== 'Exotic');
  return match || null;
}
const attrIdFor = (slot, statType) => {
  const def = D.gearAttributes.find((a) =>
    a.statType === statType && (!a.slots || a.slots.indexOf(slot) >= 0) && !a.modOnly && !a.exoticOnly);
  return def ? def.id : null;
};
const coreIdFor = (statType) => {
  const def = D.gearCoreAttributes.find((c) => c.statType === statType);
  return def ? def.id : null;
};
const modIdFor = (statType) => {
  const def = D.mods.find((m) => m.statType === statType);
  return def ? def.id : null;
};
const weaponAttrIdFor = (statType) => {
  const def = D.weaponAttributes.find((a) => a.statType === statType);
  return def ? def.id : null;
};

function buildFromSpec(spec) {
  const b = emptyBuild(spec.name);
  spec.gear.forEach((row, i) => {
    const g = b.gear[SLOTS.indexOf(row.slot)];
    const item = findGearByBrandOrSet(row.slot, row);
    if (!item) return;
    g.itemId = item.id;
    g.coreId = coreIdFor(row.core);
    (row.attrs || []).forEach((statType, j) => {
      if (j < attrSlotCount(g)) g.attrs[j] = { id: attrIdFor(row.slot, statType), value: null };
    });
    (row.mods || []).forEach((statType, j) => {
      if (j < modSlotCount(g)) g.mods[j] = { id: modIdFor(statType), value: null };
    });
    if (item.hasTalent) {
      g.talentId = row.talent && GEAR_TALENTS[row.talent] ? row.talent : defaultTalentFor(g);
    }
  });
  (spec.weapons || []).forEach((row, i) => {
    const w = b.weapons[i];
    if (!WEAPONS[row.id]) return;
    w.weaponId = row.id;
    (row.attrs || []).forEach((statType, j) => {
      w.attrs[j] = { id: weaponAttrIdFor(statType), value: null };
    });
    w.talentId = lockedWeaponTalentOf(WEAPONS[row.id])
      || (WEAPON_TALENTS[row.talent] ? row.talent : null);
  });
  b.spec = D.specializations[spec.spec] ? spec.spec : null;
  b.perkTiers = spec.perks || {};
  b.shd = spec.shd || {};
  return b;
}

const SEEDS = [
  {
    name: 'Striker AR — example', spec: 'Gunner', perks: { gun_ar_dmg: 3, gun_armor: 1 },
    shd: { weaponDamage: 50, critDamage: 50, headshotDamage: 50, critChance: 50 },
    gear: [
      { slot: 'Mask', set: "Striker's Battlegear", core: 'weaponDamage', attrs: ['critChance', 'critDamage'], mods: ['critDamage'] },
      { slot: 'Chest', set: "Striker's Battlegear", core: 'weaponDamage', attrs: ['critDamage', 'weaponHandling'], mods: ['critDamage'] },
      { slot: 'Backpack', set: "Striker's Battlegear", core: 'weaponDamage', attrs: ['critChance', 'critDamage'], mods: ['critChance'] },
      { slot: 'Gloves', set: "Striker's Battlegear", core: 'weaponDamage', attrs: ['critChance', 'critDamage'] },
      { slot: 'Holster', brand: 'Providence Defense', core: 'weaponDamage', attrs: ['critChance', 'critDamage'] },
      { slot: 'Kneepads', brand: 'Providence Defense', core: 'weaponDamage', attrs: ['critDamage', 'headshotDamage'] }
    ],
    weapons: [
      { id: 'w_police_m4', attrs: ['critDamage', 'critChance'], talent: 'wt_strained' },
      { id: 'w_classic_m1a', attrs: ['critDamage', 'headshotDamage'], talent: 'wt_rifleman' }
    ]
  },
  {
    name: 'Heartbreaker LMG — example', spec: 'Gunner', perks: { gun_lmg_dmg: 3, gun_reload: 1 },
    shd: { weaponDamage: 50, critDamage: 50, critChance: 50, magazineSizePct: 50 },
    gear: [
      { slot: 'Mask', set: 'Heartbreaker', core: 'weaponDamage', attrs: ['critChance', 'critDamage'], mods: ['critDamage'] },
      { slot: 'Chest', set: 'Heartbreaker', core: 'weaponDamage', attrs: ['critDamage', 'weaponHandling'], mods: ['critDamage'] },
      { slot: 'Backpack', set: 'Heartbreaker', core: 'weaponDamage', attrs: ['critChance', 'critDamage'], mods: ['critChance'] },
      { slot: 'Gloves', set: 'Heartbreaker', core: 'weaponDamage', attrs: ['critChance', 'critDamage'] },
      { slot: 'Holster', brand: 'Petrov Defense Group', core: 'weaponDamage', attrs: ['critChance', 'critDamage'] },
      { slot: 'Kneepads', brand: 'Petrov Defense Group', core: 'armor', attrs: ['critDamage', 'hazardProtection'] }
    ],
    weapons: [
      { id: 'w_bm_rpk74_e', attrs: ['critDamage', 'critChance'], talent: 'wt_strained' },
      { id: 'w_police_m4', attrs: ['critDamage', 'critChance'], talent: 'wt_optimist' }
    ]
  },
  {
    name: 'Eclipse skill — example', spec: 'Technician',
    perks: { tech_skill_dmg: 1, tech_skill_tier: 1, tech_status: 1 },
    shd: { skillDamage: 50, skillHaste: 50, armor: 50, skillDuration: 50 },
    gear: [
      { slot: 'Mask', set: 'Eclipse Protocol', core: 'skillTier', attrs: ['skillDamage', 'statusEffects'], mods: ['skillHaste'] },
      { slot: 'Chest', set: 'Eclipse Protocol', core: 'skillTier', attrs: ['skillDamage', 'skillHaste'], mods: ['skillHaste'] },
      { slot: 'Backpack', set: 'Eclipse Protocol', core: 'skillTier', attrs: ['skillDamage', 'statusEffects'], mods: ['skillHaste'] },
      { slot: 'Gloves', set: 'Eclipse Protocol', core: 'skillTier', attrs: ['skillHaste', 'hazardProtection'] },
      { slot: 'Holster', brand: 'Wyvern Wear', core: 'skillTier', attrs: ['skillHaste', 'statusEffects'] },
      { slot: 'Kneepads', brand: 'Wyvern Wear', core: 'armor', attrs: ['statusEffects', 'hazardProtection'] }
    ],
    weapons: [
      { id: 'w_st_elmos', attrs: ['critDamage', 'critChance'], talent: 'wt_in_sync' }
    ]
  }
];

/* ------------------------------------------------------------- persistence */

let cloud = null;
let saveTimer = null;
const LS_KEY = 'shd-loadout-bench-v1';

function snapshot() {
  return {
    builds: state.builds, activeId: state.activeId, compare: state.compare,
    scenario: state.scenario, overrides
  };
}

function applySnapshot(data) {
  if (!data || !Array.isArray(data.builds) || !data.builds.length) return false;
  state.builds = data.builds.map(normalizeBuild);
  state.activeId = data.activeId && state.builds.some((b) => b.id === data.activeId)
    ? data.activeId : state.builds[0].id;
  state.compare = Array.isArray(data.compare)
    ? data.compare.filter((id) => state.builds.some((b) => b.id === id)) : [];
  if (data.scenario && typeof data.scenario === 'object') Object.assign(state.scenario, data.scenario);
  overrides = (data.overrides && typeof data.overrides === 'object') ? data.overrides : {};
  return true;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = snapshot();
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
    if (cloud) cloud.doc('state/bench').set(data).catch(() => { /* offline is fine */ });
  }, 500);
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return applySnapshot(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return false;
}

async function connectCloud() {
  const note = document.getElementById('storage-note');
  let db = null;
  try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
  if (!db) {
    note.textContent = 'Saved in this browser only.';
    return;
  }
  cloud = db;
  note.textContent = 'Synced to your account.';
  try {
    const doc = await db.doc('state/bench').get();
    const data = doc && (doc.data || doc);
    if (data && Array.isArray(data.builds) && data.builds.length) {
      applySnapshot(data);
      render();
    } else {
      save();
    }
  } catch (e) {
    note.textContent = 'Saved in this browser; account sync unavailable.';
  }
}

/* ------------------------------------------------------------------ helpers */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/* Talent copy in the tables carries <br> from the source; keep breaks, drop everything else. */
const richText = (s) => esc(s).replace(/&lt;br\s*\/?&gt;/gi, ' ');
const int = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n, dp) => (n || 0).toFixed(dp == null ? 1 : dp).replace(/\.0$/, '') + '%';
const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return Math.round(n).toString();
};
const qualityClass = (item) => {
  if (!item) return '';
  if (item.gearSet) return 'q-gearset';
  if (item.quality === 'Exotic') return 'q-exotic';
  if (item.quality === 'Named') return 'q-named';
  if (item.quality === 'Prototype') return 'q-proto';
  if (item.quality === 'High-End') return 'q-highend';
  return '';
};
const label = (statType) => STAT_LABEL[statType] || statType;

/* Short forms so an attachment's effect fits on its own option line. */
const SHORT_STAT = {
  critChance: 'crit chance', critDamage: 'crit damage', headshotDamage: 'headshot dmg',
  weaponDamage: 'weapon dmg', totalWeaponDamage: 'total weapon dmg', reloadSpeed: 'reload speed',
  stability: 'stability', accuracy: 'accuracy', optimalRange: 'optimal range',
  rateOfFire: 'rate of fire', magazineSize: 'mag size', magazineSizePct: 'mag size',
  swapSpeed: 'swap speed', weaponHandling: 'handling', damageToElites: 'vs elites',
  damageToArmor: 'vs armor', damageToHealth: 'vs health', damageToOutOfCover: 'vs out of cover',
  ammoCapacity: 'ammo capacity', skillDamage: 'skill dmg', skillHaste: 'skill haste',
  reloadSeconds: 'reload time', meleeDamage: 'melee damage'
};

/** "+5% crit damage, -20% optimal range" — the non-zero part of a modifier bag. */
function modifierSummary(modifiers) {
  if (!modifiers) return '';
  return Object.entries(modifiers)
    .filter(([, v]) => Number(v))
    .map(([k, v]) => (v > 0 ? '+' : '\u2212') + Math.abs(v)
      + (k === 'reloadSeconds' ? 's ' : '% ')
      + (SHORT_STAT[k] || label(k).toLowerCase()))
    .join(', ');
}
const statText = (statType, value) => {
  const key = PCT_SOURCE_REMAP[statType] || statType;
  if (key === 'armorFlat' || key === 'healthFlat' || statType === 'armorRegen') {
    return label(statType) + ' +' + int(value);
  }
  if (statType === 'skillTier') return label(statType) + ' +' + value;
  return label(statType) + ' +' + value + '%';
};

/** Sort option items by their visible label so every pulldown reads alphabetically. */
const alpha = (items) => items.slice().sort((a, b) =>
  String(a.text).localeCompare(String(b.text), 'en', { numeric: true }));

/** Option list builder; `groups` is [{label, items:[{value,text,disabled}]}] or a flat item list. */
function options(groups, selected, placeholder) {
  let html = placeholder === null ? ''
    : '<option value=""' + (selected ? '' : ' selected') + '>' + esc(placeholder || '— none —') + '</option>';
  const renderItems = (items) => items.map((it) =>
    '<option value="' + esc(it.value) + '"'
    + (it.cls ? ' class="' + esc(it.cls) + '"' : '')
    + (String(it.value) === String(selected) ? ' selected' : '') + '>'
    + esc(it.text) + '</option>').join('');
  if (Array.isArray(groups) && groups.length && groups[0] && groups[0].items) {
    html += groups.map((g) => g.items.length
      ? '<optgroup label="' + esc(g.label) + '"'
        + (g.cls ? ' class="' + esc(g.cls) + '"' : '') + '>'
        + renderItems(g.items) + '</optgroup>' : '').join('');
  } else {
    html += renderItems(groups || []);
  }
  return html;
}

/* --------------------------------------------------------------- rendering */

function renderScenario() {
  const sc = state.scenario;
  const weaponOpts = state.builds.length ? (activeBuild().weapons.map((w, i) => {
    const def = weaponOf(w);
    return { value: String(i), text: WEAPON_SLOT_NAMES[i] + (def ? ' · ' + def.name : ' · empty') };
  })) : [];
  document.getElementById('scenario').innerHTML = [
    '<div class="field">',
    '  <span class="eyebrow"><span>Headshot rate</span><span class="num">' + sc.headshotRate + '%</span></span>',
    '  <input type="range" id="sc-hs" min="0" max="100" step="5" value="' + sc.headshotRate + '"',
    '   aria-label="Share of shots that land as headshots">',
    '</div>',
    '<div class="field">',
    '  <span class="eyebrow"><span>Buff uptime</span><span class="num" id="sc-uptime-out">'
    + sc.buffUptime + '%</span></span>',
    '  <input type="range" id="sc-uptime" min="0" max="100" step="5" value="' + sc.buffUptime + '"',
    '   aria-label="Share of the fight with stacking talents active">',
    '</div>',
    '<div class="field">',
    '  <span class="eyebrow">Target</span>',
    '  <div class="seg" id="sc-target">',
    '    <button data-target="armor" aria-pressed="' + (sc.target === 'armor') + '">Armored</button>',
    '    <button data-target="health" aria-pressed="' + (sc.target === 'health') + '">Flesh</button>',
    '  </div>',
    '</div>',
    '<div class="field">',
    '  <span class="eyebrow">Conditions</span>',
    '  <div class="toggles">',
    '    <label><input type="checkbox" id="sc-cover"' + (sc.outOfCover ? ' checked' : '') + '> Out of cover</label>',
    '    <label><input type="checkbox" id="sc-pvp"' + (sc.pvp ? ' checked' : '') + '> Conflict (PvP)</label>',
    '  </div>',
    '</div>',
    '<div class="field">',
    '  <span class="eyebrow">Lead weapon</span>',
    '  <select id="sc-weapon" aria-label="Weapon used for headline damage">'
    + weaponOpts.map((o) => '<option value="' + o.value + '"'
      + (String(sc.weaponIndex) === o.value ? ' selected' : '') + '>' + esc(o.text) + '</option>').join('')
    + '</select>',
    '</div>',
    '<div class="field">',
    '  <span class="eyebrow">Target health pool</span>',
    '  <input type="number" id="sc-hp" min="1000" step="50000" value="' + sc.targetHp + '"',
    '   aria-label="Target health pool used for time to kill">',
    '</div>'
  ].join('');
}

function renderLoadouts() {
  const host = document.getElementById('loadouts');
  host.innerHTML = state.builds.map((b) => {
    const ev = evaluate(b, state.scenario);
    const dps = ev.lead && ev.lead.dmg ? compact(ev.lead.dmg.sustainedDps) : '—';
    const on = state.compare.indexOf(b.id) >= 0;
    return '<div class="loadout" aria-current="' + (b.id === state.activeId) + '">'
      + '<input type="checkbox" data-compare="' + b.id + '"' + (on ? ' checked' : '')
      + ' aria-label="Compare ' + esc(b.name) + '">'
      + '<button class="lpick" data-pick="' + b.id + '">' + esc(b.name) + '</button>'
      + '<span class="lmeta">' + dps + ' DPS · ' + compact(ev.surv.armor) + ' armor · ST' + ev.tier + '</span>'
      + '</div>';
  }).join('');
}

function renderGearSlot(g, index) {
  const item = itemOf(g);
  const groups = [
    { label: 'Gear sets', cls: 'q-gearset', items: [] },
    { label: 'Exotic', cls: 'q-exotic', items: [] },
    { label: 'Named', cls: 'q-named', items: [] },
    { label: 'Brand sets', cls: 'q-highend', items: [] },
    { label: 'Prototype', cls: 'q-proto', items: [] },
    { label: 'Other', cls: 'q-plain', items: [] }
  ];
  const bucket = { 'Gear sets': 0, Exotic: 1, Named: 2, 'Brand sets': 3, Prototype: 4, Other: 5 };
  for (const candidate of GEAR_BY_SLOT[g.slot]) {
    const entry = { value: candidate.id, text: candidate.name };
    let into = 'Other';
    if (candidate.gearSet) into = 'Gear sets';
    else if (candidate.quality === 'Exotic') into = 'Exotic';
    else if (candidate.isNamedItem || candidate.quality === 'Named') into = 'Named';
    else if (candidate.quality === 'Prototype') into = 'Prototype';
    else if (candidate.brand) into = 'Brand sets';
    groups[bucket[into]].items.push(entry);
  }
  for (const group of groups) group.items = alpha(group.items);

  const rows = [];
  rows.push('<div class="slot-head">'
    + '<span class="name">' + esc(g.slot) + '</span>'
    + (item && item.gearSet ? '<span class="chip">' + esc(item.gearSet) + '</span>'
      : item && item.brand ? '<span class="chip">' + esc(item.brand) + '</span>' : '')
    + '<span class="armor">' + (item ? int(pieceArmor(g)) + ' armor' : 'empty') + '</span>'
    + '</div>');
  rows.push('<select data-gear="' + index + '" data-field="itemId" aria-label="' + esc(g.slot) + ' item">'
    + options(groups, g.itemId, '— empty slot —') + '</select>');

  if (item) {
    if (allCoresOf(item)) {
      for (const c of D.gearCoreAttributes) {
        rows.push('<div class="row-label"><span class="eyebrow">Core</span>'
          + '<div class="attr-row locked">'
          + '<input type="text" value="' + esc(c.name) + '" disabled aria-label="Core attribute">'
          + '<input type="text" value="' + esc(capOf(c)) + '" disabled aria-label="Core value">'
          + '</div></div>');
      }
      rows.push('<p class="hint">All three cores — no secondary attribute rolls.</p>');
    } else {
      const cores = alpha(coreChoicesFor(g).map((c) => ({ value: c.id, text: c.name })));
      const core = g.coreId ? GEAR_CORES[g.coreId] : null;
      rows.push('<div class="row-label"><span class="eyebrow">Core</span>'
        + '<div class="attr-row">'
        + '<select data-gear="' + index + '" data-field="coreId" aria-label="Core attribute">'
        + options(cores, g.coreId, '— no core —') + '</select>'
        + '<input type="number" step="any" data-gear="' + index + '" data-field="coreValue"'
        + ' value="' + (core ? (g.coreValue == null ? capOf(core) : g.coreValue) : '') + '"'
        + (core ? '' : ' disabled') + ' aria-label="Core value">'
        + '</div></div>');
    }

    for (const fixed of fixedAttrsOf(g)) {
      rows.push('<div class="row-label"><span class="eyebrow">Fixed</span>'
        + '<div class="attr-row locked">'
        + '<input type="text" value="' + esc(label(fixed.statType)) + '" disabled aria-label="Fixed attribute">'
        + '<input type="text" value="' + esc(fixed.value) + '" disabled aria-label="Fixed value">'
        + '</div></div>');
    }

    const pool = attrPoolFor(g);
    for (let i = 0; i < attrSlotCount(g); i++) {
      const a = g.attrs[i] || {};
      const def = a.id ? (GEAR_ATTRS[a.id] || PROTO_ATTRS[a.id]) : null;
      const byCategory = ['Offensive', 'Defensive', 'Utility'].map((cat) => ({
        label: cat,
        items: alpha(pool.filter((p) => p.category === cat && !p.modOnly)
          .map((p) => ({ value: p.id, text: p.name })))
      }));
      rows.push('<div class="row-label"><span class="eyebrow">Attr ' + (i + 1) + '</span>'
        + '<div class="attr-row">'
        + '<select data-gear="' + index + '" data-attr="' + i + '" aria-label="Attribute ' + (i + 1) + '">'
        + options(byCategory, a.id, '— empty —') + '</select>'
        + '<input type="number" step="any" data-gear="' + index + '" data-attrval="' + i + '"'
        + ' value="' + (def ? (a.value == null ? capOf(def) : a.value) : '') + '"'
        + (def ? '' : ' disabled') + ' aria-label="Attribute ' + (i + 1) + ' value">'
        + '</div></div>');
    }

    for (let i = 0; i < modSlotCount(g); i++) {
      const m = g.mods[i] || {};
      const def = m.id ? MODS[m.id] : null;
      rows.push('<div class="row-label"><span class="eyebrow">Mod ' + (i + 1) + '</span>'
        + '<div class="attr-row">'
        + '<select data-gear="' + index + '" data-mod="' + i + '" aria-label="Mod ' + (i + 1) + '">'
        + options(alpha(D.mods.map((x) => ({ value: x.id, text: x.name }))), m.id, '— empty —') + '</select>'
        + '<input type="number" step="any" data-gear="' + index + '" data-modval="' + i + '"'
        + ' value="' + (def ? (m.value == null ? capOf(def) : m.value) : '') + '"'
        + (def ? '' : ' disabled') + ' aria-label="Mod ' + (i + 1) + ' value">'
        + '</div></div>');
    }

    if (item.hasTalent) {
      const choices = talentChoicesFor(g);
      const locked = lockedTalentOf(item);
      const chosen = locked || g.talentId;
      const talent = GEAR_TALENTS[chosen];
      const fixedToSet = !!item.gearSet && !locked;
      rows.push('<div class="row-label"><span class="eyebrow">Talent</span>'
        + '<select data-gear="' + index + '" data-field="talentId"' + (locked ? ' disabled' : '')
        + ' aria-label="Talent">'
        + options(alpha(choices.map((t) => ({ value: t.id, text: t.name }))), chosen,
          locked || (fixedToSet && chosen) ? null : '— no talent —') + '</select>'
        + '</div>');
      if (fixedToSet) {
        rows.push('<p class="hint">Set piece — only ' + esc(item.gearSet) + ' talents roll here.</p>');
      }
      if (talent) rows.push('<p class="talent-desc">' + richText(talent.description) + '</p>');
      const dynamic = DYNAMIC_TALENTS[chosen];
      if (dynamic && dynamic.describe) {
        rows.push('<p class="hint computed">' + esc(dynamic.describe({ cores: coreCounts(activeBuild()) })) + '</p>');
      }
    }

    rows.push('<div class="row-label"><span class="eyebrow">Expertise</span>'
      + '<div class="attr-row"><input type="range" min="0" max="' + MAX_EXPERTISE + '"'
      + ' data-gear="' + index + '" data-field="expertise" value="' + (g.expertise || 0) + '"'
      + ' aria-label="Expertise level"><input type="number" min="0" max="' + MAX_EXPERTISE + '"'
      + ' data-gear="' + index + '" data-field="expertise" value="' + (g.expertise || 0) + '"'
      + ' aria-label="Expertise level"></div></div>');
  }

  return '<div class="slot ' + qualityClass(item) + '">' + rows.join('') + '</div>';
}

function renderWeaponSlot(w, index, ev) {
  const def = weaponOf(w);
  const pool = weaponsForSlot(index);
  const byType = {};
  for (const x of pool) (byType[x.type] = byType[x.type] || []).push(x);
  const groups = Object.keys(byType)
    .map((type) => ({
      label: TYPE_LABEL[type] || type,
      items: alpha(byType[type].map((x) => ({
        value: x.id,
        cls: qualityOptionClass(x.quality),
        text: x.name + (x.quality === 'High-End' ? '' : ' · ' + x.quality)
      })))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const rows = [];
  rows.push('<div class="slot-head"><span class="name">' + WEAPON_SLOT_NAMES[index] + '</span>'
    + (def ? '<span class="chip">' + esc(TYPE_LABEL[def.type] || def.type) + '</span>' : '')
    + '<span class="armor">' + (def ? int(def.baseDamage) + ' base' : 'empty') + '</span></div>');
  rows.push('<select data-wpn="' + index + '" data-field="weaponId" aria-label="'
    + WEAPON_SLOT_NAMES[index] + ' weapon">' + options(groups, w.weaponId, '— empty slot —') + '</select>');

  if (def) {
    const dmg = ev.perWeapon[index].dmg;
    rows.push('<div class="wpn-figures">'
      + '<div><span class="k eyebrow">Per shot</span><span class="v em">' + compact(dmg.perShot) + '</span></div>'
      + '<div><span class="k eyebrow">Sustained</span><span class="v em">' + compact(dmg.sustainedDps) + '</span></div>'
      + '<div><span class="k eyebrow">Burst</span><span class="v">' + compact(dmg.burstDps) + '</span></div>'
      + '<div><span class="k eyebrow">RPM</span><span class="v">' + Math.round(dmg.rpm) + '</span></div>'
      + '<div><span class="k eyebrow">Mag</span><span class="v">' + dmg.mag + '</span></div>'
      + '<div><span class="k eyebrow">Reload</span><span class="v">' + dmg.reload.toFixed(2) + 's</span></div>'
      + '</div>');

    const coreLabel = (TYPE_LABEL[def.type] || def.type) + ' Damage %';
    rows.push('<div class="row-label"><span class="eyebrow">Core</span><div class="attr-row locked">'
      + '<input type="text" value="' + esc(coreLabel) + '" disabled aria-label="Weapon core attribute">'
      + '<input type="number" step="any" data-wpn="' + index + '" data-field="coreValue"'
      + ' value="' + (w.coreValue == null ? konst('weaponTypeCoreDamage') : w.coreValue) + '"'
      + ' aria-label="Weapon core value"></div></div>'
      + '<p class="hint">Core is fixed to the weapon type.</p>');

    for (let i = 0; i < 2; i++) {
      const a = w.attrs[i] || {};
      const adef = a.id ? WEAPON_ATTRS[a.id] : null;
      rows.push('<div class="row-label"><span class="eyebrow">Attr ' + (i + 1) + '</span><div class="attr-row">'
        + '<select data-wpn="' + index + '" data-attr="' + i + '" aria-label="Weapon attribute ' + (i + 1) + '">'
        + options(alpha(D.weaponAttributes.map((x) => ({ value: x.id, text: x.name }))), a.id, '— empty —') + '</select>'
        + '<input type="number" step="any" data-wpn="' + index + '" data-attrval="' + i + '"'
        + ' value="' + (adef ? (a.value == null ? capOf(adef) : a.value) : '') + '"'
        + (adef ? '' : ' disabled') + ' aria-label="Weapon attribute value"></div></div>');
    }

    const lockedTalent = lockedWeaponTalentOf(def);
    const chosenTalent = lockedTalent || w.talentId;
    const talent = WEAPON_TALENTS[chosenTalent];
    rows.push('<div class="row-label"><span class="eyebrow">Talent</span>'
      + '<select data-wpn="' + index + '" data-field="talentId"' + (lockedTalent ? ' disabled' : '')
      + ' aria-label="Weapon talent">'
      + options(alpha(weaponTalentChoices(w).map((t) => ({ value: t.id, text: t.name }))),
        chosenTalent, lockedTalent ? null : '— no talent —')
      + '</select></div>');
    if (lockedTalent) {
      rows.push('<p class="hint">Built into this ' + esc(def.quality.toLowerCase()) + ' weapon.</p>');
    }
    if (talent) rows.push('<p class="talent-desc">' + richText(talent.description) + '</p>');

    const builtInMods = builtInModsOf(def);
    if (builtInMods) {
      for (const kind of ATTACHMENT_KINDS) {
        const mods = builtInMods[kind];
        if (!mods) continue;
        rows.push('<div class="row-label"><span class="eyebrow">' + kind + '</span>'
          + '<input type="text" class="locked-field" value="'
          + esc(modifierSummary(mods) || 'no bonus') + '" disabled aria-label="'
          + kind + ' (built in)"></div>');
      }
      rows.push('<p class="hint">Mods are built into this exotic and cannot be swapped.</p>');
    }
    for (const kind of ATTACHMENT_KINDS) {
      const choices = attachmentChoices(w, kind);
      if (!choices.length) continue;
      const attOptions = alpha(choices.map((a) => {
        const effect = modifierSummary(attachmentMods(a));
        return { value: a.id, text: a.name + (effect ? '  ·  ' + effect : '  ·  not recorded') };
      }));
      rows.push('<div class="row-label"><span class="eyebrow">' + kind + '</span>'
        + '<select data-wpn="' + index + '" data-attachment="' + kind + '" aria-label="' + kind + '">'
        + options(attOptions, w.attachments[kind], '— empty —')
        + '</select></div>');
    }

    rows.push('<div class="row-label"><span class="eyebrow">Expertise</span><div class="attr-row">'
      + '<input type="range" min="0" max="' + MAX_EXPERTISE + '" data-wpn="' + index + '" data-field="expertise"'
      + ' value="' + (w.expertise || 0) + '" aria-label="Weapon expertise">'
      + '<input type="number" min="0" max="' + MAX_EXPERTISE + '" data-wpn="' + index + '" data-field="expertise"'
      + ' value="' + (w.expertise || 0) + '" aria-label="Weapon expertise"></div></div>');
  }

  return '<div class="slot ' + (def ? qualityClass(def) : '') + '">' + rows.join('') + '</div>';
}

function renderBonuses(ev) {
  const blocks = [];
  const pips = (count, worn, total) => '<span class="pips">'
    + Array.from({ length: total }, (_, i) => '<span class="pip'
      + (i < count ? ' on' : '') + (i >= worn && i < count ? ' boost' : '') + '"></span>').join('')
    + '</span>';
  const boostNote = '<span class="live">+1 piece from Resourceful</span>';

  for (const set of ev.base._sets) {
    blocks.push('<div class="bonus"><span class="bname">' + esc(set.name) + '</span>'
      + pips(set.pieces, set.worn, 4)
      + '<span class="blines">'
      + set.lines.filter((l) => l.pieces < 4)
        .map((l) => '<span class="' + (l.pieces <= set.pieces ? 'live' : '') + '">'
          + l.pieces + '· ' + esc(statText(l.statType, l.value)) + '</span>').join('')
      + (set.boosted ? boostNote : '')
      + (set.talentName
        ? '<span class="' + (set.pieces >= 4 && !set.talentUnmodelled ? 'live' : '') + '">4· '
          + esc(set.talentName)
          + (set.talentUnmodelled
            ? ' <em>— not modelled</em>'
            : set.talentDetail
              ? '</span><span class="live detail">' + esc(set.talentDetail)
              : set.lines.filter((l) => l.pieces >= 4 && l.value)
                .map((l) => ' · ' + esc(statText(l.statType, l.value))).join(''))
          + '</span>'
        : '')
      + '</span></div>');
  }
  for (const brand of ev.base._brands) {
    blocks.push('<div class="bonus"><span class="bname">' + esc(brand.name) + '</span>'
      + pips(Math.min(brand.pieces, 3), brand.worn, 3)
      + '<span class="blines">'
      + brand.lines.map((l) => '<span class="' + (l.pieces <= brand.pieces ? 'live' : '') + '">'
        + l.pieces + '· ' + esc(statText(l.statType, l.value)) + '</span>').join('')
      + (brand.boosted ? boostNote : '')
      + '</span></div>');
  }
  if (!blocks.length) blocks.push('<p class="hint">No brand or gear set bonuses active yet.</p>');
  return blocks.join('');
}

function renderSpec(build) {
  const names = Object.keys(D.specializations).sort();
  const spec = build.spec ? D.specializations[build.spec] : null;
  let html = '<select id="spec-pick" aria-label="Specialization">'
    + options(names.map((n) => ({ value: n, text: n })), build.spec, '— no specialization —') + '</select>';
  if (!spec) return html;

  const budget = specBudget(spec);
  const spent = spec.perks.reduce((sum, p) =>
    sum + (Number(build.perkTiers[p.id]) || 0) * p.costPerTier, 0);
  const limit = weaponPerkLimit();
  const chosen = weaponPerksTaken(build, spec);

  html += '<p class="hint" style="margin:8px 0">' + esc(spec.description)
    + ' Grenade: ' + esc(spec.grenade) + '. Skill: ' + esc(spec.uniqueSkill) + '.<br>'
    + '<span class="num">' + spent + ' / ' + budget + '</span> points spent · '
    + '<span class="num">' + chosen.length + ' / '
    + (limit === Infinity ? 'any' : limit) + '</span> weapon archetypes.</p>';

  html += '<div class="perk-grid">' + spec.perks.map((p) => {
    const tier = Number(build.perkTiers[p.id]) || 0;
    const blocked = p.type === 'weapon' && !tier && chosen.length >= limit;
    const buttons = Array.from({ length: p.tiers + 1 }, (_, t) =>
      '<button data-perk="' + esc(p.id) + '" data-tier="' + t + '"'
      + (blocked && t > 0 ? ' disabled' : '')
      + ' aria-pressed="' + (t === tier) + '">' + (t === 0 ? 'off' : t) + '</button>').join('');
    return '<div class="perk' + (blocked ? ' blocked' : '') + '">'
      + '<span class="pname">' + esc(p.name) + '</span>'
      + '<span class="tierpick">' + buttons + '</span>'
      + '<span class="pdesc">' + esc(p.description) + ' · ' + p.costPerTier + ' pts/tier'
      + (blocked ? ' · archetype limit reached' : '') + '</span></div>';
  }).join('') + '</div>';
  return html;
}

function renderWatch(build) {
  const max = D.shd.maxPerStat;
  const cats = Object.entries(D.shd.categories).map(([cat, stats]) => {
    const total = stats.reduce((s, k) => s + (Number(build.shd[k]) || 0), 0);
    const rows = stats.map((stat) => {
      const pts = Number(build.shd[stat]) || 0;
      const gain = pts * shdPerPoint(stat);
      return '<div class="watch-row"><span>' + esc(label(stat)) + '</span>'
        + '<input type="number" min="0" max="' + max + '" data-shd="' + stat + '" value="' + pts + '"'
        + ' aria-label="' + esc(label(stat)) + ' points">'
        + '<span class="wv">' + (gain ? '+' + gain.toFixed(1) + (stat === 'armor' || stat === 'health' ? '%' : '%') : '—') + '</span>'
        + '</div>';
    }).join('');
    return '<div class="watch-cat"><span class="eyebrow"><span>' + esc(cat) + '</span>'
      + '<span class="num">' + total + '</span></span>' + rows + '</div>';
  }).join('');
  const spent = Object.keys(D.shd.bonusPerPoint)
    .reduce((sum, stat) => sum + (Number(build.shd[stat]) || 0), 0);
  const ceiling = Object.keys(D.shd.bonusPerPoint).length * max;
  return '<div class="watch-grid">' + cats + '</div>'
    + '<p class="hint" style="margin-top:12px"><span class="num">' + spent + ' / ' + ceiling
    + '</span> points allocated, ' + max + ' per stat. Only the allocation counts here — there is no'
    + ' separate bonus for raw SHD level.</p>';
}

function renderEditor() {
  const build = activeBuild();
  if (!build) return;
  const ev = evaluate(build, state.scenario);

  const html = [];
  html.push('<div class="panel"><header><h2>Loadout</h2></header><div class="body">'
    + '<div class="row-label"><span class="eyebrow">Name</span>'
    + '<input type="text" id="build-name" value="' + esc(build.name) + '" aria-label="Loadout name"></div>'
    + '</div></div>');

  html.push('<div class="panel"><header><h2>Gear</h2><span class="spacer"></span>'
    + '<span class="chip">' + int(ev.surv.armor) + ' armor</span></header>'
    + '<div class="body"><div class="slot-grid">'
    + build.gear.map(renderGearSlot).join('') + '</div></div></div>');

  html.push('<div class="panel"><header><h2>Brand &amp; set bonuses</h2></header>'
    + '<div class="body"><div class="bonuslist">' + renderBonuses(ev) + '</div></div></div>');

  html.push('<div class="panel"><header><h2>Weapons</h2></header>'
    + '<div class="body"><div class="slot-grid">'
    + build.weapons.map((w, i) => renderWeaponSlot(w, i, ev)).join('') + '</div></div></div>');

  html.push('<div class="panel"><header><h2>Specialization</h2></header>'
    + '<div class="body">' + renderSpec(build) + '</div></div>');

  html.push('<div class="panel"><header><h2>SHD watch</h2></header>'
    + '<div class="body">' + renderWatch(build) + '</div></div>');

  document.getElementById('editor').innerHTML = html.join('');
}

/* Values are the resting sheet. Where a talent adds to a stat only once it has procced, the
   extra rides alongside as "+n" rather than being folded in — otherwise the panel reads as a
   permanent total the character screen would never show. */
function statRow(key, value, opts) {
  const o = opts || {};
  const flat = FLAT_STATS.has(key) || o.flat;
  const fmt = (v) => (flat ? int(v) : pct(v));
  const bonus = Math.round((o.bonus || 0) * 100) / 100;
  const zero = !value && !bonus;
  const text = o.text != null ? o.text : fmt(value);
  return '<div class="srow' + (zero ? ' zero' : '') + (o.capped ? ' capped' : '') + '">'
    + '<span>' + esc(o.label || label(key)) + '</span>'
    + '<span class="sv">' + text
    + (bonus > 0 ? '<span class="proc">+' + fmt(bonus) + '</span>' : '')
    + '</span></div>';
}

function renderReadout() {
  const build = activeBuild();
  if (!build) return;
  const ev = evaluate(build, state.scenario);
  const s = ev.lead ? ev.lead.stats : ev.base;
  const f = ev.lead ? ev.lead.statsFloor : ev.baseFloor;
  const dmg = ev.lead ? ev.lead.dmg : null;
  const cap = konst('critChanceCap');
  const chc = Math.min(f.critChance || 0, cap);
  const chcPeak = Math.min(s.critChance || 0, cap);
  /** resting value with the procced remainder alongside */
  const row = (key, opts) => statRow(key, f[key] || 0,
    Object.assign({ bonus: (s[key] || 0) - (f[key] || 0) }, opts || {}));

  const floorDps = ev.lead && ev.lead.floor ? ev.lead.floor.sustainedDps : 0;
  const ceilDps = ev.lead && ev.lead.ceiling ? ev.lead.ceiling.sustainedDps : 0;
  const span = ceilDps - floorDps;
  const atPct = span > 0 ? Math.round(((dmg.sustainedDps - floorDps) / span) * 100) : 0;

  const headline = '<div class="hero">'
    + '<span class="k eyebrow">Expected sustained DPS</span>'
    + '<span class="v">' + (dmg ? compact(dmg.sustainedDps) : '—') + '</span>'
    + '<span class="sub">' + (dmg ? int(dmg.perShot) + ' per shot · '
      + esc(dmg.weapon.name) : 'no weapon equipped') + '</span>'
    + (dmg && span > 0
      ? '<div class="range" role="img" aria-label="Floor ' + compact(floorDps)
        + ' to ceiling ' + compact(ceilDps) + ' DPS, expected ' + compact(dmg.sustainedDps) + '">'
        + '<div class="range-track"><div class="range-fill" style="width:' + atPct + '%"></div>'
        + '<div class="range-pin" style="left:' + atPct + '%"></div></div>'
        + '<div class="range-ends"><span>' + compact(floorDps) + ' resting</span>'
        + '<span>' + compact(ceilDps) + ' all procced</span></div>'
        + '</div>'
      : '')
    + '</div>'
    + '<div class="headline">'
    + '<div><span class="k eyebrow">Time to kill</span><span class="v">'
    + (ev.ttk ? ev.ttk.toFixed(2) + 's' : '—') + '</span>'
    + '<span class="sub">' + compact(state.scenario.targetHp) + ' pool</span></div>'
    + '<div><span class="k eyebrow">Effective HP</span><span class="v">' + compact(ev.surv.ehp) + '</span>'
    + '<span class="sub">' + compact(ev.surv.armor) + ' armor</span></div>'
    + '<div><span class="k eyebrow">Skill tier</span><span class="v">' + ev.tier + '</span>'
    + '<span class="sub">' + pct(ev.skillDamageTotal) + ' skill dmg</span></div>'
    + '</div>';

  const offense = [
    row('weaponDamage'),
    row('totalWeaponDamage'),
    statRow('critChance', chc, {
      bonus: chcPeak - chc,
      capped: (s.critChance || 0) > cap,
      label: 'Critical hit chance' + ((s.critChance || 0) > cap ? ' (capped)' : '')
    }),
    row('critDamage'),
    row('headshotDamage'),
    row('damageToArmor'),
    row('damageToHealth'),
    row('damageToOutOfCover'),
    row('weaponHandling')
  ].join('');

  const weaponTypeRows = Object.keys(TYPE_DAMAGE_STAT)
    .map((t) => TYPE_DAMAGE_STAT[t])
    .filter((k) => (s[k] || 0) || (f[k] || 0))
    .map((k) => row(k)).join('');

  const defense = [
    statRow('armorFlat', ev.survFloor.armor, { label: 'Armor', flat: true, bonus: ev.surv.armor - ev.survFloor.armor }),
    statRow('bonusArmorPct', ev.survFloor.bonusArmor, { label: 'Bonus armor', flat: true, bonus: ev.surv.bonusArmor - ev.survFloor.bonusArmor }),
    statRow('healthFlat', ev.survFloor.health, { label: 'Health', flat: true, bonus: ev.surv.health - ev.survFloor.health }),
    statRow('armorFlat', ev.survFloor.ehp, { label: 'Effective HP', flat: true, bonus: ev.surv.ehp - ev.survFloor.ehp }),
    statRow('armorRegen', ev.survFloor.regen, { label: 'Armor regen /s', flat: true, bonus: ev.surv.regen - ev.survFloor.regen }),
    row('armorOnKill'),
    row('incomingRepairs'),
    row('hazardProtection'),
    row('damageToElites')
  ].join('');

  const skills = [
    statRow('skillTier', ev.tier, { text: String(ev.tier) }),
    statRow('skillDamage', ev.skillDamageTotal, { label: 'Skill damage (with tiers)' }),
    row('skillHaste'),
    row('skillRepair'),
    row('skillDuration'),
    row('skillEfficiency'),
    row('statusEffects')
  ].join('');

  const handling = [
    row('reloadSpeed'), row('rateOfFire'), row('magazineSizePct'),
    row('stability'), row('accuracy'), row('optimalRange')
  ].join('');

  document.getElementById('readout').innerHTML =
    '<div class="panel readout-main"><header><h2>Readout</h2></header>' + headline
    + '<div class="body"><p class="hint" style="margin:0">Floor is the resting sheet with nothing'
    + ' procced; ceiling is every stacking talent at max. Expected sits at '
    + Math.round(ev.uptime * 100) + '% uptime — drag it in the scenario bar.</p>'
    + '</div></div>'
    + '<div class="panel"><header><h2>Offense</h2><span class="spacer"></span>'
    + '<span class="chip">resting <span class="proc">+procced</span></span></header>'
    + '<div class="statlist">' + offense
    + (weaponTypeRows ? '<div class="srow group"><span class="eyebrow">By weapon type</span><span></span></div>'
      + weaponTypeRows : '') + '</div></div>'
    + '<div class="panel"><header><h2>Survivability</h2></header><div class="statlist">' + defense + '</div></div>'
    + '<div class="panel"><header><h2>Skills</h2></header><div class="statlist">' + skills + '</div></div>'
    + '<div class="panel"><header><h2>Handling</h2></header><div class="statlist">' + handling + '</div></div>';
}

/* ----------------------------------------------------------- compare matrix */

const MATRIX_ROWS = [
  { section: 'Damage' },
  { key: 'sustained', label: 'Sustained DPS (expected)', get: (e) => e.lead && e.lead.dmg ? e.lead.dmg.sustainedDps : 0, fmt: compact },
  { key: 'floor', label: 'Resting DPS (nothing procced)', get: (e) => e.lead && e.lead.floor ? e.lead.floor.sustainedDps : 0, fmt: compact },
  { key: 'ceiling', label: 'Peak DPS (all stacks)', get: (e) => e.lead && e.lead.ceiling ? e.lead.ceiling.sustainedDps : 0, fmt: compact },
  { key: 'swing', label: 'Ramp multiplier', get: (e) => (e.lead && e.lead.floor && e.lead.floor.sustainedDps > 0
      ? e.lead.ceiling.sustainedDps / e.lead.floor.sustainedDps : 0), fmt: (v) => v ? v.toFixed(2) + '×' : '—' },
  { key: 'burst', label: 'Burst DPS', get: (e) => e.lead && e.lead.dmg ? e.lead.dmg.burstDps : 0, fmt: compact },
  { key: 'pershot', label: 'Damage per shot', get: (e) => e.lead && e.lead.dmg ? e.lead.dmg.perShot : 0, fmt: int },
  { key: 'ttk', label: 'Time to kill', get: (e) => e.ttk || 0, fmt: (v) => v ? v.toFixed(2) + 's' : '—', lowerBetter: true },
  { key: 'rpm', label: 'Effective RPM', get: (e) => e.lead && e.lead.dmg ? e.lead.dmg.rpm : 0, fmt: (v) => Math.round(v) },
  { key: 'mag', label: 'Magazine', get: (e) => e.lead && e.lead.dmg ? e.lead.dmg.mag : 0, fmt: (v) => Math.round(v) },
  { section: 'Damage pools (at peak)' },
  { key: 'awd', label: 'Weapon damage', get: (e) => lead(e).weaponDamage, fmt: pct },
  { key: 'twd', label: 'Total weapon damage', get: (e) => lead(e).totalWeaponDamage, fmt: pct },
  { key: 'chc', label: 'Critical hit chance', get: (e) => Math.min(lead(e).critChance, konst('critChanceCap')), fmt: pct },
  { key: 'chd', label: 'Critical hit damage', get: (e) => lead(e).critDamage, fmt: pct },
  { key: 'hsd', label: 'Headshot damage', get: (e) => lead(e).headshotDamage, fmt: pct },
  { key: 'dta', label: 'Damage to armor', get: (e) => lead(e).damageToArmor, fmt: pct },
  { key: 'dth', label: 'Damage to health', get: (e) => lead(e).damageToHealth, fmt: pct },
  { key: 'dtoc', label: 'Damage out of cover', get: (e) => lead(e).damageToOutOfCover, fmt: pct },
  { section: 'Survivability' },
  { key: 'armor', label: 'Armor', get: (e) => e.surv.armor, fmt: int },
  { key: 'health', label: 'Health', get: (e) => e.surv.health, fmt: int },
  { key: 'bonusArmor', label: 'Bonus armor (at peak)', get: (e) => e.surv.bonusArmor, fmt: int },
  { key: 'ehp', label: 'Effective HP', get: (e) => e.surv.ehp, fmt: int },
  { key: 'regen', label: 'Armor regen /s', get: (e) => e.surv.regen, fmt: int },
  { key: 'aok', label: 'Armor on kill', get: (e) => e.base.armorOnKill, fmt: pct },
  { key: 'hazard', label: 'Hazard protection', get: (e) => e.base.hazardProtection, fmt: pct },
  { section: 'Skills' },
  { key: 'tier', label: 'Skill tier', get: (e) => e.tier, fmt: (v) => String(v) },
  { key: 'skilldmg', label: 'Skill damage', get: (e) => e.skillDamageTotal, fmt: pct },
  { key: 'haste', label: 'Skill haste', get: (e) => e.base.skillHaste, fmt: pct },
  { key: 'repair', label: 'Skill repair', get: (e) => e.base.skillRepair, fmt: pct },
  { key: 'status', label: 'Status effects', get: (e) => e.base.statusEffects, fmt: pct },
  { section: 'Setup' },
  { key: 'sets', label: 'Gear sets', text: (e) => e.base._sets.map((s) => s.name + ' ×' + s.pieces).join(', ') || '—' },
  { key: 'brands', label: 'Brands', text: (e) => e.base._brands.map((s) => s.name.replace(/\s+(s\.r\.o\.|S\.A\.|GmbH|Ltd|AB|Sp\. z o\.o\.|& Co\.)$/, '') + ' ×' + s.pieces).join(', ') || '—' },
  { key: 'spec', label: 'Specialization', text: (e) => e.build.spec || '—' },
  { key: 'lead', label: 'Lead weapon', text: (e) => e.lead && e.lead.dmg ? e.lead.dmg.weapon.name : '—' },
  { key: 'talents', label: 'Chest / backpack talent', text: (e) => talentNames(e.build) }
];
function lead(e) { return e.lead ? e.lead.stats : e.base; }
function talentNames(build) {
  const pick = (slot) => {
    const g = build.gear[SLOTS.indexOf(slot)];
    const item = itemOf(g);
    const t = GEAR_TALENTS[lockedTalentOf(item) || (g && g.talentId)];
    return t ? t.name : '—';
  };
  return pick('Chest') + ' / ' + pick('Backpack');
}

function renderCompare() {
  const host = document.getElementById('view-compare');
  const chosen = state.compare.length
    ? state.builds.filter((b) => state.compare.indexOf(b.id) >= 0)
    : state.builds.slice(0, 3);
  if (chosen.length < 1) {
    host.innerHTML = '<div class="callout">Tick loadouts in the Build view to line them up here.</div>';
    return;
  }
  const evals = chosen.map((b) => evaluate(b, state.scenario));
  const sc = state.scenario;

  let head = '<thead><tr><th scope="col">Measure</th>'
    + evals.map((e, i) => '<th scope="col"' + (i === 0 ? ' class="baseline-col"' : '') + '>'
      + esc(e.build.name) + (i === 0 ? ' · baseline' : '') + '</th>').join('')
    + '</tr></thead>';

  let body = '<tbody>';
  for (const row of MATRIX_ROWS) {
    if (row.section) {
      body += '<tr class="section"><th scope="row" colspan="' + (evals.length + 1) + '">'
        + esc(row.section) + '</th></tr>';
      continue;
    }
    if (row.text) {
      body += '<tr><th scope="row">' + esc(row.label) + '</th>'
        + evals.map((e) => '<td style="text-align:left;white-space:normal">'
          + esc(row.text(e)) + '</td>').join('') + '</tr>';
      continue;
    }
    const values = evals.map((e) => Number(row.get(e)) || 0);
    const usable = values.filter((v) => v > 0);
    const best = usable.length
      ? (row.lowerBetter ? Math.min.apply(null, usable) : Math.max.apply(null, values))
      : null;
    const baseline = values[0];
    body += '<tr><th scope="row">' + esc(row.label) + '</th>' + values.map((v, i) => {
      const isBest = best != null && v === best && usable.length > 1;
      let delta = '';
      if (i > 0 && baseline > 0 && v > 0) {
        const change = ((v - baseline) / baseline) * 100;
        const good = row.lowerBetter ? change < 0 : change > 0;
        if (Math.abs(change) >= 0.05) {
          delta = '<span class="delta ' + (good ? 'up' : 'down') + '">'
            + (change > 0 ? '+' : '') + change.toFixed(1) + '%</span>';
        }
      }
      return '<td class="' + (isBest ? 'best' : '') + (i === 0 ? ' base' : '') + '">'
        + row.fmt(v) + delta + '</td>';
    }).join('') + '</tr>';
  }
  body += '</tbody>';

  host.innerHTML = '<div class="panel"><header><h2>Side by side</h2><span class="spacer"></span>'
    + '<span class="chip">' + sc.headshotRate + '% headshots</span>'
    + '<span class="chip">' + (sc.target === 'armor' ? 'Armored' : 'Flesh') + '</span>'
    + (sc.outOfCover ? '<span class="chip">Out of cover</span>' : '')
    + (sc.pvp ? '<span class="chip">PvP</span>' : '')
    + '</header><div class="body"><div class="matrix-wrap"><table class="matrix">'
    + head + body + '</table></div>'
    + '<p class="matrix-note">Green marks the best value in the row; percentages compare each loadout'
    + ' against the baseline column. Damage figures use the lead weapon you picked in the scenario bar,'
    + ' so change that to compare the same weapon class across loadouts.</p>'
    + '</div></div>';
}

/* ------------------------------------------------------------- tables view */

function editRow(key, labelText, dflt) {
  const current = ov(key, dflt);
  const changed = String(current) !== String(dflt);
  return '<div class="edit-row' + (changed ? ' changed' : '') + '">'
    + '<span>' + esc(labelText) + (changed ? ' <span class="dflt">was ' + esc(dflt) + '</span>' : '') + '</span>'
    + '<input type="number" step="any" data-override="' + esc(key) + '" data-default="' + esc(dflt) + '"'
    + ' value="' + esc(current) + '" aria-label="' + esc(labelText) + '">'
    + '</div>';
}

function renderTables() {
  const host = document.getElementById('view-tables');
  const q = state.tableFilter.trim().toLowerCase();
  const hit = (text) => !q || String(text).toLowerCase().indexOf(q) >= 0;
  const cards = [];

  if (hit('constants game')) {
    cards.push('<div class="edit-card"><h3>Game constants</h3>'
      + Object.keys(D.constants).map((name) =>
        editRow('const:' + name, name.replace(/([A-Z])/g, ' $1').toLowerCase(), D.constants[name])).join('')
      + '</div>');
  }
  /* 91 attachments x 11 stats is far too much to render at once, so these appear only once you
     filter for one. The source recorded the offensive half and nothing else, which is why so many
     read as "not recorded" — the blanks are gaps in the table, not mods that do nothing. */
  if (state.tableFilter.trim()) {
    let shown = 0, more = false;
    for (const kind of ATTACHMENT_KINDS) {
      for (const att of (D.attachments[kind] || [])) {
        if (!hit(att.name) && !hit(kind)) continue;
        if (shown >= 24) { more = true; break; }
        shown += 1;
        cards.push('<div class="edit-card"><h3>' + esc(att.name)
          + ' <span class="dflt">' + esc(kind) + '</span></h3>'
          + ATTACHMENT_STATS.map((stat) => editRow('att:' + att.id + ':' + stat,
            label(stat) + (stat === 'reloadSeconds' ? ' (seconds)' : ' (%)'),
            (att.modifiers || {})[stat] || 0)).join('')
          + '</div>');
      }
    }
    if (more) {
      cards.push('<div class="edit-card"><h3>More attachments match</h3>'
        + '<p class="dflt">Narrow the filter to reach the rest.</p></div>');
    }
  }

  for (const [setName, def] of Object.entries(D.dynamicSetTalents || {})) {
    if (!hit(setName) && !hit(def.talent) && !hit('talent formula')) continue;
    cards.push('<div class="edit-card"><h3>' + esc(def.talent)
      + ' <span class="dflt">' + esc(setName) + '</span></h3>'
      + Object.keys(def.params).map((k) => editRow('dynset:' + setName + ':' + k,
        k.replace(/([A-Z])/g, ' $1').toLowerCase(), def.params[k])).join('')
      + '<p class="dflt" style="margin:6px 0 0">Hand-modelled: ' + esc(def.note)
      + '. The set\'s chest and backpack talents change these numbers rather than adding'
      + ' a bonus of their own.</p></div>');
  }
  for (const [talentId, def] of Object.entries(D.dynamicTalents || {})) {
    if (!hit(def.name) && !hit(def.item) && !hit('talent formula')) continue;
    cards.push('<div class="edit-card"><h3>' + esc(def.name)
      + ' <span class="dflt">' + esc(def.item) + '</span></h3>'
      + Object.keys(def.params).map((k) => editRow('dyn:' + talentId + ':' + k,
        k.replace(/([A-Z])/g, ' $1').toLowerCase(), def.params[k])).join('')
      + '<p class="dflt" style="margin:6px 0 0">Hand-modelled: this talent reads your equipped'
      + ' cores, so it is computed rather than stored as a flat bonus.</p></div>');
  }
  if (hit('gear slot layout attributes')) {
    cards.push('<div class="edit-card"><h3>Attribute lines per slot</h3>'
      + SLOTS.map((slot) => editRow('slotattrs:' + slot, slot, D.slotAttributeSlots[slot])).join('')
      + '<p class="dflt" style="margin:6px 0 0">Secondary rolls on top of the core. Mod slots come'
      + ' from each item, not from here.</p></div>');
  }
  if (hit('shd watch')) {
    cards.push('<div class="edit-card"><h3>SHD watch per point</h3>'
      + Object.keys(D.shd.bonusPerPoint).map((stat) =>
        editRow('shd:' + stat, label(stat), D.shd.bonusPerPoint[stat])).join('')
      + '</div>');
  }

  const capGroups = [
    ['Gear core attributes', D.gearCoreAttributes],
    ['Gear attributes', D.gearAttributes],
    ['Gear mods', D.mods],
    ['Weapon attributes', D.weaponAttributes],
    ['Prototype attributes', D.prototypeGearAttributes]
  ];
  for (const [title, defs] of capGroups) {
    const rows = defs.filter((def) => hit(title) || hit(def.name));
    if (!rows.length) continue;
    cards.push('<div class="edit-card"><h3>' + esc(title) + '</h3>'
      + rows.map((def) => editRow('cap:' + def.id, def.name, def.maxValue)).join('') + '</div>');
  }

  for (const name of Object.keys(D.brands).sort()) {
    if (!hit(name) && !hit('brand')) continue;
    const bonuses = D.brands[name].bonuses;
    cards.push('<div class="edit-card"><h3>' + esc(name) + '</h3>'
      + Object.keys(bonuses).sort().map((n) =>
        editRow('brand:' + name + ':' + n, n + ' pc · ' + label(bonuses[n].statType), bonuses[n].value)).join('')
      + '</div>');
  }

  for (const name of Object.keys(D.gearSets).sort()) {
    if (!hit(name) && !hit('gear set')) continue;
    const set = D.gearSets[name];
    const rows = [];
    for (const n of Object.keys(set.bonuses).sort()) {
      const tier = Array.isArray(set.bonuses[n]) ? set.bonuses[n] : [set.bonuses[n]];
      tier.forEach((b, i) => {
        if (!b.statType) return;
        rows.push(editRow('set:' + name + ':' + n + ':' + i, n + ' pc · ' + label(b.statType), b.value));
      });
    }
    cards.push('<div class="edit-card"><h3>' + esc(name)
      + (set.talentName ? ' <span class="dflt">' + esc(set.talentName) + '</span>' : '') + '</h3>'
      + rows.join('') + '</div>');
  }

  const changedCount = Object.keys(overrides).length;
  host.innerHTML = '<div class="callout"><strong>These are the numbers the engine uses.</strong> '
    + 'They were read off community tables current to ' + esc(D.dataVersion)
    + ', not from the game files, so a tuning pass can leave one stale. Edit any value here and every'
    + ' loadout recalculates — your edits are saved with your loadouts.<br><br>'
    + '<strong>Weapon attachments are the weakest part of this table.</strong> The source recorded'
    + ' only their offensive stats, so the accuracy, stability and handling most mods actually'
    + ' grant are missing, and many read as "not recorded". Filter by an attachment name to'
    + ' correct one.</div>'
    + '<div class="panel"><header><h2>Tables</h2><span class="spacer"></span>'
    + '<span class="chip">' + changedCount + ' edited</span>'
    + '<button class="ghost" id="btn-reset-tables"' + (changedCount ? '' : ' disabled') + '>Reset all</button>'
    + '</header><div class="body stack">'
    + '<div class="tbl-filter"><label for="tbl-q">Filter</label>'
    + '<input type="text" id="tbl-q" value="' + esc(state.tableFilter) + '"'
    + ' placeholder="brand, gear set, attribute…"></div>'
    + '<div class="edit-grid">' + (cards.length ? cards.join('')
      : '<p class="hint">Nothing matches that filter.</p>') + '</div>'
    + '</div></div>';
}

function renderCredits() {
  document.getElementById('credits').innerHTML =
    'Reference tables current to ' + esc(D.dataVersion) + '. '
    + 'Item, talent and specialization data compiled from the MIT-licensed community projects '
    + '<a href="https://github.com/ImThatTeriyaki/Tom-Clancy-The-Division-2-Gear-calculator" rel="noopener">'
    + 'Teriyaki&rsquo;s gear calculator</a> and '
    + '<a href="https://github.com/siriusarc7/TD2_GARL" rel="noopener">TD2 GARL</a>, '
    + 'with the damage model following the community-verified bucket formula. '
    + 'An unofficial fan tool — not affiliated with or endorsed by Ubisoft.';
}

function render() {
  renderScenario();
  renderLoadouts();
  if (state.tab === 'build') { renderEditor(); renderReadout(); }
  if (state.tab === 'compare') renderCompare();
  if (state.tab === 'tables') renderTables();
}

function refreshNumbers() {
  renderLoadouts();
  renderReadout();
}

/* -------------------------------------------------------------------- events */

function setTab(tab) {
  state.tab = tab;
  for (const name of ['build', 'compare', 'tables']) {
    document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
    document.getElementById('view-' + name).hidden = name !== tab;
  }
  render();
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[role="tab"]');
  if (btn) setTab(btn.id.replace('tab-', ''));
});

/* Selects and checkboxes change structure, so they redraw; number and range inputs
   only move figures, so they update the readout and leave the editor's focus alone. */
document.getElementById('editor').addEventListener('change', onEditorInput);
document.getElementById('editor').addEventListener('input', onEditorInput);

function onEditorInput(e) {
  const el = e.target;
  const build = activeBuild();
  if (!build || !el.matches('select, input')) return;
  const isText = el.type === 'number' || el.type === 'range' || el.type === 'text';
  if (e.type === 'input' && !isText) return;
  if (e.type === 'change' && isText && el.type !== 'range') { /* fall through, commit */ }

  const num = (v) => (v === '' ? null : Number(v));
  let structural = false;

  if (el.id === 'build-name') { build.name = el.value; renderLoadouts(); save(); return; }
  if (el.id === 'spec-pick') { build.spec = el.value || null; build.perkTiers = {}; structural = true; }
  if (el.dataset.shd) {
    const max = D.shd.maxPerStat;
    build.shd[el.dataset.shd] = Math.max(0, Math.min(max, num(el.value) || 0));
  }

  if (el.dataset.gear != null) {
    const g = build.gear[Number(el.dataset.gear)];
    const field = el.dataset.field;
    if (field === 'itemId') {
      g.itemId = el.value || null;
      const item = itemOf(g);
      g.talentId = null;
      g.attrs = [{ id: null, value: null }, { id: null, value: null }];
      g.mods = [{ id: null, value: null }, { id: null, value: null }];
      g.talentId = defaultTalentFor(g);
      const cores = coreChoicesFor(g);
      g.coreId = item && item.lockedCore ? (cores[0] ? cores[0].id : null) : g.coreId;
      if (g.coreId && !cores.some((c) => c.id === g.coreId)) g.coreId = cores[0] ? cores[0].id : null;
      g.coreValue = null;
      structural = true;
    } else if (field === 'coreId') { g.coreId = el.value || null; g.coreValue = null; structural = true; }
    else if (field === 'coreValue') { g.coreValue = num(el.value); }
    else if (field === 'talentId') { g.talentId = el.value || null; structural = true; }
    else if (field === 'expertise') { g.expertise = Math.max(0, Math.min(MAX_EXPERTISE, num(el.value) || 0)); structural = e.type === 'change'; }
    else if (el.dataset.attr != null) {
      g.attrs[Number(el.dataset.attr)] = { id: el.value || null, value: null };
      structural = true;
    } else if (el.dataset.attrval != null) {
      g.attrs[Number(el.dataset.attrval)].value = num(el.value);
    } else if (el.dataset.mod != null) {
      g.mods[Number(el.dataset.mod)] = { id: el.value || null, value: null };
      structural = true;
    } else if (el.dataset.modval != null) {
      g.mods[Number(el.dataset.modval)].value = num(el.value);
    }
  }

  if (el.dataset.wpn != null) {
    const w = build.weapons[Number(el.dataset.wpn)];
    const field = el.dataset.field;
    if (field === 'weaponId') {
      w.weaponId = el.value || null;
      w.talentId = null; w.attachments = {}; w.coreValue = null;
      w.attrs = [{ id: null, value: null }, { id: null, value: null }];
      w.talentId = lockedWeaponTalentOf(weaponOf(w));
      structural = true;
    } else if (field === 'coreValue') { w.coreValue = num(el.value); }
    else if (field === 'talentId') { w.talentId = el.value || null; structural = true; }
    else if (field === 'expertise') { w.expertise = Math.max(0, Math.min(MAX_EXPERTISE, num(el.value) || 0)); structural = e.type === 'change'; }
    else if (el.dataset.attachment) { w.attachments[el.dataset.attachment] = el.value || null; structural = true; }
    else if (el.dataset.attr != null) {
      w.attrs[Number(el.dataset.attr)] = { id: el.value || null, value: null };
      structural = true;
    } else if (el.dataset.attrval != null) {
      w.attrs[Number(el.dataset.attrval)].value = num(el.value);
    }
  }

  save();
  if (structural) { renderEditor(); renderReadout(); renderLoadouts(); renderScenario(); }
  else refreshNumbers();
}

document.getElementById('editor').addEventListener('click', (e) => {
  const perk = e.target.closest('button[data-perk]');
  if (!perk) return;
  if (perk.disabled) return;
  const build = activeBuild();
  build.perkTiers[perk.dataset.perk] = Number(perk.dataset.tier);
  save();
  renderEditor();
  renderReadout();
  renderLoadouts();
});

document.getElementById('loadouts').addEventListener('click', (e) => {
  const box = e.target.closest('input[data-compare]');
  if (box) {
    e.stopPropagation();
    const id = box.dataset.compare;
    const at = state.compare.indexOf(id);
    if (at >= 0) state.compare.splice(at, 1); else state.compare.push(id);
    save();
    return;
  }
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    state.activeId = pick.dataset.pick;
    save();
    render();
  }
});

document.getElementById('scenario').addEventListener('input', (e) => {
  const sc = state.scenario;
  const el = e.target;
  if (el.id === 'sc-hs') {
    sc.headshotRate = Number(el.value);
    const out = document.querySelector('#scenario .field .eyebrow .num');
    if (out) out.textContent = sc.headshotRate + '%';
  } else if (el.id === 'sc-uptime') {
    sc.buffUptime = Number(el.value);
    const out = document.getElementById('sc-uptime-out');
    if (out) out.textContent = sc.buffUptime + '%';
  } else if (el.id === 'sc-cover') sc.outOfCover = el.checked;
  else if (el.id === 'sc-pvp') sc.pvp = el.checked;
  else if (el.id === 'sc-weapon') sc.weaponIndex = Number(el.value);
  else if (el.id === 'sc-hp') sc.targetHp = Math.max(1000, Number(el.value) || 1000);
  else return;
  save();
  if (state.tab === 'compare') renderCompare(); else refreshNumbers();
});

document.getElementById('scenario').addEventListener('click', (e) => {
  const btn = e.target.closest('#sc-target button');
  if (!btn) return;
  state.scenario.target = btn.dataset.target;
  save();
  renderScenario();
  if (state.tab === 'compare') renderCompare(); else refreshNumbers();
});

document.getElementById('view-tables').addEventListener('input', (e) => {
  if (e.target.id === 'tbl-q') {
    state.tableFilter = e.target.value;
    const grid = document.querySelector('#view-tables .edit-grid');
    const scroll = window.scrollY;
    renderTables();
    document.getElementById('tbl-q').focus();
    window.scrollTo(0, scroll);
    return;
  }
  const key = e.target.dataset.override;
  if (!key) return;
  const dflt = Number(e.target.dataset.default);
  const value = e.target.value === '' ? dflt : Number(e.target.value);
  if (Number.isNaN(value) || value === dflt) delete overrides[key];
  else overrides[key] = value;
  save();
  e.target.closest('.edit-row').classList.toggle('changed', value !== dflt);
});

document.getElementById('view-tables').addEventListener('click', (e) => {
  if (e.target.id !== 'btn-reset-tables') return;
  overrides = {};
  save();
  renderTables();
});

document.getElementById('btn-new').addEventListener('click', () => {
  const b = emptyBuild('Loadout ' + (state.builds.length + 1));
  state.builds.push(b);
  state.activeId = b.id;
  save();
  setTab('build');
});

document.getElementById('btn-dupe').addEventListener('click', () => {
  const src = activeBuild();
  if (!src) return;
  const copy = normalizeBuild(JSON.parse(JSON.stringify(src)));
  copy.id = nextId();
  copy.name = src.name.replace(/\s*\(copy( \d+)?\)$/, '') + ' (copy)';
  state.builds.push(copy);
  state.activeId = copy.id;
  save();
  render();
});

document.getElementById('btn-delete').addEventListener('click', () => {
  if (state.builds.length <= 1) return;
  const id = state.activeId;
  state.builds = state.builds.filter((b) => b.id !== id);
  state.compare = state.compare.filter((c) => c !== id);
  state.activeId = state.builds[0].id;
  save();
  render();
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const json = JSON.stringify(snapshot(), null, 2);
  let saved = false;
  try {
    const downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (downloads) {
      await downloads.save({ filename: 'shd-loadouts.json', data: json });
      saved = true;
    }
  } catch (e) { saved = false; }
  if (!saved) {
    try {
      await navigator.clipboard.writeText(json);
      alert('Loadouts copied to the clipboard as JSON.');
    } catch (e) {
      window.prompt('Copy your loadouts:', json);
    }
  }
});

document.getElementById('btn-import').addEventListener('click', () => {
  const text = window.prompt('Paste loadout JSON:');
  if (!text) return;
  try {
    const data = JSON.parse(text);
    if (!applySnapshot(data)) throw new Error('no builds in that JSON');
    save();
    render();
  } catch (err) {
    alert('That JSON did not contain any loadouts. Paste the full export, including the "builds" list.');
  }
});

/* ----------------------------------------------------------------- startup */

if (!loadLocal()) {
  state.builds = SEEDS.map(buildFromSpec);
  state.activeId = state.builds[0].id;
  state.compare = state.builds.map((b) => b.id);
}
renderCredits();
render();
connectCloud();

})();
