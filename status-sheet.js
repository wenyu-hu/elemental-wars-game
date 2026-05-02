/* =============================================
   Elemental Wars – Status Sheet (read-only)

   - DOM overlay opened from HUD chest button or 'I' hotkey.
   - State persisted via saveProgress() under
     progress.statusSheet.
   - Inventory + 6 main equipment slots reference
     items defined in items.js by id.  Other lists
     (pets / spells / arrows / abilities …) keep
     their own freeform entries.
   - Clicking an inventory cell or an equipment
     card opens a slide-in sidebar with full detail
     and an Equip / Unequip button.
   ============================================= */
(function () {
  'use strict';

  const SCHEMA          = 2;
  const INVENTORY_SLOTS = 32;

  // ── Default schema ────────────────────────────
  function defaultSheet() {
    const equip = {};
    const types = window.itemRegistry ? window.itemRegistry.types : {};
    for (const t of Object.values(types)) {
      if (t.slot) equip[t.slot] = { itemId: null, enchantments: [] };
    }
    return {
      _schema: SCHEMA,
      username: '',
      playerId: '',
      level:   0,
      tokens:  0,
      booster: 0,
      power:   0,
      hp: { current: 0, max: 0 },
      equipment: equip,                         // { meleeWeapon: { itemId, enchantments }, ... }
      pets:        [],                          // [{ name }]
      extensions:  [],                          // [{ name, appliedTo }]
      accessories: { necklace: '', necklaceEffect: '', bracelet: '', braceletEffect: '', ring: '', ringEffect: '' },
      gems:        { normal: [], mega: [] },
      arrows:      [],                          // [{ name, qty }]
      spells:      [],                          // [{ name, level }]
      inventory:   new Array(INVENTORY_SLOTS).fill(null),  // [{ itemId, count } | null]
      abilities:   [],                          // [{ name, level }]
      activeEffects: [],                        // [{ name, effect, duration, expiresAt }]
    };
  }

  // ── State + persistence ───────────────────────
  let state = defaultSheet();

  function loadFromProgress() {
    // Guests have no persisted state to load — keep whatever is in
    // memory.  Wiping unconditionally to defaultSheet() before the
    // currentUser() check would silently clear a guest's awarded
    // items every time the inventory opens (and again on close,
    // since render reads `state` and would show empty slots).
    if (typeof currentUser !== 'function') return;
    const u = currentUser();
    if (!u) return;
    state = defaultSheet();
    const saved = u && u.progress && u.progress.statusSheet;
    if (!saved) return;
    if (saved._schema !== SCHEMA) {
      // Old (v1) format had inventory entries with `name`/`emoji` and equipment
      // with embedded stats.  Drop those and keep the freeform list data so the
      // user doesn't lose pets / spells / etc. when migrating.
      const safe = defaultSheet();
      safe.tokens   = saved.tokens   || 0;
      safe.booster  = saved.booster  || 0;
      safe.power    = saved.power    || 0;
      safe.level    = saved.level    || 0;
      safe.hp       = saved.hp       || { current: 0, max: 0 };
      safe.username = saved.username || '';
      safe.playerId = saved.playerId || '';
      if (Array.isArray(saved.pets))       safe.pets       = saved.pets;
      if (Array.isArray(saved.extensions)) safe.extensions = saved.extensions;
      if (saved.accessories) safe.accessories = { ...safe.accessories, ...saved.accessories };
      if (saved.gems && saved.gems.normal) safe.gems.normal = saved.gems.normal;
      if (saved.gems && saved.gems.mega)   safe.gems.mega   = saved.gems.mega;
      if (Array.isArray(saved.arrows))    safe.arrows    = saved.arrows;
      if (Array.isArray(saved.spells))    safe.spells    = saved.spells;
      if (Array.isArray(saved.abilities)) safe.abilities = saved.abilities;
      if (Array.isArray(saved.activeEffects)) safe.activeEffects = saved.activeEffects;
      state = safe;
      persist();   // write migrated state immediately
      return;
    }
    state = mergeDeep(defaultSheet(), saved);
    // Make sure inventory length is exactly INVENTORY_SLOTS.
    if (!Array.isArray(state.inventory)) state.inventory = [];
    state.inventory.length = INVENTORY_SLOTS;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      if (state.inventory[i] === undefined) state.inventory[i] = null;
    }
  }

  function persist() {
    if (typeof saveProgress === 'function') saveProgress({ statusSheet: state });
    if (overlayEl && !overlayEl.classList.contains('hidden')) render();
  }

  function mergeDeep(base, patch) {
    if (Array.isArray(patch)) return patch.slice();
    if (patch && typeof patch === 'object') {
      const out = { ...base };
      for (const k of Object.keys(patch)) {
        out[k] = mergeDeep(base ? base[k] : undefined, patch[k]);
      }
      return out;
    }
    return patch === undefined ? base : patch;
  }

  // ── Stat / identity API ──────────────────────
  function setStat(path, value) {
    const parts = path.split('.');
    let obj = state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    persist();
  }
  function addStat(path, delta) {
    const parts = path.split('.');
    let obj = state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    const key = parts[parts.length - 1];
    obj[key] = (Number(obj[key]) || 0) + delta;
    persist();
  }
  function setIdentity({ username, playerId }) {
    if (username !== undefined) state.username = username;
    if (playerId !== undefined) state.playerId = playerId;
    persist();
  }
  function reset() { state = defaultSheet(); persist(); }
  function getState() { return state; }

  // ── Item / equip API ─────────────────────────
  function ensureRegistry() {
    if (!window.itemRegistry) throw new Error('itemRegistry not loaded — make sure items.js is included before status-sheet.js');
  }

  // Add `count` of `itemId` to inventory.  Stacks if the item already exists,
  // otherwise drops into the first empty slot.  Returns true if it fit.
  function giveItem(itemId, count) {
    ensureRegistry();
    const item = window.itemRegistry.get(itemId);
    if (!item) return false;
    const n = Number(count) || 1;
    const existing = state.inventory.find(s => s && s.itemId === itemId);
    if (existing) {
      existing.count = (Number(existing.count) || 0) + n;
      persist();
      return true;
    }
    const emptyIdx = state.inventory.findIndex(s => s == null);
    if (emptyIdx === -1) return false;
    state.inventory[emptyIdx] = { itemId, count: n };
    persist();
    return true;
  }

  // Remove `count` of `itemId` from inventory (auto-stack-aware).  Returns
  // the actual number removed.  If count omitted, removes one whole stack.
  function takeItem(itemId, count) {
    const idx = state.inventory.findIndex(s => s && s.itemId === itemId);
    if (idx === -1) return 0;
    const slot = state.inventory[idx];
    const want = count === undefined ? slot.count : Number(count);
    if (want >= slot.count) {
      const removed = slot.count;
      state.inventory[idx] = null;
      persist();
      return removed;
    }
    slot.count -= want;
    persist();
    return want;
  }

  // Equip item (by id) to its proper slot.  If the slot is occupied, the
  // currently equipped item goes back to the inventory (auto-swap).
  // Source item (if it came from inventory) is removed from inventory.
  function equip(itemId) {
    ensureRegistry();
    const item = window.itemRegistry.get(itemId);
    if (!item || !item.equippable) return false;
    const slotKey = window.itemRegistry.types[item.type].slot;
    const slot = state.equipment[slotKey];
    const previous = slot.itemId;

    // Pull from inventory if present (decrement count or remove slot).
    const invIdx = state.inventory.findIndex(s => s && s.itemId === itemId);
    if (invIdx !== -1) {
      const stack = state.inventory[invIdx];
      if (stack.count > 1) stack.count -= 1;
      else                 state.inventory[invIdx] = null;
    }

    // Move previously-equipped item back to inventory.
    if (previous) {
      const dest = state.inventory.findIndex(s => s == null);
      if (dest !== -1) state.inventory[dest] = { itemId: previous, count: 1 };
    }

    slot.itemId = itemId;
    persist();
    return true;
  }

  // Award an item to the player.  If the item is equippable AND its slot
  // is empty, it auto-equips.  Otherwise it goes to the inventory.
  // Returns 'equipped' | 'inventory' | false.
  function award(itemId, count) {
    ensureRegistry();
    const item = window.itemRegistry.get(itemId);
    if (!item) return false;
    const n = Math.max(1, Number(count) || 1);
    if (item.equippable) {
      const slotKey = window.itemRegistry.types[item.type].slot;
      const slot    = state.equipment[slotKey];
      if (slot && !slot.itemId) {
        slot.itemId = itemId;
        // Any extras (count > 1) drop into inventory.
        if (n > 1) giveItem(itemId, n - 1);
        persist();
        return 'equipped';
      }
    }
    return giveItem(itemId, n) ? 'inventory' : false;
  }

  // Strip every copy of `itemId` from equipment + inventory.  Used by
  // the chest-cinematic migration to clean test-run loot off saves that
  // pre-date the chest update.
  function removeItemEverywhere(itemId) {
    let removed = 0;
    for (const slot of Object.values(state.equipment || {})) {
      if (slot && slot.itemId === itemId) { slot.itemId = null; removed++; }
    }
    for (let i = 0; i < state.inventory.length; i++) {
      const cell = state.inventory[i];
      if (cell && cell.itemId === itemId) { state.inventory[i] = null; removed++; }
    }
    if (removed) persist();
    return removed;
  }

  // Unequip whatever's in the given slot, returning it to inventory.
  function unequip(slotKey) {
    const slot = state.equipment[slotKey];
    if (!slot || !slot.itemId) return false;
    const itemId = slot.itemId;
    slot.itemId = null;
    const dest = state.inventory.findIndex(s => s == null);
    if (dest !== -1) state.inventory[dest] = { itemId, count: 1 };
    persist();
    return true;
  }

  // Consume one of `itemId` from inventory.  Pushes the item's effect+duration
  // onto activeEffects with an expiry timestamp.  Returns true on success.
  function consume(itemId) {
    ensureRegistry();
    const item = window.itemRegistry.get(itemId);
    if (!item) return false;
    const typeDef = window.itemRegistry.types[item.type];
    if (!typeDef || !typeDef.consumable) return false;
    if (takeItem(itemId, 1) === 0) return false;
    const dur = Number(item.stats.duration) || 0;
    state.activeEffects.push({
      name:     item.name,
      effect:   item.stats.effect || '',
      duration: dur,
      expiresAt: dur > 0 ? Date.now() + dur * 1000 : 0,
    });
    persist();
    return true;
  }

  // Drop expired active effects.  Called before any render.
  function pruneEffects() {
    const now = Date.now();
    const before = state.activeEffects.length;
    state.activeEffects = state.activeEffects.filter(e => !e.expiresAt || e.expiresAt > now);
    if (state.activeEffects.length !== before && typeof saveProgress === 'function') {
      saveProgress({ statusSheet: state });
    }
  }

  function addEnchantment(slotKey, name, level) {
    const slot = state.equipment[slotKey];
    if (!slot) return;
    slot.enchantments.push({ name, level: level || '' });
    persist();
  }

  // ── Freeform list APIs (unchanged) ───────────
  function addArrow(name, qty) {
    const found = state.arrows.find(a => a.name === name);
    if (found) found.qty = (Number(found.qty) || 0) + qty;
    else       state.arrows.push({ name, qty });
    persist();
  }
  function addSpell(name, level) {
    if (!state.spells.some(s => s.name === name)) state.spells.push({ name, level: level || '' });
    persist();
  }
  function addAbility(name, level) {
    if (state.abilities.length >= 5) return;
    if (state.abilities.some(a => a.name === name)) return;
    state.abilities.push({ name, level: level || '' });
    persist();
  }
  function addPet(name) {
    if (!state.pets.some(p => p.name === name)) state.pets.push({ name });
    persist();
  }
  function addExtension(name, appliedTo) {
    state.extensions.push({ name, appliedTo: appliedTo || '' });
    persist();
  }
  function setAccessory(slot, name, effect) {
    state.accessories[slot]            = name   || '';
    state.accessories[slot + 'Effect'] = effect || '';
    persist();
  }
  function addGem(name)  { state.gems.normal.push({ name }); persist(); }
  function addMegaGem({ type, qty, prime, outline }) {
    state.gems.mega.push({ type, qty: qty || 1, prime: !!prime, outline: outline || '' });
    persist();
  }

  // ── DOM rendering ────────────────────────────
  let overlayEl   = null;
  let escHandler  = null;
  let onCloseCb   = null;

  // What's showing in the sidebar? Either an inventory slot or an equip slot.
  // selection = { kind: 'inventory', index } | { kind: 'equipment', slotKey } | null
  let selection = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'ew-status-overlay';
    overlayEl.className = 'hidden';
    overlayEl.innerHTML = `
      <div class="ew-sheet-shell">
        <div class="ew-sheet-card">
          <button class="ew-close-btn" id="ew-status-close" title="Close (Esc / I)">&times;</button>

          <section class="sheet-header">
            <div class="header-left">
              <div class="stat-badges">
                <div class="stat-badge" title="Tokens">
                  <span class="badge-circle badge-tokens">T</span>
                  <span class="stat-readout" id="ew-tokens">0</span>
                </div>
                <div class="stat-badge" title="Booster Points">
                  <span class="badge-circle badge-booster">B</span>
                  <span class="stat-readout" id="ew-booster">0</span>
                </div>
                <div class="stat-badge" title="Power">
                  <span class="badge-circle badge-power">P</span>
                  <span class="stat-readout" id="ew-power">0</span>
                </div>
              </div>
            </div>
            <div class="header-right">
              <div class="username-display" id="ew-username"></div>
              <span class="player-id-display" id="ew-playerid"></span>
              <div class="level-display"><span>Lv.</span><span class="stat-readout" id="ew-level">0</span></div>
            </div>
          </section>

          <section class="health-section">
            <span class="health-icon">&#10084;</span>
            <div class="health-bar-container">
              <div class="health-bar-fill" id="ew-hp-fill"></div>
              <div class="health-bar-text">
                <span id="ew-hp-cur">0</span><span>/</span><span id="ew-hp-max">0</span><span>HP</span>
              </div>
            </div>
          </section>

          <section class="equipment-grid" id="ew-equipment-grid"></section>
          <section class="lists-section"   id="ew-lists-section"></section>

          <section class="inventory-section">
            <h3>Inventory</h3>
            <div class="inventory-grid" id="ew-inventory-grid"></div>
          </section>

          <section class="abilities-section">
            <h3>Abilities <span class="ability-count" id="ew-ability-count">(0/5)</span></h3>
            <div id="ew-abilities-list"></div>
          </section>
        </div>

        <aside class="ew-sidebar hidden" id="ew-sidebar"></aside>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.querySelector('#ew-status-close').addEventListener('click', closeStatusSheet);
    overlayEl.addEventListener('click', e => {
      if (e.target === overlayEl) closeStatusSheet();
    });
    // Stop pointer leak through to Phaser canvas.
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(evt => {
      overlayEl.querySelector('.ew-sheet-shell').addEventListener(evt, e => e.stopPropagation());
    });
    return overlayEl;
  }

  // ── Render: equipment cards ──────────────────
  function renderEquipCard(slotKey) {
    const types = window.itemRegistry.types;
    // Find the type def for this slot.
    let typeKey = null, typeDef = null;
    for (const [k, d] of Object.entries(types)) {
      if (d.slot === slotKey) { typeKey = k; typeDef = d; break; }
    }
    if (!typeDef) return '';

    const eq      = state.equipment[slotKey] || { itemId: null, enchantments: [] };
    const item    = eq.itemId ? window.itemRegistry.get(eq.itemId) : null;
    const isSel   = selection && selection.kind === 'equipment' && selection.slotKey === slotKey;
    const rarCls  = item && item.rarity ? `rarity-${item.rarity}` : '';

    const iconHtml = item && item.iconSrc
      ? `<img class="equip-icon-img" src="${escapeHtml(item.iconSrc)}" alt="">`
      : `<span class="equip-icon">${typeDef.icon}</span>`;

    const headerName = item
      ? `<span class="equip-name has-value">${escapeHtml(item.name)}</span>`
      : `<span class="equip-name">${escapeHtml(typeDef.label)}</span>`;

    const rarityTag = item && item.rarity
      ? `<span class="equip-rarity-tag rarity-${item.rarity}">${escapeHtml(window.itemRegistry.rarityLabel[item.rarity])}</span>`
      : '';

    let statsHtml = '';
    for (const f of typeDef.stats) {
      const v = item ? item.stats[f.key] : '';
      const empty = v === undefined || v === null || v === '';
      statsHtml += `<div class="stat-row"><label>${escapeHtml(f.label)}</label><span class="stat-val ${empty ? 'empty' : ''}">${empty ? '\u2014' : escapeHtml(String(v))}${f.unit && !empty ? ` <span class="stat-unit">${f.unit}</span>` : ''}</span></div>`;
    }

    const enchants  = eq.enchantments || [];
    const enchHtml  = enchants.length
      ? enchants.map(e => `<div class="list-item"><span>${escapeHtml(e.name)}</span><span class="list-item-sub">${escapeHtml(e.level || '')}</span></div>`).join('')
      : `<div class="empty-line">No enchantments</div>`;

    return `
      <div class="equip-card ${rarCls} ${isSel ? 'is-selected' : ''}" data-slot="${slotKey}">
        <div class="equip-header">
          ${iconHtml}
          ${headerName}
          ${rarityTag}
        </div>
        <div class="equip-stats">${statsHtml}</div>
        <div class="enchantments-section">
          <span class="enchant-label">Enchantments</span>
          <div class="enchant-list">${enchHtml}</div>
        </div>
      </div>`;
  }

  // ── Render: lists section (pets, ext, acc, gems, arrows, spells) ──
  function renderListsSection() {
    const acc = state.accessories || {};
    const accSlot = (slot, label) => {
      const name   = acc[slot]            || '';
      const effect = acc[slot + 'Effect'] || '';
      return `
        <div class="accessory-slot">
          <label>${label}</label>
          <span class="acc-name ${name ? '' : 'empty'}">${name ? escapeHtml(name) : '\u2014'}</span>
          <div class="acc-effect ${effect ? '' : 'empty'}">${effect ? escapeHtml(effect) : 'No effect'}</div>
        </div>`;
    };
    const petsHtml = state.pets.length
      ? state.pets.map(p => `<div class="list-item"><span>${escapeHtml(p.name)}</span></div>`).join('')
      : `<div class="empty-line">No pets</div>`;
    const extHtml = state.extensions.length
      ? state.extensions.map(e => `<div class="list-item"><span>${escapeHtml(e.name)}</span><span class="list-item-sub">${escapeHtml(e.appliedTo || '')}</span></div>`).join('')
      : `<div class="empty-line">No extensions</div>`;
    const normGem = state.gems.normal.length
      ? state.gems.normal.map(g => `<div class="list-item"><span>${escapeHtml(g.name)}</span></div>`).join('')
      : `<div class="empty-line">No gems</div>`;
    const megaGem = state.gems.mega.length
      ? state.gems.mega.map(g => `<div class="list-item"><span>${escapeHtml(g.type)}${g.prime ? ` (${escapeHtml(g.outline)} prime)` : ''}</span><span class="list-item-sub">\u00d7${g.qty}</span></div>`).join('')
      : `<div class="empty-line">No mega gems</div>`;
    const arrowHtml = state.arrows.length
      ? state.arrows.map(a => `<div class="list-item"><span>${escapeHtml(a.name)}</span><span class="list-item-sub">\u00d7${a.qty}</span></div>`).join('')
      : `<div class="empty-line">No arrows</div>`;
    const spellHtml = state.spells.length
      ? state.spells.map(s => `<div class="list-item"><span>${escapeHtml(s.name)}</span><span class="list-item-sub">${escapeHtml(s.level || '')}</span></div>`).join('')
      : `<div class="empty-line">No spells</div>`;
    const now = Date.now();
    const fxHtml = state.activeEffects.length
      ? state.activeEffects.map(e => {
          const remain = e.expiresAt ? Math.max(0, Math.ceil((e.expiresAt - now) / 1000)) : '∞';
          const sub = (e.effect ? escapeHtml(e.effect) + ' · ' : '') + (e.expiresAt ? `${remain} sec left` : 'permanent');
          return `<div class="list-item"><span>${escapeHtml(e.name)}</span><span class="list-item-sub">${sub}</span></div>`;
        }).join('')
      : `<div class="empty-line">No active effects</div>`;
    return `
      <div class="list-card"><h3><span class="list-icon">\uD83D\uDC31</span> Pets</h3><div class="list-items">${petsHtml}</div></div>
      <div class="list-card"><h3><span class="list-icon">\uD83E\uDDF3</span> Extensions</h3><div class="list-items">${extHtml}</div></div>
      <div class="list-card"><h3><span class="list-icon">\uD83D\uDCFF</span> Accessories</h3>
        <div class="accessory-slots">
          ${accSlot('necklace', 'Necklace')}
          ${accSlot('bracelet', 'Bracelet')}
          ${accSlot('ring',     'Ring')}
        </div>
      </div>
      <div class="list-card"><h3><span class="list-icon">\uD83D\uDC8E</span> Gems</h3>
        <div class="gem-subcategory"><div class="gem-sub-title">Normal</div><div class="list-items">${normGem}</div></div>
        <div class="gem-subcategory"><div class="gem-sub-title">Mega</div><div class="list-items">${megaGem}</div></div>
      </div>
      <div class="list-card"><h3><span class="list-icon">\uD83C\uDFF9</span> Arrows</h3><div class="list-items">${arrowHtml}</div></div>
      <div class="list-card"><h3><span class="list-icon">\uD83E\uDD94</span> Spells</h3><div class="list-items">${spellHtml}</div></div>
      <div class="list-card"><h3><span class="list-icon">\u2728</span> Active Effects</h3><div class="list-items">${fxHtml}</div></div>
    `;
  }

  function renderInventory() {
    let html = '';
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = state.inventory[i];
      if (!slot) {
        html += `<div class="inv-cell empty" data-idx="${i}"></div>`;
        continue;
      }
      const item = window.itemRegistry.get(slot.itemId);
      if (!item) {
        // Stale entry — render placeholder (shouldn't normally happen).
        html += `<div class="inv-cell" data-idx="${i}" title="${escapeHtml(slot.itemId)}"><span class="inv-name">?</span></div>`;
        continue;
      }
      const cls = ['inv-cell'];
      if (item.rarity) cls.push('rarity-' + item.rarity);
      if (selection && selection.kind === 'inventory' && selection.index === i) cls.push('is-selected');
      const inner = item.iconSrc
        ? `<img class="inv-icon" src="${escapeHtml(item.iconSrc)}" alt="">`
        : `<span class="inv-name">${escapeHtml(item.name)}</span>`;
      const cnt = (Number(slot.count) || 1) > 1 ? `<span class="inv-count">${slot.count}</span>` : '';
      html += `<div class="${cls.join(' ')}" data-idx="${i}" title="${escapeHtml(item.name)}">${inner}${cnt}</div>`;
    }
    return html;
  }

  function renderAbilities() {
    return state.abilities.length
      ? state.abilities.map(a => `<div class="list-item"><span>${escapeHtml(a.name)}</span><span class="list-item-sub">${escapeHtml(a.level || '')}</span></div>`).join('')
      : `<div class="empty-line">No abilities</div>`;
  }

  // ── Sidebar render ───────────────────────────
  function renderSidebar() {
    const sb = overlayEl.querySelector('#ew-sidebar');
    if (!selection) { sb.classList.add('hidden'); sb.innerHTML = ''; return; }

    const reg = window.itemRegistry;
    let item = null, slotKey = null, isEquipped = false, fromInventory = false;

    if (selection.kind === 'inventory') {
      const slot = state.inventory[selection.index];
      if (!slot) { sb.classList.add('hidden'); sb.innerHTML = ''; selection = null; return; }
      item = reg.get(slot.itemId);
      fromInventory = true;
    } else {
      slotKey = selection.slotKey;
      const eq = state.equipment[slotKey];
      item = eq && eq.itemId ? reg.get(eq.itemId) : null;
      isEquipped = !!item;
    }

    if (!item) {
      // Empty equipment slot: show category-only detail.
      let typeDef = null;
      for (const d of Object.values(reg.types)) if (d.slot === slotKey) { typeDef = d; break; }
      sb.classList.remove('hidden');
      sb.innerHTML = `
        <button class="ew-sidebar-close" title="Close">&times;</button>
        <div class="sb-empty">
          <div class="sb-icon-large">${typeDef ? typeDef.icon : '?'}</div>
          <div class="sb-name">${typeDef ? escapeHtml(typeDef.label) : ''}</div>
          <div class="sb-empty-msg">No item equipped</div>
        </div>`;
      sb.querySelector('.ew-sidebar-close').addEventListener('click', () => { selection = null; render(); });
      return;
    }

    const typeDef = reg.types[item.type];
    const rarityCls   = item.rarity ? `rarity-${item.rarity}` : '';
    const rarityLabel = item.rarity ? reg.rarityLabel[item.rarity] : '';

    // Slot info — what's currently in this item's slot, if any?
    let actionBtn = '';
    if (item.equippable) {
      const occupiedBy = state.equipment[typeDef.slot] && state.equipment[typeDef.slot].itemId;
      if (isEquipped) {
        actionBtn = `<button class="ew-equip-btn unequip" data-action="unequip">Unequip</button>`;
      } else if (fromInventory) {
        actionBtn = occupiedBy && occupiedBy !== item.id
          ? `<button class="ew-equip-btn" data-action="equip">Equip (swaps current)</button>`
          : `<button class="ew-equip-btn" data-action="equip">Equip</button>`;
      }
    } else if (typeDef.consumable && fromInventory) {
      actionBtn = `<button class="ew-equip-btn consume" data-action="consume">Consume</button>`;
    }

    let statsHtml = '';
    for (const f of typeDef.stats) {
      const v = item.stats[f.key];
      const empty = v === undefined || v === null || v === '';
      statsHtml += `<div class="sb-stat-row"><span class="sb-stat-label">${escapeHtml(f.label)}</span><span class="sb-stat-val ${empty ? 'empty' : ''}">${empty ? '\u2014' : escapeHtml(String(v))}${f.unit && !empty ? ` <span class="stat-unit">${f.unit}</span>` : ''}</span></div>`;
    }

    const iconHtml = item.iconSrc
      ? `<img class="sb-icon-large" src="${escapeHtml(item.iconSrc)}" alt="">`
      : `<div class="sb-icon-large">${typeDef.icon}</div>`;

    sb.classList.remove('hidden');
    sb.innerHTML = `
      <button class="ew-sidebar-close" title="Close">&times;</button>
      ${iconHtml}
      <div class="sb-name ${rarityCls}">${escapeHtml(item.name)}</div>
      <div class="sb-meta">
        ${rarityLabel ? `<span class="sb-rarity ${rarityCls}">${escapeHtml(rarityLabel)}</span>` : ''}
        <span class="sb-type">${escapeHtml(typeDef.label)}</span>
      </div>
      <div class="sb-stats">${statsHtml}</div>
      ${actionBtn}
    `;
    sb.querySelector('.ew-sidebar-close').addEventListener('click', () => { selection = null; render(); });
    const btn = sb.querySelector('.ew-equip-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'equip') {
          equip(item.id);
          selection = { kind: 'equipment', slotKey: typeDef.slot };
        } else if (action === 'unequip') {
          unequip(typeDef.slot);
          selection = { kind: 'equipment', slotKey: typeDef.slot };
        } else if (action === 'consume') {
          consume(item.id);
          // Item gone from inventory; close the sidebar.
          selection = null;
        }
        render();
      });
    }
  }

  // ── Click wiring (rebuilt every render) ──────
  function attachClickHandlers() {
    overlayEl.querySelectorAll('#ew-equipment-grid .equip-card').forEach(el => {
      el.addEventListener('click', () => {
        selection = { kind: 'equipment', slotKey: el.dataset.slot };
        render();
      });
    });
    overlayEl.querySelectorAll('#ew-inventory-grid .inv-cell').forEach(el => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.idx);
        const slot = state.inventory[i];
        if (!slot) { selection = null; render(); return; }
        selection = { kind: 'inventory', index: i };
        render();
      });
    });
  }

  function render() {
    if (!overlayEl) buildOverlay();
    pruneEffects();

    overlayEl.querySelector('#ew-tokens').textContent  = state.tokens  || 0;
    overlayEl.querySelector('#ew-booster').textContent = state.booster || 0;
    overlayEl.querySelector('#ew-power').textContent   = state.power   || 0;
    overlayEl.querySelector('#ew-level').textContent   = state.level   || 0;
    overlayEl.querySelector('#ew-username').textContent = state.username || '';
    overlayEl.querySelector('#ew-playerid').textContent = state.playerId || '';

    const cur = Number(state.hp.current) || 0;
    const max = Number(state.hp.max)     || 0;
    overlayEl.querySelector('#ew-hp-cur').textContent = cur;
    overlayEl.querySelector('#ew-hp-max').textContent = max;
    const fill = overlayEl.querySelector('#ew-hp-fill');
    const pct  = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
    fill.style.width = (pct * 100) + '%';
    fill.style.background = pct > 0.6 ? '#44cc66' : pct > 0.3 ? '#e8c840' : '#e84057';

    const slots = ['meleeWeapon', 'defence', 'rangedWeapon', 'armour', 'artifact', 'transportation'];
    overlayEl.querySelector('#ew-equipment-grid').innerHTML = slots.map(renderEquipCard).join('');
    overlayEl.querySelector('#ew-lists-section').innerHTML  = renderListsSection();
    overlayEl.querySelector('#ew-inventory-grid').innerHTML = renderInventory();
    overlayEl.querySelector('#ew-abilities-list').innerHTML = renderAbilities();
    overlayEl.querySelector('#ew-ability-count').textContent = `(${state.abilities.length}/5)`;

    // Sidebar visibility class on shell so the card can shrink while open.
    const shell = overlayEl.querySelector('.ew-sheet-shell');
    shell.classList.toggle('with-sidebar', !!selection);

    renderSidebar();
    attachClickHandlers();
  }

  // ── Open / close ─────────────────────────────
  function openStatusSheet(opts) {
    opts = opts || {};
    onCloseCb = opts.onClose || null;
    buildOverlay();
    loadFromProgress();
    selection = null;
    render();
    overlayEl.classList.remove('hidden');

    const game = window._ewGame;
    const kb = game && game.input && game.input.keyboard;
    overlayEl._prevKbEnabled = kb ? kb.enabled : null;
    if (kb) kb.enabled = false;

    escHandler = e => {
      if (e.key === 'Escape' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        closeStatusSheet();
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function closeStatusSheet() {
    if (!overlayEl || overlayEl.classList.contains('hidden')) return;
    overlayEl.classList.add('hidden');
    selection = null;
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    const game = window._ewGame;
    const kb = game && game.input && game.input.keyboard;
    if (kb && overlayEl._prevKbEnabled !== null) kb.enabled = overlayEl._prevKbEnabled;
    if (onCloseCb) { const cb = onCloseCb; onCloseCb = null; cb(); }
  }

  function isOpen() { return overlayEl && !overlayEl.classList.contains('hidden'); }

  // ── Expose ───────────────────────────────────
  window.statusSheet = {
    open:    openStatusSheet,
    close:   closeStatusSheet,
    isOpen,
    loadFromProgress,
    reset,
    getState,
    setStat, addStat,
    setIdentity,

    // Item-driven API
    giveItem, takeItem,
    equip,    unequip,
    removeItemEverywhere,
    consume,
    award,
    addEnchantment,

    // Freeform list APIs
    addArrow, addSpell, addAbility, addPet, addExtension,
    setAccessory, addGem, addMegaGem,
  };
})();
