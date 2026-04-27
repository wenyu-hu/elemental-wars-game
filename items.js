/* =============================================
   Elemental Wars – Item Registry
   Central catalogue of every defined item.

   To add an item, append a defineItem({...}) call
   inside the SAMPLE ITEMS section (or wherever you
   like — order doesn't matter), and drop the icon
   PNG into assets/.

   Schema:
     id        unique string id, lowercase_snake
     name      display name (e.g. "Iron Sword")
     iconSrc   path to the inventory icon PNG
     type      one of TYPE_DEFS keys below
     rarity    one of RARITIES below ('' for none)
     stats     object whose keys match the stat
               fields for that type (see TYPE_DEFS)
     equippable  true if the item occupies one of
                 the 6 main equipment slots
   ============================================= */
(function () {
  'use strict';

  // Rarity → CSS colour token (matches status-sheet.css vars).
  const RARITIES = ['common', 'uncommon', 'rare', 'epicRare', 'ultraRare',
                    'legendary', 'mythical', 'elder', 'exclusive'];
  const RARITY_LABEL = {
    common:    'Common',
    uncommon:  'Uncommon',
    rare:      'Rare',
    epicRare:  'Epic Rare',
    ultraRare: 'Ultra Rare',
    legendary: 'Legendary',
    mythical:  'Mythical',
    elder:     'Elder',
    exclusive: 'Exclusive',
  };

  // Each type defines:
  //   label      display name shown on the equip card / sidebar
  //   icon       fallback emoji used when no item is equipped
  //   slot       equipment slot key in state.equipment, or null if not equippable
  //   stats      ordered list of stat fields shown for that type
  //               { key, label, unit? }
  const TYPE_DEFS = {
    meleeWeapon: {
      label: 'Melee Weapon', icon: '\u2694', slot: 'meleeWeapon',
      stats: [
        { key: 'damage',       label: 'Damage' },
        { key: 'attackSpeed',  label: 'Attack Speed', unit: 'sec' },
        { key: 'range',        label: 'Range' },
        { key: 'specialities', label: 'Specialities' },
      ],
    },
    defence: {
      label: 'Defence', icon: '\uD83D\uDEE1', slot: 'defence',
      stats: [
        { key: 'defenceLevel',     label: 'Defence Level' },
        { key: 'maxDurability',    label: 'Max Durability' },
      ],
    },
    rangedWeapon: {
      label: 'Ranged Weapon', icon: '\uD83C\uDFF9', slot: 'rangedWeapon',
      stats: [
        { key: 'projectileSpeed', label: 'Projectile Speed' },
        { key: 'reload',          label: 'Reload', unit: 'sec' },
        { key: 'specialities',    label: 'Specialities' },
      ],
    },
    armour: {
      label: 'Armour', icon: '\u26CF', slot: 'armour',
      stats: [
        { key: 'defenceLevel', label: 'Defence Level' },
        { key: 'specialities', label: 'Specialities' },
      ],
    },
    artifact: {
      label: 'Artifact', icon: '\u2B50', slot: 'artifact',
      stats: [
        { key: 'level',    label: 'Level' },
        { key: 'duration', label: 'Duration', unit: 'sec' },
        { key: 'reload',   label: 'Reload',   unit: 'sec' },
        { key: 'effect',   label: 'Effect' },
      ],
    },
    transportation: {
      label: 'Transportation', icon: '\uD83D\uDE97', slot: 'transportation',
      stats: [
        { key: 'maxHP',  label: 'Max HP' },
      ],
    },
    food: {
      label: 'Food', icon: '\uD83C\uDF4E', slot: null,
      consumable: true,
      stats: [
        { key: 'effect',   label: 'Effect' },
        { key: 'duration', label: 'Duration', unit: 'sec' },
      ],
    },
  };

  const REGISTRY = Object.create(null);

  function defineItem(def) {
    if (!def || !def.id) throw new Error('defineItem requires an id');
    if (!TYPE_DEFS[def.type]) throw new Error(`defineItem: unknown type "${def.type}"`);
    if (def.rarity && !RARITIES.includes(def.rarity)) {
      throw new Error(`defineItem: unknown rarity "${def.rarity}"`);
    }
    REGISTRY[def.id] = {
      id:       def.id,
      name:     def.name      || def.id,
      iconSrc:  def.iconSrc   || '',
      type:     def.type,
      rarity:   def.rarity    || '',
      stats:    def.stats     || {},
      equippable: !!TYPE_DEFS[def.type].slot,
    };
    return REGISTRY[def.id];
  }

  function getItem(id) { return REGISTRY[id] || null; }
  function allItems()  { return Object.values(REGISTRY); }
  function getType(t)  { return TYPE_DEFS[t] || null; }

  // ── Sample items ─────────────────────────────
  // Add new item definitions here.  Drop the matching
  // icon PNG into assets/.  Stats keys must match
  // TYPE_DEFS[type].stats.
  //
  // Example (uncomment after adding assets/iron_sword.png):
  //
  //   defineItem({
  //     id: 'iron_sword',
  //     name: 'Iron Sword',
  //     iconSrc: 'assets/iron_sword.png',
  //     type: 'meleeWeapon',
  //     rarity: 'rare',
  //     stats: { damage: 12, attackSpeed: 1.2, range: 3, specialities: '' },
  //   });

  // ── Expose ───────────────────────────────────
  window.itemRegistry = {
    define:  defineItem,
    get:     getItem,
    all:     allItems,
    type:    getType,
    types:   TYPE_DEFS,
    rarities:     RARITIES,
    rarityLabel:  RARITY_LABEL,
  };
})();
