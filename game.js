// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE = 3;
const TILE  = 32;
const TS    = TILE * SCALE;   // 96px display per tile

// ─────────────────────────────────────────────
//  Basic elements — hotbar abilities unlocked on level-up
// ─────────────────────────────────────────────
// Range is stated in the same "range" unit as melee weapons (Wooden
// Sword = 3); 1 unit = 32px, so a projectile travels range*32 px before
// despawning.  Reload is in ms.  Speed is a display/travel-feel choice,
// not part of the spec — projectiles cross their full range in ~0.5s.
// `scale` is a multiplier on SCALE for the projectile sprite — each
// element's art fills its 32x32 frame differently, so a single shared
// value made fire and water read as much smaller than air.
// `hugsGround` spawns the shot at the player's feet and lets it ride
// over floors (see _wireProjectileObstacles) instead of flying at chest
// height — that's what makes the water shot look like a wave.
const ELEMENT_DEFS = {
  fire:  { icon: 'icon_fire',  damage: 3, range: 10, reload: 3000, speed: 380, scale: 1.2, burst: [0xffd28a, 0xffa640, 0xff6a1f, 0xd83c10], burn: 1 },
  water: { icon: 'icon_water', damage: 2, range: 8,  reload: 2000, speed: 420, scale: 1.2, burst: [0x9be3ff, 0x5cc6ff, 0x2f8fff, 0x1f63dd], hugsGround: true, knockback: 260 },
  // Air's art is only 8x8 inside its 32x32 frame.  scale 2.4 makes the
  // cropped hitbox 8*3*2.4 = 57.6px — the same size the old uncropped
  // full-frame body had at scale 0.6 — so it keeps the generous feel
  // that made it land, but the puff now visibly fills what it hits.
  air:   { icon: 'icon_air',   damage: 1, range: 5,  reload: 500,  speed: 320, scale: 2.4, burst: [0xffffff, 0xe6f4ff, 0xc9e4f7, 0xa9cfe8], knockback: 320 },
  earth: { icon: 'icon_earth', damage: 8, range: 15, reload: 5000, speed: 560, scale: 0.9, burst: [0xc9b083, 0x9c7f4e, 0x6f5a33, 0x4a3c22], hugsGround: true },
};

// ─────────────────────────────────────────────
//  Zombie (EX level)
// ─────────────────────────────────────────────
// Shambles toward the player, telegraphs with a raised-arms wind-up,
// then deals damage on the snap back to idle — so the wind-up is the
// window to back off or hit it first.  Numbers are first-pass and meant
// to be tuned once the EX level's difficulty is settled.
const ZOMBIE_BASE = {
  hp: 10,
  speed: 70,           // slow shamble; player runs at 200
  damage: 5,
  aggroRange: 460,     // starts following
  // Centre-to-centre.  Player half-width is 21 and the zombie's is now
  // ~20, so they touch at ~41 — 68 lets it swing from just under half a
  // tile away, roughly where its arm visually reaches.
  attackRange: 68,
  windupMs: 420,       // arms raised — the telegraph
  recoverMs: 300,      // held idle after the strike
  cooldownMs: 650,     // gap before it can wind up again
  // Knockback exists to interrupt a wind-up, not to reposition the
  // zombie — the stun lasts but the shove is only ~18px.
  knockbackMs: 300,
  knockbackVx: 60,
  // Out of aggro it turns to face the other way on this interval, so a
  // distant zombie reads as alive rather than as scenery.
  idleTurnMinMs: 5000,
  idleTurnMaxMs: 8000,
  // Texture, and the prefix its anims are registered under.
  tex: 'zombie',
  anim: 'zombie',
};

// Variants share the state machine; only these fields differ.
const ZOMBIE_TYPES = {
  normal: { ...ZOMBIE_BASE },
  // Butler: identical stats, but quick on every axis — double the
  // movement speed, half the wind-up telegraph, and half the gap
  // between swings.  Much harder to back away from.
  butler: {
    ...ZOMBIE_BASE,
    speed:      ZOMBIE_BASE.speed      * 2,
    windupMs:   ZOMBIE_BASE.windupMs   / 2,
    cooldownMs: ZOMBIE_BASE.cooldownMs / 2,
    tex:  'zombie_butler',
    anim: 'butler',
  },
};

// ─────────────────────────────────────────────
//  Golden Guard (EX level)
// ─────────────────────────────────────────────
// A tall, slow, heavily-armoured peon.  Raises its spear to telegraph,
// marking where the player stood at that instant; a moment later blue
// lightning falls on that spot.  Standing still through the tell is
// what gets you hit — the bolt does NOT track.
// First-pass numbers, meant to be tuned.
const GUARD = {
  hp: 30,
  speed: 55,            // slower than a zombie's 70 — it's armoured
  damage: 15,
  aggroRange: 560,
  attackRange: 300,     // strikes at range, not in melee
  windupMs: 520,        // spear raised: the dodge window
  strikeDelayMs: 180,   // "a split second after" the attack frame
  recoverMs: 420,
  cooldownMs: 1600,
  // The bolt falls from above the marked spot and damages on contact,
  // so it sweeps the whole column — jumping over it is no longer free.
  strikeFallHeight: 460,
  strikeFallSpeed: 1500,   // ~0.3s from spawn to ground
  strikeLingerMs: 110,     // brief flash on impact, then gone
  knockbackMs: 280,
  knockbackVx: 45,
  knockbackResist: 0.5,   // armoured: shoves land at half strength
  idleTurnMinMs: 5000,
  idleTurnMaxMs: 8000,
};
// Body box in unscaled texture px.  Columns 5-7 are the spear shaft
// (40+px tall) and would balloon the hitbox, so the box covers the
// torso only, x=10..27 / y=10..54 (54 is the feet).  It's off-centre in
// the frame, so the offset is mirrored on flip — Phaser won't do it.
const GUARD_BODY = { x: 10, y: 10, w: 17, h: 44 };

// ─────────────────────────────────────────────
//  Food drops
// ─────────────────────────────────────────────
// Butler zombies only.  Each roll is independent, so one butler can
// drop all three — or nothing.  Drops lie where the butler fell and are
// picked up by walking over them.
const FOOD_DROPS = [
  { id: 'apple',  chance: 0.50, tex: 'food_apple'  },
  { id: 'orange', chance: 0.35, tex: 'food_orange' },
  { id: 'banana', chance: 0.20, tex: 'food_banana' },
];

// ─────────────────────────────────────────────
//  Status effects
// ─────────────────────────────────────────────
// Frame indices into the shared effect-icon sheet.  Only `burning` is
// implemented so far; the rest are drawn from the same sheet the moment
// their mechanic lands, so nothing needs re-wiring then.
const EFFECT_ICON_FRAME = { burning: 0, poisoned: 1, frozen: 2, stunned: 3 };

// Tier tables, indexed 1-5 (index 0 is a hole so `EFFECT_TIERS.burn[3]`
// reads as "Burn III").  Tiers IV and V are reserved for late-game
// equipment — no element applies them.  See element-tree.md.
//
// Burn refreshes; poison stacks.  A lower tier never overwrites a higher
// one, and never refreshes it either — otherwise a cheap fast element
// would sustain an expensive slow one's effect for free.
const EFFECT_TIERS = {
  // Ticks once a second, so `ticks` is also the duration in seconds.
  burn:   [null, { dmgPerTick: 1, ticks: 3 }, { dmgPerTick: 1, ticks: 5 },
                 { dmgPerTick: 2, ticks: 5 }, { dmgPerTick: 2, ticks: 8 },
                 { dmgPerTick: 3, ticks: 10 }],
  // 1 damage per tick per stack, so the stack count is the tick damage.
  poison: [null, { tickMs: 3000, ms: 10000 }, { tickMs: 2500, ms: 12000 },
                 { tickMs: 2000, ms: 15000 }, { tickMs: 1500, ms: 20000 },
                 { tickMs: 1000, ms: 25000 }],
  // `shatter` multiplies the hit that breaks the freeze.
  freeze: [null, { ms: 1000, shatter: 1.2 }, { ms: 2000, shatter: 1.4 },
                 { ms: 3000, shatter: 1.6 }, { ms: 4000, shatter: 1.8 },
                 { ms: 5000, shatter: 2.0 }],
  stun:   [null, { ms: 500 }, { ms: 1000 }, { ms: 1500 }, { ms: 2000 },
                 { ms: 2500 }],
};
const POISON_MAX_STACKS = 3;
const BURN_TICK_MS      = 1000;

// Badge key -> the field it lives on, so the icon row can read a tier
// back off the enemy without a switch.
const STATUS_FIELD = { burning: 'burn', poisoned: 'poison',
                       frozen: 'frozen', stunned: 'stunned' };
// Index by tier, so ROMAN[3] is 'III'.
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// Reads whichever status flags an enemy is carrying.  Kept in one place
// so adding a status means touching this and the sheet, nothing else.
function activeStatuses(e) {
  const out = [];
  if (e.burn)    out.push('burning');
  if (e.poison)  out.push('poisoned');
  if (e.frozen)  out.push('frozen');
  if (e.stunned) out.push('stunned');
  return out;
}

// ─────────────────────────────────────────────
//  EX level availability
// ─────────────────────────────────────────────
// The anniversary bonus level runs as a post-event: it appears on the
// map from Aug 31 to Sep 30, 2026 inclusive, and is hidden otherwise.
// The 'X' shortcut on the map bypasses this entirely so the level stays
// testable year-round.
const EX_WINDOW_START = new Date(2026, 7, 31);              // Aug 31
const EX_WINDOW_END   = new Date(2026, 8, 30, 23, 59, 59);  // Sep 30, end of day

function isExWindow(now) {
  const t = now || new Date();
  return t >= EX_WINDOW_START && t <= EX_WINDOW_END;
}

// Before the window the node shows locked with an opening date, so the
// event is visibly coming rather than appearing from nowhere.  After it
// closes the node disappears entirely.
function exWindowPhase(now) {
  const t = now || new Date();
  if (t < EX_WINDOW_START) return 'upcoming';
  if (t <= EX_WINDOW_END)  return 'open';
  return 'over';
}

function exOpensLabel() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Opens ${months[EX_WINDOW_START.getMonth()]} ${EX_WINDOW_START.getDate()}`;
}

// ─────────────────────────────────────────────
//  Golden Emperor (boss room)
// ─────────────────────────────────────────────
// Stationary on the right, immune to knockback so he can't be combo
// locked — the trade for that is a long rest between casts, giving the
// player room to deal with the peons.
//
// Beam cast: he marks where the player IS, and 0.5s later a surge erupts
// there.  Each surge lives 2s but a new one starts every 1.25s, so two
// overlap — running in a straight line is safe, doubling back is not.
// Damage taken from surges is returned to him as health, so sloppy
// dodging visibly extends the fight.
const EMPEROR = {
  hp: 350,
  restMinMs: 10000,     // gap between casts
  restMaxMs: 15000,
  windupMs: 600,        // scepter raised before the first surge

  beamCount: 5,
  beamDps: 5,
  beamLifeMs: 2000,
  beamIntervalMs: 1250, // < lifeMs, so two are live at once
  beamWarnMs: 500,      // from marking the spot to eruption
  beamW: 96,
  beamH: 240,
  lifesteal: true,

  summonEvery: 3,       // every 3rd cast summons instead of beaming
  summonCount: 5,
  burrowMs: 1600,       // long enough to see them coming and back off
  burrowSink: 35,       // how far into the floor they sit while emerging

  yOffset: 20,          // sits this far below the floor line
  throneSpikeDelayMs: 350,  // grace before the seat turns hostile

  guardFirstMs: 2000,   // first guard shortly after the fight starts
  guardEveryMs: 45000,
  guardMaxAlive: 3,
};
// Body box in unscaled texture px.  The art is 53x90 at x=47..100, but
// the raised scepter reaches left in the attack frames, so the box
// covers the throne and body only.
const EMPEROR_BODY = { x: 60, y: 16, w: 40, h: 90 };
// Just the throne block, in the same texture space.  Columns 47-56 are
// the scepter shaft and 57-67 the outstretched arm; the solid seat runs
// 68-100.  The spike row spans this rather than the collision body, or
// it juts out over the staff.
const EMPEROR_THRONE = { x: 68, w: 32 };

// ─────────────────────────────────────────────
//  Golden Door puzzle
// ─────────────────────────────────────────────
// Deduce the order of the four elements from three clues.  Generated
// fresh each attempt so the answer can't be shared, and every generated
// puzzle is checked to have exactly one solution with no redundant
// clue — otherwise the door would be unsolvable or a clue would be
// dead weight.
const DOOR = {
  damage: 10,          // laser bolt on a wrong answer
  boltSpeed: 900,
  slots: 4,
};
// The boss room is exactly one screenful — at 0.65 zoom the camera sees
// 800/0.65 x 480/0.65 world units, so a room that size never scrolls.
const GAME_ZOOM     = 0.65;
// Vertical window chosen so the carpet sits ~85% down the view, leaving
// headroom above for the Emperor.
const BOSS_ROOM_TOP = 141;

const PUZZLE_EL    = ['fire', 'water', 'air', 'earth'];
const PUZZLE_LABEL = { fire: 'Fire', water: 'Water', air: 'Air', earth: 'Earth' };

function _perms(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => {
    const rest = a.slice(0, i).concat(a.slice(i + 1));
    for (const r of _perms(rest)) out.push([x, ...r]);
  });
  return out;
}
const PUZZLE_PERMS = _perms(PUZZLE_EL);

// Every true statement about `p`, each with a predicate so candidate
// arrangements can be tested against it.
function _puzzleClues(p) {
  const at = e => p.indexOf(e);
  const L = PUZZLE_LABEL;
  const out = [];
  for (const e of PUZZLE_EL) {
    for (let n = 0; n < 4; n++) {
      if (at(e) !== n) {
        out.push({ kind: 'not-slot', text: `${L[e]} is not in slot ${n + 1}`,
                   test: q => q.indexOf(e) !== n });
      }
    }
    if (at(e) === 0 || at(e) === 3) {
      out.push({ kind: 'edge', text: `${L[e]} sits at one of the two ends`,
                 test: q => q.indexOf(e) === 0 || q.indexOf(e) === 3 });
    } else {
      out.push({ kind: 'middle', text: `${L[e]} is not at either end`,
                 test: q => q.indexOf(e) === 1 || q.indexOf(e) === 2 });
    }
  }
  for (const a of PUZZLE_EL) for (const b of PUZZLE_EL) {
    if (a === b) continue;
    if (at(a) + 1 === at(b)) {
      out.push({ kind: 'adjacent', text: `${L[a]} is immediately left of ${L[b]}`,
                 test: q => q.indexOf(a) + 1 === q.indexOf(b) });
    }
    if (at(a) < at(b)) {
      out.push({ kind: 'order', text: `${L[a]} is somewhere left of ${L[b]}`,
                 test: q => q.indexOf(a) < q.indexOf(b) });
    }
    if (a < b && Math.abs(at(a) - at(b)) === 2) {
      const mid = PUZZLE_EL.find(e => at(e) === (at(a) + at(b)) / 2);
      out.push({ kind: 'between',
                 text: `${L[mid]} sits directly between ${L[a]} and ${L[b]}`,
                 test: q => Math.abs(q.indexOf(a) - q.indexOf(b)) === 2 &&
                            q.indexOf(mid) === (q.indexOf(a) + q.indexOf(b)) / 2 });
    }
  }
  return out;
}

const _puzzleSolutions = trio => PUZZLE_PERMS.filter(q => trio.every(c => c.test(q)));

// Returns { answer, clues } — three clues that pin down exactly one
// arrangement, none of them removable.
function generateDoorPuzzle() {
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const answer = PUZZLE_PERMS[Math.floor(Math.random() * PUZZLE_PERMS.length)];
  const pool   = shuffle(_puzzleClues(answer));
  let fallback = null;
  for (let i = 0; i < pool.length - 2; i++) {
    for (let j = i + 1; j < pool.length - 1; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]];
        if (_puzzleSolutions(trio).length !== 1) continue;
        // Each clue must carry weight: drop it and the answer stops
        // being unique.  Without this the generator pairs "A
        // immediately left of B" with "A somewhere left of B", which
        // reads as three clues but gives two.
        const loadBearing = trio.every((_, idx) =>
          _puzzleSolutions(trio.filter((_, m) => m !== idx)).length > 1);
        if (!loadBearing) continue;
        if (!fallback) fallback = trio;
        if (new Set(trio.map(c => c.kind)).size === 3) {
          return { answer, clues: shuffle(trio).map(c => c.text) };
        }
      }
    }
  }
  return { answer, clues: shuffle(fallback || pool.slice(0, 3)).map(c => c.text) };
}

// ─────────────────────────────────────────────
//  Player skins
// ─────────────────────────────────────────────
// Every skin ships the same set of animations, distinguished by suffix
// (`idle`, `idle_f`, `idle_gold`, ...) — see buildAnims and _animKey.
// `unlockFlag` names a saved-progress boolean; a skin with one stays
// locked in the picker until that flag is set.
// `effects` are the lines shown in an item's profile.  Tone drives the
// colour so a buff, a drawback and a plain statement are told apart at a
// glance — reusable for weapons and armour, which will want the same
// treatment for trade-offs like "-50% move speed / +250% damage".
// `mods` is the mechanical half: what the effect text actually does.
const EFFECT_TONE = {
  good:    '#1a8f3c',   // a benefit
  bad:     '#c62828',   // a drawback
  neutral: '#5c5c66',   // flavour, or a statement with no value attached
};
// ─────────────────────────────────────────────
//  Touch controls
// ─────────────────────────────────────────────
// A device setting, not player progress — so it's stored under its own
// key and applies to guests too (progress deliberately never touches
// localStorage for guests; this isn't progress).
const TOUCH_PREF_KEY = 'ew.touchControls';   // 'auto' | 'on' | 'off'

function touchPref() {
  try { return localStorage.getItem(TOUCH_PREF_KEY) || 'auto'; }
  catch { return 'auto'; }
}
function setTouchPref(v) {
  try { localStorage.setItem(TOUCH_PREF_KEY, v); } catch { /* private mode */ }
}
// Coarse pointer *and* real touch points — either alone gives false
// positives (some laptops report touch; some styluses report coarse).
function deviceIsTouch() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return !!(coarse && navigator.maxTouchPoints > 0);
}
function touchControlsOn() {
  const p = touchPref();
  return p === 'on' ? true : p === 'off' ? false : deviceIsTouch();
}

const SKINS = [
  // `key` is what gets persisted in save data — only `label` is display
  // text, so these can be renamed freely without breaking saves.
  { key: 'default', label: 'Skin 1', tex: 'player_idle',   suffix: '',
    effects: [] },
  { key: 'female',  label: 'Skin 2', tex: 'player_female', suffix: '_f',
    effects: [] },
  { key: 'gold',    label: 'Gold',    tex: 'player_gold',   suffix: '_gold',
    unlockFlag: 'goldSkinUnlocked', lockedHint: 'Beat the EX level',
    effects: [{ text: '2x Elemental Damage & Effects', tone: 'good' }],
    mods: { elementDamage: 2, elementEffect: 2 } },
];
const SKIN_BY_KEY        = Object.fromEntries(SKINS.map(s => [s.key, s]));
const SKIN_ANIM_SUFFIX   = Object.fromEntries(SKINS.map(s => [s.key, s.suffix]));

// A skin is usable if it exists and either needs no unlock or has been
// earned.  Guards against a stale/hand-edited saved `skin` value leaving
// the player on a skin whose animations they shouldn't have.
function skinUnlocked(key, progress) {
  const def = SKIN_BY_KEY[key];
  if (!def) return false;
  return !def.unlockFlag || !!(progress && progress[def.unlockFlag]);
}

// ─────────────────────────────────────────────
//  Auth / progress persistence (localStorage)
// ─────────────────────────────────────────────
// localStorage is per-origin + per-browser profile, so "max accounts per
// device/browser" maps naturally to capping the accounts array length.

const EW_ACCOUNTS_KEY          = 'ew_accounts';
const EW_SESSION_KEY           = 'ew_session';
const MAX_ACCOUNTS_PER_DEVICE  = 3;

// djb2-ish hash — not crypto-secure, but avoids plaintext passwords in
// localStorage. Works everywhere, synchronously.
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(EW_ACCOUNTS_KEY) || '[]'); }
  catch { return []; }
}
function writeAccounts(accounts) {
  localStorage.setItem(EW_ACCOUNTS_KEY, JSON.stringify(accounts));
}
function getSessionUsername() {
  return localStorage.getItem(EW_SESSION_KEY) || null;
}
function setSessionUsername(username) {
  if (username) localStorage.setItem(EW_SESSION_KEY, username);
  else           localStorage.removeItem(EW_SESSION_KEY);
}
function currentUser() {
  const name = getSessionUsername();
  if (!name) return null;
  return loadAccounts().find(a => a.username === name) || null;
}

function signUp(username, password) {
  username = (username || '').trim();
  if (!username || !password) throw new Error('Username and password are required.');
  if (username.length > 20)   throw new Error('Username is too long (max 20).');
  const accounts = loadAccounts();
  if (accounts.length >= MAX_ACCOUNTS_PER_DEVICE) {
    throw new Error(`Max ${MAX_ACCOUNTS_PER_DEVICE} accounts per device reached.`);
  }
  if (accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('That username is already taken on this device.');
  }
  accounts.push({ username, passwordHash: simpleHash(password), progress: {} });
  writeAccounts(accounts);
  setSessionUsername(username);
}

function logIn(username, password) {
  username = (username || '').trim();
  if (!username || !password) throw new Error('Username and password are required.');
  const accounts = loadAccounts();
  const hash = simpleHash(password);
  const acc  = accounts.find(a =>
    a.username.toLowerCase() === username.toLowerCase() && a.passwordHash === hash
  );
  if (!acc) throw new Error('Invalid username or password.');
  setSessionUsername(acc.username);
}

function logOut() {
  setSessionUsername(null);
  // Logging out drops you to guest — start that session clean.
  for (const key of Object.keys(guestProgress)) delete guestProgress[key];
}

// Guests deliberately never touch localStorage, but their run still has
// to hold together across scene restarts (level 1 → level 2, respawns).
// This in-memory store lasts exactly as long as the page does, which is
// the right lifetime for a guest session.
const guestProgress = {};

// Merge-save so we never downgrade fields (e.g. keeps level1Star=true if
// the player replays without collecting the star).
function saveProgress(update) {
  const name = getSessionUsername();
  if (!name) {                            // guests: memory only
    Object.assign(guestProgress, update);
    return;
  }
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.username === name);
  if (idx === -1) return;
  accounts[idx].progress = { ...(accounts[idx].progress || {}), ...update };
  writeAccounts(accounts);
}

// ─────────────────────────────────────────────
//  DOM auth form overlay (login or signup)
// ─────────────────────────────────────────────
function showAuthForm({ mode, onSuccess, onCancel }) {
  const old = document.getElementById('ew-auth-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ew-auth-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.55)',
    'display:flex', 'justify-content:center', 'align-items:center',
    'z-index:9999', 'font-family:"Arial Black",Arial,sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fff', 'padding:22px 28px', 'border-radius:14px',
    'min-width:300px', 'box-shadow:0 12px 48px rgba(0,0,0,0.35)',
    'display:flex', 'flex-direction:column', 'gap:10px',
  ].join(';');

  const title = document.createElement('h2');
  title.textContent = mode === 'login' ? 'Log In' : 'Sign Up';
  title.style.cssText = 'margin:0 0 6px;color:#ff5722;font-size:22px;';
  card.appendChild(title);

  // Roomier padding on touch: the desktop sizes leave inputs at 39px and
  // buttons at 36px, both under the ~44px comfortable target.  Font size
  // stays 16px either way — below that, iOS zooms the page on focus.
  const touchUI  = deviceIsTouch();
  const fieldPad = touchUI ? '12px 12px' : '8px 10px';
  const btnPad   = touchUI ? '13px 22px' : '8px 16px';

  const makeField = (labelText, type, autocomplete) => {
    const wrap = document.createElement('label');
    wrap.textContent = labelText;
    wrap.style.cssText = 'display:flex;flex-direction:column;font-size:12px;color:#555;';
    const input = document.createElement('input');
    input.type = type;
    input.autocomplete = autocomplete;
    input.style.cssText = [
      'margin-top:4px', `padding:${fieldPad}`,
      'font:16px Arial,sans-serif', 'border:2px solid #ccc',
      'border-radius:6px', 'outline:none',
    ].join(';');
    input.addEventListener('focus', () => { input.style.borderColor = '#ff5722'; });
    input.addEventListener('blur',  () => { input.style.borderColor = '#ccc';    });
    wrap.appendChild(input);
    card.appendChild(wrap);
    return input;
  };

  const userInput = makeField('Username', 'text',     'username');
  const passInput = makeField('Password', 'password',
    mode === 'login' ? 'current-password' : 'new-password');

  const err = document.createElement('div');
  err.style.cssText = 'color:#c62828;font-size:12px;min-height:16px;';
  card.appendChild(err);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:4px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    `padding:${btnPad}`, 'font:14px "Arial Black",Arial,sans-serif',
    'color:#555', 'background:#eee', 'border:none', 'border-radius:6px', 'cursor:pointer',
  ].join(';');

  const submitBtn = document.createElement('button');
  submitBtn.textContent = mode === 'login' ? 'Log In' : 'Create Account';
  submitBtn.style.cssText = [
    `padding:${btnPad}`, 'font:14px "Arial Black",Arial,sans-serif',
    'color:#fff', 'background:#ff5722', 'border:none', 'border-radius:6px', 'cursor:pointer',
  ].join(';');

  row.appendChild(cancelBtn);
  row.appendChild(submitBtn);
  card.appendChild(row);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  setTimeout(() => userInput.focus(), 0);

  // Stop pointer events from leaking through to the Phaser canvas underneath
  // (otherwise clicks on inputs also hit MenuScene buttons and rebuild the form).
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(evt => {
    overlay.addEventListener(evt, e => e.stopPropagation());
  });

  // Disable Phaser keyboard input while typing so captured keys (W/A/S/D/E/, etc.)
  // reach the text inputs instead of being preventDefault'd by Phaser.
  const game = window._ewGame;
  const kb = game && game.input && game.input.keyboard;
  const prevKbEnabled = kb ? kb.enabled : null;
  if (kb) kb.enabled = false;

  const close = () => {
    if (kb) kb.enabled = prevKbEnabled;
    overlay.remove();
  };
  const submit = () => {
    try {
      if (mode === 'login') logIn(userInput.value, passInput.value);
      else                  signUp(userInput.value, passInput.value);
      close();
      onSuccess && onSuccess();
    } catch (e) {
      err.textContent = e.message || String(e);
    }
  };

  cancelBtn.addEventListener('click', () => { close(); onCancel && onCancel(); });
  submitBtn.addEventListener('click', submit);
  [userInput, passInput].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { close(); onCancel && onCancel(); }
  });
  const escHandler = e => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      close();
      onCancel && onCancel();
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ── PreloadScene ────────────────────────────
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    this.load.spritesheet('player_idle',   'assets/skins/idle.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_walk',   'assets/skins/walk.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_jump',   'assets/skins/jump.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_attack',        'assets/skins/attack.png',        { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_weapon_attack', 'assets/skins/weapon_attack.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_duck',   'assets/skins/duck.png',   { frameWidth: 18, frameHeight: 31 });
    // Female skin — unlocked for any account that has logged in. Single
    // combined sheet, cropped to the same 18x31 frame size as the
    // default skin so all hitbox math applies unchanged.
    this.load.spritesheet('player_female', 'assets/skins/Main Character - Female Skin.png', { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_gold',   'assets/skins/Main Character - Gold Skin.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('dummy',         'assets/enemies/dummy.png',  { frameWidth: 27, frameHeight: 25 });
    this.load.spritesheet('zombie',        'assets/enemies/Zombie.png', { frameWidth: 32, frameHeight: 32 });
    // Golden Guard frames are 32x64 — twice as tall as everything else.
    this.load.spritesheet('golden_guard',  'assets/enemies/Golden Guard.png', { frameWidth: 32, frameHeight: 64 });
    this.load.image('lightning_strike',    'assets/Blue Lightning Strike.png');
    // Door: frame 0 closed, frame 1 ajar.  Cropped to the art, so the
    // closed door's base sits 22/25 of the way down the frame.
    this.load.spritesheet('gold_door', 'assets/Gold Door.png', { frameWidth: 18, frameHeight: 25 });
    this.load.image('laser_bolt',      'assets/Laser Bolt.png');
    // Status badges: 0 on fire, 1 poisoned, 2 frozen, 3 stunned.
    this.load.spritesheet('effect_icons', 'assets/Effect Icons.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('food_apple',      'assets/food/Apple.png');
    this.load.image('food_orange',     'assets/food/Orange.png');
    this.load.image('food_banana',     'assets/food/Banana.png');
    // Boss room.  The Emperor is enthroned in a 128x128 frame; Dark Surge
    // is already drawn at its final on-screen size (96x240), so unlike
    // every other sprite here it renders at scale 1 rather than x3.
    this.load.spritesheet('golden_emperor', 'assets/enemies/Golden Emperor.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('dark_surge',     'assets/Dark Surge.png',             { frameWidth: 96,  frameHeight: 240 });
    this.load.spritesheet('zombie_butler', 'assets/enemies/Butler Zombie.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('chest',         'assets/chest.png',  { frameWidth: 14, frameHeight: 16 });
    this.load.image('item_wooden_sword',  'assets/items/Sword.png');
    this.load.image('item_wooden_shield', 'assets/items/Shield.png');
    this.load.image('ground',   'assets/blocks/ground.png');
    this.load.image('dirt',     'assets/blocks/dirt.png');
    this.load.image('platform', 'assets/platform.png');
    // EX floor: fringed surface row over plain carpet fill beneath.
    this.load.image('carpet_top',  'assets/blocks/Luxury Carpet Block.png');
    this.load.image('carpet_fill', 'assets/blocks/Carpet Block.png');
    this.load.image('spike',    'assets/spike.png');
    this.load.image('portal',   'assets/portal.png');
    this.load.image('star',     'assets/star.png');
    // Level 2 — ranged dummy + element projectiles + moving platform
    this.load.image('ranged_dummy',    'assets/enemies/Ranged_Dummy.png');
    this.load.image('moving_platform', 'assets/Moving Platform.png');
    this.load.image('shield_overlay',  'assets/items/Shield.png');
    this.load.spritesheet('blue_fireball', 'assets/Blue_Fireball.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('bow',           'assets/items/Bow.png',           { frameWidth: 32, frameHeight: 32 });
    // Element icons — looping idle spritesheets, 32x32 frames. Reused for
    // both the hotbar/choice-screen icon and the fired projectile itself.
    this.load.spritesheet('icon_fire',  'assets/elements/Fire.png',  { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('icon_water', 'assets/elements/Water.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('icon_air',   'assets/elements/Air.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('icon_earth', 'assets/elements/Earth.png', { frameWidth: 32, frameHeight: 32 });
  }

  create() {
    this.buildFallbacks();
    this.scene.start('MenuScene');
  }

  buildFallbacks() {
    const makeSheet = (key, col, nf, fw = 32, fh = 32) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas');
      cv.width = fw * nf; cv.height = fh;
      const cx = cv.getContext('2d');
      const r = (col>>16)&0xff, g = (col>>8)&0xff, b = col&0xff;
      for (let i = 0; i < nf; i++) {
        cx.fillStyle = `rgb(${r},${g},${b})`;
        cx.fillRect(i*fw, 0, fw, fh);
        cx.strokeStyle = 'rgba(0,0,0,0.3)';
        cx.strokeRect(i*fw+.5, .5, fw-1, fh-1);
      }
      const tex = this.textures.addCanvas(key, cv);
      for (let i = 0; i < nf; i++) tex.add(i, 0, i*fw, 0, fw, fh);
    };
    const makeImg = (key, col, w = 32, h = 32) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.fillStyle = `rgb(${(col>>16)&0xff},${(col>>8)&0xff},${col&0xff})`;
      cx.fillRect(0, 0, w, h);
      this.textures.addCanvas(key, cv);
    };
    makeSheet('player_idle',   0x4488ff, 1, 18, 31);
    makeSheet('player_walk',   0x4488ff, 4, 18, 31);
    makeSheet('player_jump',   0x44aaff, 3, 18, 31);
    makeSheet('player_attack',        0xff8844, 4, 18, 31);
    makeSheet('player_weapon_attack', 0xffaa44, 3, 32, 32);
    makeSheet('player_duck',   0x2266cc, 1, 18, 31);
    makeSheet('player_female', 0xff69b4, 10, 18, 31);
    makeSheet('player_gold',   0xffd700, 11, 18, 31);
    makeSheet('dummy',         0xcc4444, 2, 27, 25);
    makeSheet('zombie',        0x2f6b2f, 6, 32, 32);
    makeSheet('zombie_butler', 0x1f4b2f, 6, 32, 32);
    makeSheet('golden_guard',  0xe8c33a, 3, 32, 64);
    makeImg  ('lightning_strike', 0x9be3ff, 32, 32);
    makeSheet('gold_door',        0xe8c33a, 2, 18, 25);
    makeImg  ('laser_bolt',       0xff4444, 19,  9);
    makeSheet('effect_icons',     0xff6a1f, 4, 32, 32);
    makeImg  ('food_apple',       0xe23b3b, 32, 32);
    makeImg  ('food_orange',      0xef8a1b, 32, 32);
    makeImg  ('food_banana',      0xf2d13b, 32, 32);
    makeSheet('golden_emperor',   0xe8c33a, 4, 128, 128);
    makeSheet('dark_surge',       0x8b2fd6, 2,  96, 240);
    makeSheet('chest',         0xcc9922, 2, 14, 16);
    makeImg  ('ground',        0x4a9944, 32, 32);
    makeImg  ('dirt',          0x3d2008, 32, 32);
    makeImg  ('platform',      0x8b5e3c, 32,  6);
    makeImg  ('carpet_top',    0x7a1d3f, 32, 32);
    makeImg  ('carpet_fill',   0x7a1d3f, 32, 32);
    makeImg  ('spike',         0xddddcc,  8,  8);  // 8×8 fallback
    makeImg  ('dust',          0xd4c4a8,  4,  4);
    makeImg  ('portal',        0x00ddff, 32, 32);   // portal fallback
    makeImg  ('star',          0xf5c518, 14, 14);  // star fallback
    makeImg  ('ranged_dummy',    0xaa3344, 32, 32);
    makeImg  ('moving_platform', 0x8b5e3c, 32, 12);
    makeImg  ('shield_overlay',  0x886633, 32, 32);
    makeSheet('blue_fireball', 0x44aaff, 2, 32, 32);
    makeSheet('bow',           0x884422, 2, 32, 32);
    makeSheet('icon_fire',     0xff5522, 2, 32, 32);
    makeSheet('icon_water',    0x3399ff, 3, 32, 32);
    makeSheet('icon_air',      0xeeeeee, 1, 32, 32);
    makeSheet('icon_earth',    0x77aa44, 3, 32, 32);
  }
}

// ── MenuScene ────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0xeef8ff).setOrigin(0);

    const cg = this.add.graphics();
    cg.fillStyle(0xffffff, 0.9);
    [[90,75,130,44],[280,52,100,36],[500,85,150,48],[680,58,110,38],[760,110,90,32]]
      .forEach(([x,y,w,h]) => {
        cg.fillEllipse(x,y,w,h);
        cg.fillEllipse(x-w*.22,y-h*.28,w*.55,h*.65);
        cg.fillEllipse(x+w*.18,y-h*.22,w*.50,h*.60);
      });

    this.add.rectangle(0, height-54, width, 54, 0x6dbf67).setOrigin(0);
    this.add.rectangle(0, height-54, width,  9, 0x52a84f).setOrigin(0);

    const titleText = this.add.text(width/2, height/2-90, 'ELEMENTAL WARS', {
      fontSize: '42px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ff5722', stroke: '#ffffff', strokeThickness: 7
    }).setOrigin(0.5);

    const subtitleText = this.add.text(width/2, height/2-38, 'Tutorial Level', {
      fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#2d6a4f'
    }).setOrigin(0.5);

    // ── Sync registry with saved progress for current session ──
    // Logged-in  → load their saved progress into the registry
    // Guest/none → wipe registry so the game starts clean
    const user     = currentUser();
    const progress = user ? (user.progress || {}) : {};
    // One-time migration: anyone who finished level 1 before the chest
    // cinematic existed is treated as having opened the chest already.
    // This stops them from re-running the cinematic and getting a free
    // sword on their next load.
    const preExistingCompleter = !!progress.level1Complete && !progress.level1ChestOpened;
    this.registry.set('level1Complete',    !!progress.level1Complete);
    this.registry.set('level1Star',        !!progress.level1Star);
    this.registry.set('level1ChestOpened', !!progress.level1ChestOpened || preExistingCompleter);
    this.registry.set('level2ChestAOpened', !!progress.level2ChestAOpened);
    this.registry.set('isGuest',        !user);

    // Hydrate the status sheet from saved progress (or reset to blank for guest/logged-out).
    if (window.statusSheet) {
      if (user) {
        window.statusSheet.loadFromProgress();
        window.statusSheet.setIdentity({ username: user.username, playerId: '' });
        if (preExistingCompleter) {
          // Persist the migrated chest flag and strip any wooden_sword that
          // leaked into the save during pre-migration test runs.
          if (typeof window.statusSheet.removeItemEverywhere === 'function') {
            window.statusSheet.removeItemEverywhere('wooden_sword');
          }
          saveProgress({ level1ChestOpened: true });
        }
      } else {
        window.statusSheet.reset();
      }
    }

    const makeBtn = (y, label, bg, hover, onClick) => {
      const b = this.add.text(width/2, y, `  ${label}  `, {
        fontSize: '20px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#ffffff', backgroundColor: bg, padding: { x: 22, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerover', () => b.setStyle({ backgroundColor: hover }));
      b.on('pointerout',  () => b.setStyle({ backgroundColor: bg }));
      b.on('pointerup',   onClick);
      return b;
    };

    const startGame = () => this.scene.start('MapScene');

    if (user) {
      const mainMenuObjects = [titleText, subtitleText];
      mainMenuObjects.push(this.add.text(width/2, height/2 - 5, `Welcome back, ${user.username}!`, {
        fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#2d6a4f', stroke: '#ffffff', strokeThickness: 3
      }).setOrigin(0.5));
      mainMenuObjects.push(makeBtn(height/2 + 40,  'PLAY',    '#ff5722', '#e64a19', startGame));
      mainMenuObjects.push(makeBtn(height/2 + 95,  'SKINS',   '#9c6ade', '#8148c9', () => showSkinPicker()));
      mainMenuObjects.push(makeBtn(height/2 + 150, 'LOG OUT', '#8c8c8c', '#6c6c6c', () => {
        logOut();
        this.scene.restart();
      }));
      this.input.keyboard.once('keydown-ENTER', startGame);
      this.input.keyboard.once('keydown-SPACE', startGame);

      // ── Skin picker panel (hidden until "SKINS" is clicked) ──────
      // Cards on the left only *preview* a skin; the profile on the
      // right shows its effects, and nothing is worn until EQUIP is
      // pressed.  Locked skins can still be previewed so the reward is
      // legible before it's earned.
      let skinChoice = skinUnlocked(progress.skin, progress) ? progress.skin : 'default';
      let previewKey = skinChoice;
      const panelObjects = [];
      const cards = {};
      const cardW = 104, cardH = 148, gap = 12;
      const rowW  = cardW * SKINS.length + gap * (SKINS.length - 1);
      const cardsY = height / 2 + 10;
      const startX = 28 + cardW / 2;
      const profX  = 590;

      panelObjects.push(this.add.text(width / 2, 52, 'Skins', {
        fontSize: '24px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#2d6a4f', stroke: '#ffffff', strokeThickness: 4,
      }).setOrigin(0.5));

      // ── Profile column ─────────────────────────────────────────
      const profBg = this.add.rectangle(profX, cardsY, 340, 300, 0xffffff)
        .setStrokeStyle(3, 0xcccccc);
      const profName = this.add.text(profX, cardsY - 126, '', {
        fontSize: '20px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#2d3142',
      }).setOrigin(0.5);
      const profImg = this.add.image(profX, cardsY - 56, 'player_idle', 0).setScale(4.5);
      const profHdr = this.add.text(profX, cardsY + 14, 'SPECIAL EFFECTS', {
        fontSize: '12px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#8a8a99',
      }).setOrigin(0.5);
      const profRule = this.add.rectangle(profX, cardsY + 28, 280, 2, 0xdddddd);
      const profLines = [0, 1, 2].map(i =>
        this.add.text(profX, cardsY + 48 + i * 22, '', {
          fontSize: '14px', fontFamily: '"Arial Black", Arial, sans-serif',
          color: EFFECT_TONE.neutral, align: 'center',
          wordWrap: { width: 300 },
        }).setOrigin(0.5));

      const equipBtn = this.add.text(profX, cardsY + 118, '  EQUIP  ', {
        fontSize: '18px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#ffffff', backgroundColor: '#4caf50', padding: { x: 16, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      equipBtn.on('pointerover', () => equipBtn.setStyle({ backgroundColor: '#5cc75f' }));
      equipBtn.on('pointerout',  () => equipBtn.setStyle({ backgroundColor: '#4caf50' }));

      panelObjects.push(profBg, profName, profImg, profHdr, profRule, equipBtn, ...profLines);

      const paintCards = () => {
        SKINS.forEach(def => {
          const c = cards[def.key];
          const isWorn    = def.key === skinChoice;
          const isPreview = def.key === previewKey;
          // Gold ring = currently worn, dark ring = just being previewed.
          c.border.setStrokeStyle(4, isWorn ? 0xffd700 : isPreview ? 0x5c6f8a : 0xcccccc);
          c.worn.setVisible(isWorn);
        });
      };

      const refreshProfile = () => {
        const def = SKIN_BY_KEY[previewKey];
        const unlocked = skinUnlocked(def.key, progress);
        profName.setText(def.label);
        profImg.setTexture(def.tex, 0);
        if (unlocked) profImg.clearTint(); else profImg.setTintFill(0x999999);

        const fx = def.effects || [];
        profLines.forEach((line, i) => {
          if (i < fx.length) {
            line.setText(fx[i].text).setColor(EFFECT_TONE[fx[i].tone] || EFFECT_TONE.neutral);
          } else if (i === 0 && !fx.length) {
            line.setText('None').setColor(EFFECT_TONE.neutral);
          } else {
            line.setText('');
          }
        });

        // Button reflects state: wearable, already worn, or still locked.
        if (!unlocked) {
          equipBtn.setText(`  ${def.lockedHint || 'LOCKED'}  `)
                  .setStyle({ backgroundColor: '#9a9a9a' }).disableInteractive();
        } else if (def.key === skinChoice) {
          equipBtn.setText('  EQUIPPED  ')
                  .setStyle({ backgroundColor: '#b0b0b0' }).disableInteractive();
        } else {
          equipBtn.setText('  EQUIP  ')
                  .setStyle({ backgroundColor: '#4caf50' })
                  .setInteractive({ useHandCursor: true });
        }
        paintCards();
      };

      equipBtn.on('pointerup', () => {
        if (!skinUnlocked(previewKey, progress) || previewKey === skinChoice) return;
        skinChoice = previewKey;
        saveProgress({ skin: skinChoice });
        refreshProfile();
      });

      // ── Cards column ───────────────────────────────────────────
      SKINS.forEach((def, i) => {
        const cx = startX + i * (cardW + gap);
        const unlocked = skinUnlocked(def.key, progress);
        const border = this.add.rectangle(cx, cardsY, cardW, cardH,
                                          unlocked ? 0xffffff : 0xdddddd)
          .setStrokeStyle(4, 0xcccccc)
          .setInteractive({ useHandCursor: true });
        const preview = this.add.image(cx, cardsY - 8, def.tex, 0).setScale(3);
        if (!unlocked) preview.setTintFill(0x777777);
        const name = this.add.text(cx, cardsY + cardH / 2 - 18, def.label, {
          fontSize: '13px', fontFamily: '"Arial Black", Arial, sans-serif',
          color: unlocked ? '#2d3142' : '#7a7a86',
        }).setOrigin(0.5);
        // Small tick marking the skin actually being worn.
        const worn = this.add.text(cx + cardW / 2 - 14, cardsY - cardH / 2 + 12, '\u2713', {
          fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif',
          color: '#1a8f3c',
        }).setOrigin(0.5).setVisible(false);

        // Clicking previews — it does not equip.
        border.on('pointerup', () => { previewKey = def.key; refreshProfile(); });
        cards[def.key] = { border, preview, name, worn };
        panelObjects.push(border, preview, name, worn);
      });

      // Sits between the profile card's bottom edge (~400) and the
      // controls footer (~456) so it collides with neither.
      const backBtn = makeBtn(height / 2 + 175, 'BACK', '#8c8c8c', '#6c6c6c', () => hideSkinPicker());
      panelObjects.push(backBtn);
      refreshProfile();
      panelObjects.forEach(o => o.setVisible(false));

      function showSkinPicker() {
        mainMenuObjects.forEach(o => o.setVisible(false));
        panelObjects.forEach(o => o.setVisible(true));
        // Blanket-showing the panel also un-hides the per-card "worn"
        // ticks, so re-apply the state-driven visibility afterwards.
        refreshProfile();
      }
      function hideSkinPicker() {
        panelObjects.forEach(o => o.setVisible(false));
        mainMenuObjects.forEach(o => o.setVisible(true));
      }
    } else {
      makeBtn(height/2 + 10, 'LOG IN', '#3b9fff', '#1e7ae5', () => {
        showAuthForm({ mode: 'login',  onSuccess: () => this.scene.restart() });
      });
      makeBtn(height/2 + 58, 'SIGN UP', '#4caf50', '#388e3c', () => {
        showAuthForm({ mode: 'signup', onSuccess: () => this.scene.restart() });
      });
      makeBtn(height/2 + 106, 'PLAY AS GUEST', '#ff9800', '#ef6c00', startGame);
      // ENTER/SPACE default to "Play as Guest" when not logged in
      this.input.keyboard.once('keydown-ENTER', startGame);
      this.input.keyboard.once('keydown-SPACE', startGame);
    }

    this.add.text(width/2, height-24,
      'Arrow keys / WASD  ·  ↑/W = jump (×2)  ·  ↓/S = duck  ·  E or , = attack',
      { fontSize:'11px', fontFamily:'monospace', color:'#2d6a4f' }
    ).setOrigin(0.5);
  }
}

// ── GameScene ────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // Phaser passes the data object from `scene.start('GameScene', data)`
  // here before create().  Defaults to level 1 when launched without
  // data (keyboard fallbacks in MapScene, dev-tool calls, etc).
  //
  // Phaser reuses the scene instance across runs, so explicit null-out
  // any per-run entity references that some levels skip — otherwise
  // a level-2 run inherits stale `this.dummy` etc. from a prior
  // level-1 run, and the `if (this.entity)` guards in create() pass
  // truthily on dangling sprites.
  init(data) {
    // Level ids are numeric for the main path.  'ex' is the standalone
    // anniversary level, deliberately kept out of the number sequence so
    // adding a real level 3 later can't collide with it.
    const rawLevel = data && data.level;
    this._levelNum = (rawLevel === 'ex' || rawLevel === 'exboss')
      ? rawLevel : (Number(rawLevel) || 1);
    this.dummy        = null;
    this.chest        = null;
    this.patrolDummy  = null;
    this.portal       = null;
    this._starSprite  = null;
    // Level-2 entity refs (null on level 1 so collider/overlap guards skip)
    this.rangedDummies = null;     // array of { sprite, hp, maxHp, dead, fireTimer }
    this.fireballs     = null;     // physics group — enemy projectiles
    this.elementProjectiles = null;// physics group — player element shots
    this.chestL2A      = null;     // first chest (shield + element-pick)
    this.chestL2B      = null;     // second chest (checkpoint)
    this.movingPlatform = null;    // moving platform sprite
    this._shieldOverlay = null;    // block-stance shield (lazy-built)
    this._level2Complete = false;
    this._hotbar = null;           // 10-slot element hotbar (rebuilt in create())
    this.zombies = null;           // EX-level zombies
    this.guards  = null;           // EX-level golden guards
    this.lightningBolts = null;    // falling Golden Guard strikes
    this.foodDrops = null;         // butler food lying on the ground
    this.emperor = null;           // boss-room Golden Emperor
    this.surges  = null;           // his Dark Surge geysers
    this._guardTimer = 0;
    this._surgeAcc = 0;
    this.door = null;              // EX-level Golden Door
    this._doorLockout = false;     // frozen while the door's bolt is in flight
    this._doorBolt = null;
    this._bossOver = false;        // true once the Emperor falls
    this._checkpoint = null;       // last world snapshot (hard-checkpoint levels)
    this._pendingCheckpoint = (data && data.checkpoint) || null;
  }

  create() {
    // World width is per-level; height is shared so the camera and
    // floor math stays consistent across tutorials.
    const WORLD_W   = (this._levelNum === 2)      ? 6336
                    : (this._levelNum === 'ex')   ? 4800
                    : (this._levelNum === 'exboss') ? Math.round(this.scale.width / GAME_ZOOM)
                    : 5800;
    const WORLD_H   = 1200;
    const floorY    = WORLD_H - 4 * TS;       // grass tile centre  y = 816
    const groundTop = floorY - TS / 2;         // grass surface      y = 768
    this._groundTopY = groundTop;              // where ground-targeted FX land

    this._respawnX    = 120;
    this._respawnY    = groundTop - 120;
    this._spikeHit    = false;
    this._wasOnGround = true;
    this._squashActive = false;   // true while squash tween is running (prevents re-trigger)
    this._ssTween      = null;    // holds the active squash OR stretch tween reference
    this._portalReached = false;
    this._gotStar       = false;   // temp flag — cleared on death, saved on portal
    this._starBobTween  = null;

    // ── Player stats (HUD reads these directly) ──────────────────────
    this._maxHp       = 100;
    this._hp          = 100;
    this._paused      = false;
    this.SPIKE_DAMAGE = 50;
    // Hydrate XP/level from saved progress so progress sticks across
    // runs.  Defaults match a fresh save.
    const _user      = (typeof currentUser === 'function') ? currentUser() : null;
    // Guests read back the in-memory store so XP/level survive scene
    // restarts within the session (see saveProgress).
    const _saved     = (_user && _user.progress) || guestProgress;
    this._level    = Number(_saved.level)     || 0;
    this._xp       = Number(_saved.xp)        || 0;
    this._xpToNext = Number(_saved.xpToNext)  || 15;
    // Retro-credit for accounts that opened the chest before XP
    // persistence existed.  If they've cleared the L1 chest gate but
    // never recorded any XP, hand them the 10 XP the chest grants and
    // mark a migration flag so we don't double-credit on the next run.
    if (_user && _saved.level1ChestOpened &&
        !_saved.xpMigratedFromChest && (Number(_saved.xp) || 0) === 0) {
      this._xp = Math.min(this._xpToNext, 10);
      if (typeof saveProgress === 'function') {
        saveProgress({ xp: this._xp, xpMigratedFromChest: true });
      }
    }

    // Hotbar — 10 slots, filled left-to-right one at a time on level-up.
    // Each filled slot is { element, cooldownRemaining }; empty = null.
    const _savedHotbar = Array.isArray(_saved.hotbar) ? _saved.hotbar : [];
    this._hotbar = new Array(10).fill(null).map((_, i) =>
      _savedHotbar[i] ? { element: _savedHotbar[i], cooldownRemaining: 0 } : null);
    // Block state — set true while the player holds T or '/'
    this._blocking = false;

    // Selected player skin — 'default' or 'female' (unlocked for any
    // account that has logged in, chosen from the main menu).
    this._skin = skinUnlocked(_saved.skin, _saved) ? _saved.skin : 'default';

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + TS * 2);
    if (this._levelNum === 'ex' || this._levelNum === 'exboss') {
      this.cameras.main.setBackgroundColor(0x6b5518);
      this._addBackgroundEX(WORLD_W, WORLD_H, floorY);
    } else {
      this.cameras.main.setBackgroundColor(0xeef8ff);
      this.addBackground(WORLD_W, WORLD_H);
    }

    // Level terrain + spike pits
    this.platforms = this.physics.add.staticGroup();
    this.spikes    = this.physics.add.staticGroup();
    if (this._levelNum === 'ex' || this._levelNum === 'exboss') {
      this._buildLevelEX(WORLD_W, WORLD_H, floorY);
    } else if (this._levelNum === 2) {
      this._buildLevel2(WORLD_W, WORLD_H, floorY);
    } else {
      this.buildLevel(WORLD_W, WORLD_H, floorY);
      this.buildSpikes(floorY);
    }

    // Player element shots exist in every level — the hotbar travels
    // with the player, so it can't belong to level 2's entity setup.
    this.elementProjectiles = this.physics.add.group({ allowGravity: false });
    // Food dropped by butlers — any level they can appear in.
    this.foodDrops = this.physics.add.group();

    this.player = this.createPlayer(this._respawnX, this._respawnY);
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.overlap(this.player.sprite, this.foodDrops,
      (_p, drop) => this._collectFood(drop), null, this);
    this.physics.add.overlap(
      this.player.sprite, this.spikes,
      () => this.hitBySpikes(), null, this
    );

    // Per-level entities — only level 1 has them populated for now.
    // Level 2 is terrain-only while the user iterates on pixel art for
    // the rest of the level; each conditional below is a no-op there.
    if (this._levelNum === 1) {
      this.dummy      = this.createDummy(1800, groundTop - 25 * SCALE / 2);
      this.chest      = this.createChest(3000, groundTop - 16 * 5 / 2);   // scale=5 used below
      // Patrol section 5: tiles 40-44, x=3840-4224, bordered by pit 4 (3600-3792) + pit 5 (4272-4464)
      this.patrolDummy = this.createPatrolDummy(
        4032, groundTop - 25 * SCALE / 2,   // spawn at centre of section 5
        3830, 4250                            // hard-clamp limits (see updatePatrolDummy)
      );
      // Portal — at the far end of section 6 (tiles 47-51)
      // portal.png is 32×32 px; at SCALE=3 → 96×96 display, centre at groundTop-48
      this.portal = this.createPortal(4750, groundTop - 32 * SCALE / 2);

      this.physics.add.collider(this.dummy.sprite,  this.platforms);
      this.physics.add.collider(this.chest.sprite,  this.platforms);
      this.physics.add.collider(this.patrolDummy.sprite, this.platforms);

      // Make dummy and chest solid — without these the player passes right through
      this.physics.add.collider(this.player.sprite, this.dummy.sprite);
      this.physics.add.collider(this.player.sprite, this.chest.sprite);
      // Patrol dummy is solid and can push the player off the platform
      this.physics.add.collider(this.player.sprite, this.patrolDummy.sprite);
      this.physics.add.overlap(
        this.player.sprite, this.portal,
        () => this.reachPortal(), null, this
      );

      // ── Secret star ───────────────────────────────────────────────────
      // Floats above the hidden spike pit after the portal.
      // x=5520 = centre of pit (5424-5616), y=688 = groundTop-80 (1 tile up).
      // Not visible from the portal (pit left edge 5424 is off-screen at zoom 0.65).
      this._starOrigY  = groundTop - 80;   // 688
      this._starSprite = this.physics.add.image(5520, this._starOrigY, 'star');
      this._starSprite.setScale(SCALE);
      this._starSprite.setDepth(10);
      this._starSprite.body.setAllowGravity(false);
      this._startStarBob();
      this.physics.add.overlap(
        this.player.sprite, this._starSprite,
        () => this.collectStar(), null, this
      );
    } else if (this._levelNum === 2) {
      this._buildLevel2Entities(floorY, groundTop);
    } else if (this._levelNum === 'ex') {
      // Three escalating waves across the level: a lone zombie to teach
      // the pattern, a horde to pressure it, then a swarm.  Each group is
      // spread over a span with a little jitter so they don't spawn in a
      // single stack — they have no zombie-vs-zombie collider, so they
      // pack together as they close in.
      // Build the roster first so every enemy gets a stable index-based
      // id, then create only those the checkpoint says were alive.  The
      // dead are never constructed, so no death path (and no drop) runs.
      const spread = (n, from, to, type) =>
        Array.from({ length: n }, (_, i) => ({
          type,
          x: from + (n === 1 ? 0 : (to - from) * i / (n - 1)) + Phaser.Math.Between(-20, 20),
        }));
      const cp      = this._pendingCheckpoint;
      const allowed = cp ? new Set(cp.alive) : null;
      const spawn = (specs, prefix, make) => {
        const out = [];
        specs.forEach((sp, i) => {
          const cpId = prefix + i;
          if (allowed && !allowed.has(cpId)) return;
          const e = make(sp);
          e.cpId = cpId;
          out.push(e);
        });
        return out;
      };

      // Gaps between waves (and from spawn to the first) are 20% tighter
      // than the original pass — each wave keeps its own spread, only the
      // empty space between them shrank.
      this.zombies = spawn([
        ...spread(1,  1150, 1150, 'normal'),   // first contact
        ...spread(5,  1980, 2430, 'normal'),   // horde
        ...spread(1,  2205, 2205, 'butler'),
        ...spread(20, 2950, 4050, 'normal'),   // swarm
        ...spread(5,  3100, 3900, 'butler'),
      ], 'z', sp => this._createZombie(sp.x, groundTop - 80, sp.type));
      this.zombies.forEach(z => {
        this.physics.add.collider(z.sprite, this.platforms);
        this.physics.add.collider(this.player.sprite, z.sprite);
        this.physics.add.overlap(z.sprite, this.elementProjectiles,
          (_s, pr) => { this._hitZombie(z, pr._damage || 1, pr.x,
            this._projOpts(pr)); pr.destroy(); },
          null, this);
      });

      this.lightningBolts = this.physics.add.group({ allowGravity: false });
      this.physics.add.overlap(
        this.player.sprite, this.lightningBolts,
        (_p, bolt) => this._onPlayerHitByLightning(bolt), null, this);

      this.door = this._createDoor(4500, groundTop);
      this.physics.add.collider(this.player.sprite, this.door.sprite);

      // Stationed inside the swarm, near its far end, so the third wave
      // is the one that forces you to dodge bolts while surrounded.
      this.guards = spawn([{ x: 3980 }], 'g',
        sp => this._createGuard(sp.x, groundTop - 120));
      this.guards.forEach(g => {
        this.physics.add.collider(g.sprite, this.platforms);
        this.physics.add.collider(this.player.sprite, g.sprite);
        this.physics.add.overlap(g.sprite, this.elementProjectiles,
          (_s, pr) => { this._hitGuard(g, pr._damage || 1, pr.x,
            this._projOpts(pr)); pr.destroy(); },
          null, this);
      });
    }

    this._wireProjectileObstacles();
    this._applyPendingCheckpoint();

    // The level start is itself a checkpoint, so dying before reaching
    // any other one still rewinds the world properly instead of falling
    // through to the tutorial-style respawn.  Skipped when we've just
    // restored, since that snapshot is the one to keep.
    if (this._hardCheckpoints && !this._checkpoint) {
      this._setCheckpoint(this._respawnX, this._respawnY);
    }

    if (this._levelNum === 'exboss') {
      this.zombies = [];
      this.guards  = [];
      this.surges  = this.physics.add.group({ allowGravity: false });
      this.lightningBolts = this.physics.add.group({ allowGravity: false });
      this.physics.add.overlap(this.player.sprite, this.lightningBolts,
        (_p, bolt) => this._onPlayerHitByLightning(bolt), null, this);
      this.emperor = this._createEmperor(
        this.physics.world.bounds.width - 190, groundTop);
      // He's a wall, not a ghost — the player can't walk through the throne.
      this.physics.add.collider(this.player.sprite, this.emperor.sprite);
      this._buildThroneSpikes();
      this.physics.add.overlap(this.emperor.sprite, this.elementProjectiles,
        (_s, pr) => { this._hitEmperor(pr._damage || 1, this._projOpts(pr)); pr.destroy(); }, null, this);
      this._guardTimer = EMPEROR.guardFirstMs;
    }

    // ── Camera ───────────────────────────────────────────────────────
    // followOffset(0, +181): Phaser subtracts the offset from the target,
    // so +181 lifts the camera focus 181 world-units ABOVE the player,
    // giving ~75% sky / 20% ground on screen (Dadish look).
    this.cameras.main.setZoom(GAME_ZOOM);
    if (this._levelNum === 'exboss') {
      // Bounds exactly one viewport, so the camera cannot scroll and the
      // whole arena is on screen at once — no following the player.
      const viewW = this.scale.width  / GAME_ZOOM;
      const viewH = this.scale.height / GAME_ZOOM;
      this.cameras.main.setBounds(0, BOSS_ROOM_TOP, viewW, viewH);
      this.cameras.main.stopFollow();
      this.cameras.main.centerOn(viewW / 2, BOSS_ROOM_TOP + viewH / 2);
    } else {
      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.10);
      // +107 lifts camera focus above player so ground occupies ~30% of screen height
      this.cameras.main.setFollowOffset(0, 107);
    }

    // Input
    this.keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      comma: Phaser.Input.Keyboard.KeyCodes.COMMA,
      t: Phaser.Input.Keyboard.KeyCodes.T,
      slash: Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH,
      one:   Phaser.Input.Keyboard.KeyCodes.ONE,
      two:   Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four:  Phaser.Input.Keyboard.KeyCodes.FOUR,
      five:  Phaser.Input.Keyboard.KeyCodes.FIVE,
      six:   Phaser.Input.Keyboard.KeyCodes.SIX,
      seven: Phaser.Input.Keyboard.KeyCodes.SEVEN,
      eight: Phaser.Input.Keyboard.KeyCodes.EIGHT,
    });
    // On-screen controls press these.  Each wrapped key reads as down if
    // either the physical key or its virtual twin is held, so every
    // existing `k.left.isDown` site keeps working untouched.
    //
    // Only movement/action keys are wrapped: the number keys stay real
    // Key objects because JustDown() needs them, and the element slots
    // already fire from their own pointerup handlers anyway.
    this.virtualKeys = {};
    for (const name of ['left', 'right', 'up', 'down', 'e', 't']) {
      const real = this.keys[name];
      if (!real) continue;
      this.virtualKeys[name] = false;
      const virt = this.virtualKeys;
      this.keys[name] = { get isDown() { return real.isDown || virt[name]; } };
    }
    // Phaser tracks one pointer by default, so holding a direction and
    // tapping jump would drop one of them.  Four covers both thumbs.
    this.input.addPointer(3);

    this._jumpHeld = false;
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._dummyDialogTriggered       = false;
    this._patrolDummyDialogTriggered = false;

    // ESC toggles pause
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());

    // Launch HUD in parallel (runs on top of GameScene, no camera zoom)
    this.scene.launch('HUDScene');
    // Stop the HUD when this scene shuts down (e.g. reaching portal)
    this.events.once('shutdown', () => this.scene.stop('HUDScene'));

    this.buildAnims();
    this.player.sprite.anims.play(this._animKey('idle'), true);
    if (this.dummy) this.dummy.sprite.anims.play('dummy_idle', true);
    if (this.chest) this.chest.sprite.anims.play('chest_closed', true);
    if (this.chestL2A) this.chestL2A.sprite.anims.play('chest_closed', true);
    if (this.chestL2B) this.chestL2B.sprite.anims.play('chest_closed', true);
    this.buildHUD();

    this.buildDialogBox();
    this.buildInstructionBoxes();

    // ── Dust particle emitter (jump & land bursts) ────────────────
    this.dustEmitter = this.add.particles(0, 0, 'dust', {
      lifespan:  380,
      speed:     { min: 30, max: 110 },
      angle:     { min: 160, max: 380 },   // mostly sideways / upward arc
      scale:     { start: 1.8, end: 0 },
      alpha:     { start: 0.75, end: 0 },
      gravityY:  400,
      emitting:  false,
    }).setDepth(2);

    // Catch-up for existing players who reached level 1 before the
    // element system existed: their hotbar is still empty even though
    // they've already "earned" a pick. Show the choice screen once,
    // shortly after load, instead of only on live level-up events.
    if (this._levelNum === 2 && this._level >= 1 && this._hotbar.every(s => !s)) {
      this.time.delayedCall(600, () => {
        if (this._chestSequenceActive) return;   // don't clash with an active cinematic
        this._chestSequenceActive = true;
        this._playElementChoiceScreen(() => { this._chestSequenceActive = false; });
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Background
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  //  EX level backdrop — a gold hall instead of open sky.
  //
  //  Drawn with Graphics rather than art, same as the cloud background,
  //  so it costs no new assets.  Flat fills only (no gradients) to sit
  //  alongside the pixel art, and a small vocabulary — pilasters, a
  //  moulding, a wainscot, one diamond per bay — so it reads as trim
  //  rather than clutter.  Golds match the anniversary palette.
  // ─────────────────────────────────────────────────────────────────
  _addBackgroundEX(worldW, worldH, floorY) {
    const wallBottom = floorY - TS / 2;          // 768 — where wall meets floor
    const BAY = 576, PIL_W = 44;                 // one pilaster every 6 tiles
    const CORNICE_Y = 74, CORNICE_H = 14;
    const BASE_H = 64;

    const WALL    = 0xc9a227;   // field
    const PANEL   = 0xd8b43a;   // recessed panel, a shade lighter
    const TRIM    = 0xa8801a;   // pilaster / moulding body
    const LIT     = 0xf0d060;   // lit edge
    const ACCENT  = 0xffd700;   // capitals + diamonds

    // Parallax on X only.  Scrolling Y too would slide the wall against
    // the floor every time the camera rises with a jump, detaching the
    // wainscot from the ground line.
    const g = this.add.graphics().setScrollFactor(0.6, 1).setDepth(-8);

    g.fillStyle(WALL, 1);
    g.fillRect(0, 0, worldW, wallBottom);

    // Recessed panel inside each bay.
    g.fillStyle(PANEL, 1);
    for (let x = 0; x < worldW; x += BAY) {
      g.fillRect(x + PIL_W, CORNICE_Y + CORNICE_H,
                 BAY - PIL_W * 2, wallBottom - BASE_H - CORNICE_Y - CORNICE_H);
    }

    // Cornice along the top, wainscot along the bottom.
    g.fillStyle(TRIM, 1); g.fillRect(0, CORNICE_Y, worldW, CORNICE_H);
    g.fillStyle(LIT,  1); g.fillRect(0, CORNICE_Y + CORNICE_H, worldW, 4);
    g.fillStyle(TRIM, 1); g.fillRect(0, wallBottom - BASE_H, worldW, BASE_H);
    g.fillStyle(LIT,  1); g.fillRect(0, wallBottom - BASE_H, worldW, 4);

    const diamond = (cx, cy, r, colour) => {
      g.fillStyle(colour, 1);
      g.fillTriangle(cx, cy - r, cx + r, cy, cx, cy + r);
      g.fillTriangle(cx, cy - r, cx - r, cy, cx, cy + r);
    };

    for (let x = 0; x < worldW; x += BAY) {
      // Pilaster: body, lit left edge, and a brighter flute up the
      // middle so it reads as a column rather than a flat stripe.
      g.fillStyle(TRIM, 1); g.fillRect(x, CORNICE_Y, PIL_W, wallBottom - CORNICE_Y);
      g.fillStyle(LIT,  1); g.fillRect(x, CORNICE_Y, 5,     wallBottom - CORNICE_Y);
      g.fillStyle(LIT,  1); g.fillRect(x + PIL_W / 2 - 3, CORNICE_Y, 6, wallBottom - CORNICE_Y);
      g.fillStyle(ACCENT, 1);
      g.fillRect(x - 7, CORNICE_Y, PIL_W + 14, 12);
      g.fillRect(x - 7, wallBottom - BASE_H - 12, PIL_W + 14, 12);

      // Hollow diamond centred in the bay — outer accent, panel-coloured
      // core so it reads as an inlay rather than a solid blob.
      const cx = x + BAY / 2;
      diamond(cx, 300, 30, ACCENT);
      diamond(cx, 300, 17, PANEL);
      diamond(cx, 300,  6, ACCENT);
    }
  }

  addBackground(worldW, worldH) {
    const clouds = this.add.graphics().setScrollFactor(0.15).setDepth(-8);
    clouds.fillStyle(0xffffff, 0.92);
    [
      [230, 130, 140, 48], [620, 100, 108, 38], [980, 175, 165, 54],
      [1360, 115, 125, 44], [1730, 200, 150, 52], [2110, 110, 115, 40],
      [2480, 155, 158, 50], [2860, 120, 128, 45], [3210, 185, 145, 50],
    ].forEach(([cx, cy, cw, ch]) => {
      clouds.fillEllipse(cx,             cy,            cw,        ch);
      clouds.fillEllipse(cx - cw * 0.22, cy - ch * 0.28, cw * 0.55, ch * 0.65);
      clouds.fillEllipse(cx + cw * 0.18, cy - ch * 0.22, cw * 0.50, ch * 0.60);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Level layout
  //
  //  Tile map (TS = 96px display each):
  //    [0-10]  grass section 1   right edge x=1008
  //    [11-12] PIT 1             x 1008→1200
  //    [13-20] grass section 2   right edge x=1968
  //    [21-22] PIT 2             x 1968→2160
  //    [23-30] grass section 3   right edge x=2928
  //    [31-32] PIT 3             x 2928→3120
  //    [33-37] grass section 4   right edge x=3600  (chest/checkpoint)
  //    [38-39] PIT 4             x 3600→3792
  //    [40-44] grass section 5   right edge x=4272  (patrol dummy)
  //    [45-46] PIT 5             x 4272→4464
  //    [47-51] grass section 6   right edge x=4944  (portal/end)
  // ─────────────────────────────────────────────────────────────────
  buildLevel(worldW, worldH, floorY) {
    const grass = (startX, cols) => {
      for (let i = 0; i < cols; i++)
        this.platforms.create(startX + i * TS, floorY, 'ground').setScale(SCALE).refreshBody();
    };
    const dirtRow = (y, cols) => {
      for (let i = 0; i < cols; i++)
        this.platforms.create(i * TS, y, 'dirt').setScale(SCALE).refreshBody();
    };
    const plat = (x, y) =>
      this.platforms.create(x, y, 'platform').setScale(SCALE).refreshBody();

    grass(0,        11);   // tiles  0-10
    grass(13 * TS,   8);   // tiles 13-20
    grass(23 * TS,   8);   // tiles 23-30
    grass(33 * TS,   5);   // tiles 33-37  (chest/checkpoint)
    grass(40 * TS,   5);   // tiles 40-44  (patrol dummy section)
    grass(47 * TS,   5);   // tiles 47-51  (portal/end)
    grass(52 * TS,   5);   // tiles 52-56  (secret area — leads to star pit)

    const totalCols = Math.ceil(worldW / TS) + 1;
    for (let row = 1; row <= 4; row++) dirtRow(floorY + row * TS, totalCols);

    // Platforms — bridge above each pit + mid-section steps
    plat( 5 * TS, floorY - 1 * TS);
    plat(12 * TS, floorY - 2 * TS);   // bridge over pit 1
    plat(17 * TS, floorY - 1 * TS);
    plat(22 * TS, floorY - 2 * TS);   // bridge over pit 2
    plat(27 * TS, floorY - 1 * TS);
    plat(33 * TS, floorY - 2 * TS);   // approach to chest
  }

  // ─────────────────────────────────────────────────────────────────
  //  Spikes — 8×8 texture at SCALE=3 → 24px display each.
  //  Packed edge-to-edge (step=24) so no gap exists to walk through.
  //
  //  Pit edges (world x):
  //    Pit 1: 1008 – 1200  (192px → 8 spikes)
  //    Pit 2: 1968 – 2160  (192px → 8 spikes)
  //    Pit 3: 2928 – 3120  (192px → 8 spikes)
  //    Pit 4: 3600 – 3792  (192px → 8 spikes)  borders patrol section left
  //    Pit 5: 4272 – 4464  (192px → 8 spikes)  borders patrol section right
  // ─────────────────────────────────────────────────────────────────
  buildSpikes(floorY) {
    const SW = 8 * SCALE;                    // spike display width  = 24
    const SH = 8 * SCALE;                    // spike display height = 24
    const pitFloor = floorY + TS / 2;        // top of dirt row 1   = 864
    const spikeY   = pitFloor - SH / 2;      // sprite centre        = 852

    const pitEdges = [
      [10 * TS + TS / 2, 13 * TS - TS / 2],  // 1008 → 1200
      [20 * TS + TS / 2, 23 * TS - TS / 2],  // 1968 → 2160
      [30 * TS + TS / 2, 33 * TS - TS / 2],  // 2928 → 3120
      [37 * TS + TS / 2, 40 * TS - TS / 2],  // 3600 → 3792  (pit 4, left of patrol)
      [44 * TS + TS / 2, 47 * TS - TS / 2],  // 4272 → 4464  (pit 5, right of patrol)
      [56 * TS + TS / 2, 56 * TS + TS / 2 + 192], // 5424 → 5616  (secret star pit)
    ];

    pitEdges.forEach(([left, right]) => {
      for (let x = left + SW / 2; x < right; x += SW) {
        const s = this.spikes.create(x, spikeY, 'spike');
        s.setScale(SCALE);
        // Physics body = upper 6×6 texture units (the dangerous tip)
        s.body.setSize(6, 6).setOffset(1, 0);
        s.refreshBody();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Level 2 layout (TS = 96 px, worldW = 6336 = 66 tiles)
  //
  //  Sections (left → right):
  //    0–2    spawn ground (floor level)
  //    3–13   giant spike pit + 5-step ascending bridge up to the top
  //    14–29  top safe ground (16 tiles), upper section content:
  //             Ranged Dummy 1, duck sign, 3 overhead spike platforms
  //             (must crouch under), Chest #1 (checkpoint)
  //    30–32  WIDE spike pit at TOP elevation → precision jump
  //    33–38  top safe ground (post-jump landing)
  //    33–49  floor-level ground sits directly BELOW 33–49 so the player
  //           can safely drop off the right edge of the top landing.
  //           Drop area holds Ranged Dummy 2 + block sign.
  //    50–52  small spike pit at floor, crossed via the Moving Platform
  //    53–65  floor-level ground: Chest #2 (checkpoint) + portal at end
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  //  EX level (2nd-anniversary bonus level, reward = gold skin)
  //
  //  Terrain only for now: one flat brick floor spanning the world.
  //
  //  Each Tile Block occupies a full 96px cell, the same footprint a
  //  dirt/grass block gets, so the floor reads at the same scale as
  //  levels 1 and 2 and every other system — spawn height, camera
  //  bounds, duck/stand headroom — works off the same numbers.
  // ─────────────────────────────────────────────────────────────────
  _buildLevelEX(worldW, worldH, floorY) {
    const cols = Math.ceil(worldW / TS) + 1;
    const rows = Math.ceil((worldH - (floorY - TS / 2)) / TS);

    for (let r = 0; r < rows; r++) {
      // Only the surface row carries the gold fringe; the rest is plain
      // carpet in the same crimson, so the floor reads as one slab.
      const tex = (r === 0) ? 'carpet_top' : 'carpet_fill';
      for (let c = 0; c < cols; c++) {
        this.platforms.create(c * TS, floorY + r * TS, tex)
          .setScale(SCALE).refreshBody();
      }
    }
  }

  _buildLevel2(worldW, worldH, floorY) {
    const grass = (startX, cols, y) => {
      for (let i = 0; i < cols; i++) {
        this.platforms.create(startX + i * TS, y, 'ground').setScale(SCALE).refreshBody();
      }
    };
    const dirtRow = (y, cols) => {
      for (let i = 0; i < cols; i++) {
        this.platforms.create(i * TS, y, 'dirt').setScale(SCALE).refreshBody();
      }
    };
    const plat = (x, y) =>
      this.platforms.create(x, y, 'platform').setScale(SCALE).refreshBody();

    const topY = floorY - 4 * TS;

    // Floor-level grass
    grass(0, 3, floorY);                 // spawn      (tiles 0–2)
    grass(33 * TS, 17, floorY);          // drop area  (tiles 33–49) — safe drop
    grass(53 * TS, 13, floorY);          // chest 2    (tiles 53–65)

    // Top-level grass
    grass(14 * TS, 16, topY);            // top safe A (tiles 14–29)
    // (No top-safe-B plateau — player drops from top-safe-A to the floor.)

    // Underground dirt — full width
    const totalCols = Math.ceil(worldW / TS) + 1;
    for (let row = 1; row <= 4; row++) dirtRow(floorY + row * TS, totalCols);

    // Ascending bridge over the giant spike pit
    plat( 5 * TS, floorY - 1 * TS);
    plat( 7 * TS, floorY - 2 * TS);
    plat( 9 * TS, floorY - 3 * TS);
    plat(11 * TS, floorY - 4 * TS);
    plat(13 * TS, floorY - 4 * TS);

    // Single platform off the right edge of top-safe-A (tile 29) over
    // the spike pit, softening the drop to the floor area (tile 33).
    // Kept as a single step intentionally — reserved for a later feature.
    plat(31 * TS, floorY - 2 * TS);

    // ── Three "duck-under" overhead platforms ────────────────────
    // Heights derived from the player's standing vs crouched body so
    // a standing player is blocked but a crouched one (body shrinks to
    // 14·SCALE tall in updatePlayer) slips under.  Each platform also
    // carries a row of spikes on its TOP surface, punishing any jump.
    const surfaceY    = topY - TS / 2;          // top-safe walking surface
    const standHead   = surfaceY - 27 * SCALE;  // standing body top
    const crouchHead  = surfaceY - 14 * SCALE;  // crouched body top
    // platBottom must satisfy standHead < platTop (block) and
    // crouchHead > platBottom (clear); pick the midpoint of the valid
    // window (standHead+18, crouchHead).
    const platBottom  = (standHead + 18 + crouchHead) / 2;
    const overheadY   = platBottom - 9;         // platform is 18px tall
    const overheadXs  = [20 * TS, 23 * TS, 26 * TS];
    overheadXs.forEach(px => plat(px, overheadY));

    this._buildSpikesLevel2(floorY, overheadXs, overheadY);
  }

  _buildSpikesLevel2(floorY, overheadXs, overheadY) {
    const SW = 8 * SCALE;
    const SH = 8 * SCALE;
    const pitFloor  = floorY + TS / 2;
    const spikeY    = pitFloor - SH / 2;

    const addRow = (left, right, y) => {
      for (let x = left + SW / 2; x < right; x += SW) {
        const s = this.spikes.create(x, y, 'spike');
        s.setScale(SCALE);
        s.body.setSize(6, 6).setOffset(1, 0);
        s.refreshBody();
      }
    };

    // Floor-level spike rows.  The giant pit runs from just past spawn
    // to the left edge of the drop-area grass (tile 33), so the wide
    // TOP-elevation gap over tiles 30–32 is itself a spike pit: failing
    // the precision jump drops the player four tiles onto these spikes.
    addRow(2 * TS + TS / 2, 33 * TS - TS / 2, spikeY);   // giant pit
    addRow(49 * TS + TS / 2, 52 * TS + TS / 2, spikeY);  // small pit before chest 2

    // Spikes on TOP of each overhead duck-under platform (96px wide).
    const platTop      = overheadY - 9;
    const spikeOnPlatY = platTop - SH / 2;
    overheadXs.forEach(px => addRow(px - TS / 2, px + TS / 2, spikeOnPlatY));
  }

  // ─────────────────────────────────────────────────────────────────
  //  Level 2 entities — ranged dummies, chests, moving platform
  //
  //  Spawned only on level 2 (level 1 has its own dispatch in create).
  //  All references are stored on `this` so update loop / overlap
  //  handlers can find them.
  // ─────────────────────────────────────────────────────────────────
  _buildLevel2Entities(floorY, groundTop) {
    const topY    = floorY - 4 * TS;
    const topSurf = topY - TS / 2;       // top-safe surface y
    const floorSurf = groundTop;          // floor surface y (= 768)

    // ── Projectile groups ────────────────────────────────────────
    // elementProjectiles is created in create() for every level.
    this.fireballs = this.physics.add.group({ allowGravity: false });

    // ── Ranged dummies ───────────────────────────────────────────
    // Dummy 1 — far end of top safe A, before the overhead platforms.
    //   Sprite 32×32, scale 3 → 96×96.  Sitting on top-safe surface
    //   means centre y = topSurf - 48.
    const rd1 = this._createRangedDummy(17 * TS, topSurf - 48);
    // Dummy 2 — on floor-level drop area
    const rd2 = this._createRangedDummy(46 * TS, floorSurf - 48);
    this.rangedDummies = [rd1, rd2];

    // Colliders so dummies sit on terrain (gravity-allowing → they
    // settle on whichever platform their spawn Y is above).
    this.rangedDummies.forEach(rd => {
      this.physics.add.collider(rd.sprite, this.platforms);
      this.physics.add.collider(this.player.sprite, rd.sprite);
    });

    // Enemy fireballs damage the player on overlap
    this.physics.add.overlap(
      this.player.sprite, this.fireballs,
      (_p, fb) => this._onPlayerHitByFireball(fb), null, this
    );
    // Shots annihilate each other in mid-air.  Both palettes burst at the
    // point of contact, so you can see which two shots traded.
    this.physics.add.overlap(
      this.fireballs, this.elementProjectiles,
      (a, b) => this._onShotsCollide(a, b), null, this
    );
    // Player element shots damage ranged dummies
    this.rangedDummies.forEach(rd => {
      this.physics.add.overlap(
        rd.sprite, this.elementProjectiles,
        (sp, pr) => this._onElementHitDummy(rd, pr), null, this
      );
    });

    // ── Chest #1 (checkpoint) ────────────────────────────────────
    // Sits at end of top safe A (tile 28), just before the wide gap.
    this.chestL2A = this._createChestL2(28 * TS, topSurf - 40, 'A');
    this.physics.add.collider(this.chestL2A.sprite, this.platforms);
    this.physics.add.collider(this.player.sprite, this.chestL2A.sprite);

    // ── Chest #2 (checkpoint, far end) ───────────────────────────
    this.chestL2B = this._createChestL2(62 * TS, floorSurf - 40, 'B');
    this.physics.add.collider(this.chestL2B.sprite, this.platforms);
    this.physics.add.collider(this.player.sprite, this.chestL2B.sprite);

    // ── Moving platform across the small spike pit (tiles 50–52) ─
    //   Pit covers x = 50·TS → 53·TS = 4800 → 5088.
    //   Platform travels horizontally between x=4800 and x=5088.
    //   Speed = 90 px/s (moderate steady pace).
    const mpY = floorSurf - 30;
    this.movingPlatform = this._createMovingPlatform(4900, mpY, 4800, 5088, 90);
    this.physics.add.collider(this.player.sprite, this.movingPlatform, (ps) => {
      if (ps.body.touching.down) this._riderOnMP = true;
    });

    // ── Level-2 portal at far end ───────────────────────────────
    // Sits past chest 2.  Same overlap → reachPortal flow as level 1.
    this.portal = this.createPortal(65 * TS - TS / 2, floorSurf - 48);
    this.physics.add.overlap(
      this.player.sprite, this.portal,
      () => this.reachPortal(), null, this
    );

    // ── Secret star ───────────────────────────────────────────────
    this._starOrigY  = 800;
    this._starSprite = this.physics.add.image(1500, this._starOrigY, 'star');
    this._starSprite.setScale(SCALE);
    this._starSprite.setDepth(10);
    this._starSprite.body.setAllowGravity(false);
    this._startStarBob();
    this.physics.add.overlap(
      this.player.sprite, this._starSprite,
      () => this.collectStar(), null, this
    );

    // Projectiles vs. the world.  Registered last because it needs the
    // chests / moving platform / portal to already exist.
  }

  // Both projectile groups burst on the same set of solid things.  Uses
  // overlap rather than collider so it works uniformly across static
  // bodies (platforms/spikes), immovable sprites (chests, moving
  // platform) and the portal image — no physics separation is wanted
  // anyway, since the projectile is destroyed on contact.
  //
  // Ground-hugging shots (water) are the exception: they ride along the
  // floor, so a platform *below* them is skipped while one whose top
  // sits above them — a wall — still stops them.
  _wireProjectileObstacles() {
    const solids = [
      this.platforms,
      this.spikes,
      this.chestL2A && this.chestL2A.sprite,
      this.chestL2B && this.chestL2B.sprite,
      this.movingPlatform,
      this.portal,
    ].filter(Boolean);

    const ridesOver = (pr, solid) => {
      const b = solid.body;
      return !!(pr._hugsGround && b && b.top >= pr.body.bottom - 10);
    };

    // Phaser hands the callback (sprite, groupChild) when the second
    // argument is a lone sprite but (groupChild, other) when it's a
    // group, so the projectile isn't reliably the first parameter —
    // resolve it by group membership instead of trusting the order.
    // Getting this wrong destroys the chest instead of the fireball.
    const shotFrom = (group, a, b) => (group.contains(a) ? a : b);

    for (const solid of solids) {
      if (this.fireballs) {
        this.physics.add.overlap(
          this.fireballs, solid,
          (a, b) => this._onFireballHitSolid(shotFrom(this.fireballs, a, b)),
          null, this
        );
      }
      this.physics.add.overlap(
        this.elementProjectiles, solid,
        (a, b) => this._onElementHitSolid(shotFrom(this.elementProjectiles, a, b)),
        (a, b) => {
          const pr = shotFrom(this.elementProjectiles, a, b);
          return !ridesOver(pr, pr === a ? b : a);
        },
        this
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Zombie
  //
  //  States: idle -> walk (player in aggro range) -> windup (in attack
  //  range) -> recover.  Damage lands on the windup->recover transition,
  //  i.e. the instant it snaps back to the idle pose, matching how the
  //  frames were drawn.  Taking a hit forces 'knockback', which
  //  interrupts any of the above.
  // ─────────────────────────────────────────────────────────────────
  _createZombie(x, y, type = 'normal') {
    const cfg = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.normal;
    const sprite = this.physics.add.sprite(x, y, cfg.tex).setScale(SCALE);
    sprite.body.setAllowGravity(true);
    sprite.body.pushable = false;      // player can't shove it around
    // The idle frame's alpha box runs x=5..22, but columns 5-8 are just
    // the outstretched arm (2-4px tall).  Fitting to that inflated the
    // body by 12px of empty air, so the zombie collided and took hits
    // through the gap in front of it.  Box the torso instead, and keep
    // it centred — Phaser doesn't mirror body offsets on flipX, so an
    // asymmetric box would sit on the wrong side when it faces right.
    const BODY_W = 13, BODY_H = 25;
    sprite.body.setSize(BODY_W, BODY_H)
               .setOffset((sprite.frame.width - BODY_W) / 2, 5);
    sprite.anims.play(cfg.anim + '_idle', true);
    return { sprite, cfg, type, hp: cfg.hp, maxHp: cfg.hp, dead: false,
             state: 'idle', timer: 0, cooldown: 0,
             // staggered so a group of zombies doesn't turn in unison
             turnTimer: Phaser.Math.Between(cfg.idleTurnMinMs, cfg.idleTurnMaxMs) };
  }

  _updateZombies(delta) {
    if (!this.zombies || !this.player) return;
    const ps = this.player.sprite;
    for (const z of this.zombies) {
      if (z.dead || !z.sprite.active) continue;
      const s = z.sprite, cfg = z.cfg, A = cfg.anim;

      // Frozen and stunned both stop it where it stands.  This sits ahead
      // of the timers on purpose: nothing counts down while held, so a
      // stun resumes the state machine exactly where it left off.
      if (z.frozen || z.stunned) { s.body.setVelocityX(0); continue; }

      if (z.timer    > 0) z.timer    -= delta;
      if (z.cooldown > 0) z.cooldown -= delta;

      // Summoned butlers claw up out of the floor first.  Once they've
      // landed, sink them so only the top half shows, and park the body
      // — they're underground, so nothing collides with them until they
      // finish surfacing.
      if (z.state === 'burrow') {
        s.body.setVelocityX(0);
        if (!z.burrowSunk && s.body.blocked.down) {
          z.restY = s.y;
          s.body.enable = false;
          s.y = z.restY + EMPEROR.burrowSink;
          z.burrowSunk = true;
        }
        if (z.timer <= 0) {
          if (z.restY != null) {
            s.y = z.restY;
            s.body.enable = true;
            s.body.reset(s.x, z.restY);   // resync after the parked stretch
          }
          z.state = 'idle';
          s.anims.play(A + '_idle', true);
        }
        continue;
      }
      // Knockback overrides everything until it expires.
      if (z.state === 'knockback') {
        if (z.timer <= 0) {
          z.state = 'idle';
          s.body.setVelocityX(0);
          s.anims.play(A + '_idle', true);
        }
        continue;
      }

      const dx     = ps.x - s.x;
      const dist   = Math.abs(dx);
      const facing = Math.sign(dx) || 1;

      if (z.state === 'windup') {
        s.body.setVelocityX(0);
        if (z.timer <= 0) {
          // Snapping back to idle IS the strike.
          s.anims.play(A + '_idle', true);
          z.state    = 'recover';
          z.timer    = cfg.recoverMs;
          z.cooldown = cfg.cooldownMs;
          const stillClose = Math.abs(ps.x - s.x) <= cfg.attackRange * 1.2
                          && Math.abs(ps.y - s.y) < TS;
          if (stillClose) this._damagePlayer(cfg.damage);
        }
        continue;
      }

      if (z.state === 'recover') {
        s.body.setVelocityX(0);
        if (z.timer <= 0) z.state = 'idle';
        continue;
      }

      // Out of aggro: hold position, unaware of the player, glancing
      // around every few seconds rather than staring at them.
      if (dist > cfg.aggroRange) {
        s.body.setVelocityX(0);
        s.anims.play(A + '_idle', true);
        z.turnTimer -= delta;
        if (z.turnTimer <= 0) {
          s.setFlipX(!s.flipX);
          z.turnTimer = Phaser.Math.Between(cfg.idleTurnMinMs, cfg.idleTurnMaxMs);
        }
        continue;
      }

      // In aggro — the zombie art faces left, so flipX turns it right.
      s.setFlipX(facing > 0);
      if (dist <= cfg.attackRange && z.cooldown <= 0) {
        z.state = 'windup';
        z.timer = cfg.windupMs;
        s.body.setVelocityX(0);
        s.anims.play(A + '_windup', true);
      } else {
        s.body.setVelocityX(facing * cfg.speed);
        s.anims.play(A + '_walk', true);
      }
    }
  }

  // Roll each food independently and scatter whatever drops.
  _dropFood(x, y) {
    if (!this.foodDrops) return;
    const won = FOOD_DROPS.filter(f => Math.random() < f.chance);
    won.forEach((f, i) => {
      // Fan multiple drops out so they don't stack invisibly.
      const dx = won.length === 1 ? 0 : (i - (won.length - 1) / 2) * 34;
      const d = this.foodDrops.create(x + dx, y - 20, f.tex);
      if (!d) return;
      d._foodId = f.id;
      d.setScale(SCALE * 0.7).setDepth(9);
      // Box the body to the fruit rather than the 32x32 frame, so the
      // pickup triggers where it looks like it should.
      this._fitBodyToTexture(d);
      d.body.setAllowGravity(true);
      d.body.setBounce(0.35);
      d.body.setDragX(140);
      d.body.setVelocity(Phaser.Math.Between(-40, 40), -140);
      this.physics.add.collider(d, this.platforms);
      // The idle bob starts only once it has landed — see
      // _updateFoodDrops.  Tweening y while gravity is still pulling
      // makes the two fight and the fruit judder in place.
    });
  }

  // Let each drop fall and bounce naturally, then park it and start the
  // gentle float.  Doing this on landing rather than at spawn keeps the
  // tween from fighting gravity.
  _updateFoodDrops() {
    if (!this.foodDrops) return;
    for (const d of this.foodDrops.getChildren()) {
      if (!d.active || d._settled) continue;
      if (d.body.blocked.down && Math.abs(d.body.velocity.y) < 12) {
        d._settled = true;
        d.body.setAllowGravity(false);
        d.body.setVelocity(0, 0);
        this.tweens.add({ targets: d, y: d.y - 6, duration: 640,
                          yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
  }

  _collectFood(drop) {
    if (!drop || !drop.active) return;
    const id = drop._foodId;
    drop.destroy();
    if (window.statusSheet && window.statusSheet.giveItem) {
      window.statusSheet.giveItem(id, 1);
    }
    const item = window.itemRegistry && window.itemRegistry.get(id);
    const label = this.add.text(drop.x, drop.y - 10, `+ ${item ? item.name : id}`, {
      fontSize: '13px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: label, y: label.y - 28, alpha: 0,
                      duration: 700, onComplete: () => label.destroy() });
  }

  // Damage a zombie and knock it away from `fromX`.  The knockback frame
  // is already drawn red, so no hit-flash tint is layered on top.
  // opts.knockback  element knockback, overriding the melee default
  // opts.burn       burn definition to apply
  // opts.dot        damage only — no stagger, so burn ticks don't
  //                 permanently interrupt whatever it was doing
  _hitZombie(z, dmg, fromX, opts = {}) {
    if (!z || z.dead) return;
    const s = z.sprite, cfg = z.cfg;
    // Anchored while frozen: the hit that shatters lands for extra but
    // doesn't shove, so the freeze can't be wasted by knocking them away.
    const wasFrozen = !!z.frozen;
    dmg = this._shatter(z, dmg, opts);
    z.hp = Math.max(0, z.hp - dmg);
    if (z.hp <= 0) {
      z.dead = true;
      s.body.setVelocityX(0);
      // Only butlers carry food.
      if (z.type === 'butler') this._dropFood(s.x, s.y);
      this.tweens.add({
        targets: s, angle: 90, alpha: 0, duration: 360, ease: 'Power2',
        onComplete: () => s.destroy(),
      });
      return;
    }
    this._applyHitEffects(z, opts);
    // Neither of these plays the red knockback frame, so flash instead.
    if (opts.dot || wasFrozen) { this._flashHit(z); return; }
    z.state = 'knockback';
    z.timer = cfg.knockbackMs;
    s.anims.play(cfg.anim + '_knockback', true);
    // Elements push by their own value — 0 for fire and earth, which
    // still stagger but don't shove.
    const kb = opts.knockback != null ? opts.knockback : cfg.knockbackVx;
    s.body.setVelocityX((Math.sign(s.x - fromX) || 1) * kb);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Golden Guard
  //
  //  idle -> walk -> attack (spear up, marks the player's spot) ->
  //  strike (lightning falls on the marked spot) -> recover.
  //  The mark is taken once, when the attack frame plays, so walking
  //  out of it dodges the bolt entirely.
  // ─────────────────────────────────────────────────────────────────
  _createGuard(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'golden_guard').setScale(SCALE);
    sprite.body.setAllowGravity(true);
    sprite.body.pushable = false;
    sprite.body.setSize(GUARD_BODY.w, GUARD_BODY.h);
    sprite.anims.play('gg_idle', true);
    return { sprite, hp: GUARD.hp, maxHp: GUARD.hp, dead: false,
             state: 'idle', timer: 0, cooldown: 0,
             targetX: 0, targetY: 0,
             turnTimer: Phaser.Math.Between(GUARD.idleTurnMinMs, GUARD.idleTurnMaxMs) };
  }

  _updateGuards(delta) {
    if (!this.guards || !this.player) return;
    const ps = this.player.sprite;
    for (const g of this.guards) {
      if (g.dead || !g.sprite.active) continue;
      const s = g.sprite;

      // Held in place, same as a zombie — ahead of the timers so a stun
      // suspends the wind-up rather than letting it run down.
      if (g.frozen || g.stunned) { s.body.setVelocityX(0); continue; }

      if (g.timer    > 0) g.timer    -= delta;
      if (g.cooldown > 0) g.cooldown -= delta;

      // The body box sits right of frame centre (the spear is on the
      // left), so mirror the offset by hand — flipX doesn't move it.
      s.body.setOffset(
        s.flipX ? 32 - GUARD_BODY.x - GUARD_BODY.w : GUARD_BODY.x,
        GUARD_BODY.y);

      if (g.state === 'knockback') {
        if (g.timer <= 0) { g.state = 'idle'; s.body.setVelocityX(0); s.anims.play('gg_idle', true); }
        continue;
      }

      // Spear is up: hold still, then drop the bolt on the marked spot.
      if (g.state === 'attack') {
        s.body.setVelocityX(0);
        if (g.timer <= 0) {
          g.state = 'strike';
          g.timer = GUARD.strikeDelayMs;
        }
        continue;
      }
      if (g.state === 'strike') {
        s.body.setVelocityX(0);
        if (g.timer <= 0) {
          this._spawnLightning(g.targetX, g.targetY);
          s.anims.play('gg_idle', true);
          g.state    = 'recover';
          g.timer    = GUARD.recoverMs;
          g.cooldown = GUARD.cooldownMs;
        }
        continue;
      }
      if (g.state === 'recover') {
        s.body.setVelocityX(0);
        if (g.timer <= 0) g.state = 'idle';
        continue;
      }

      const dx   = ps.x - s.x;
      const dist = Math.abs(dx);

      if (dist > GUARD.aggroRange) {
        s.body.setVelocityX(0);
        s.anims.play('gg_idle', true);
        g.turnTimer -= delta;
        if (g.turnTimer <= 0) {
          s.setFlipX(!s.flipX);
          g.turnTimer = Phaser.Math.Between(GUARD.idleTurnMinMs, GUARD.idleTurnMaxMs);
        }
        continue;
      }

      s.setFlipX(dx > 0);
      if (dist <= GUARD.attackRange && g.cooldown <= 0) {
        g.state   = 'attack';
        g.timer   = GUARD.windupMs;
        // Mark the spot once, now.  The bolt lands on the FLOOR at that
        // x — not at the player's feet, which may be mid-jump.
        g.targetX = ps.x;
        g.targetY = this._groundTopY;
        s.body.setVelocityX(0);
        s.anims.play('gg_attack', true);
      } else if (dist > GUARD.attackRange) {
        s.body.setVelocityX(Math.sign(dx) * GUARD.speed);
        s.anims.play('gg_walk', true);
      } else {
        s.body.setVelocityX(0);
        s.anims.play('gg_idle', true);
      }
    }
  }

  // Drop a bolt down the marked column.  It damages whatever it touches
  // on the way and vanishes shortly after reaching the floor, so the
  // player has to leave the column rather than just jump.
  _spawnLightning(x, groundY) {
    if (!this.lightningBolts) return;
    const bolt = this.lightningBolts.create(
      x, groundY - GUARD.strikeFallHeight, 'lightning_strike');
    if (!bolt) return;
    // The art occupies x=8..27 / y=11..25 inside a 32x32 frame, so the
    // origin is its own bottom-centre (anchoring the frame's edge would
    // float it ~21px up) and the body is boxed to just the lit pixels.
    bolt.setOrigin(17.5 / 32, 25 / 32).setScale(SCALE).setDepth(12);
    bolt.body.setAllowGravity(false);
    bolt.body.setSize(19, 14).setOffset(8, 11);
    bolt.body.setVelocityY(GUARD.strikeFallSpeed);
    bolt._groundY = groundY;
    this.cameras.main.shake(120, 0.006);
  }

  // Land bolts on the floor and clear them a moment later.
  _updateLightning() {
    if (!this.lightningBolts) return;
    for (const b of this.lightningBolts.getChildren()) {
      if (!b.active || b._landed || b.y < b._groundY) continue;
      b.y = b._groundY;                 // origin is the art's base
      b.body.setVelocityY(0);
      b._landed = true;
      this.time.delayedCall(GUARD.strikeLingerMs, () => b.destroy());
    }
  }

  _onPlayerHitByLightning(bolt) {
    if (!bolt || !bolt.active) return;
    // _damagePlayer respects i-frames, so a bolt landing during another
    // hit's invincibility is absorbed rather than stacking.
    this._damagePlayer(GUARD.damage);
    bolt.destroy();
  }

  _hitGuard(g, dmg, fromX, opts = {}) {
    if (!g || g.dead) return;
    const s = g.sprite;
    const wasFrozen = !!g.frozen;
    dmg = this._shatter(g, dmg, opts);
    g.hp = Math.max(0, g.hp - dmg);
    if (g.hp <= 0) {
      g.dead = true;
      s.body.setVelocityX(0);
      this.tweens.add({
        targets: s, angle: 90, alpha: 0, duration: 380, ease: 'Power2',
        onComplete: () => s.destroy(),
      });
      return;
    }
    this._applyHitEffects(g, opts);
    // Flashes on every hit, DOT ticks and shatters included.
    this._flashHit(g);
    if (opts.dot || wasFrozen) return;
    g.state = 'knockback';
    g.timer = GUARD.knockbackMs;
    // Armour blunts every shove, melee or elemental, by half.
    const base = opts.knockback != null ? opts.knockback : GUARD.knockbackVx;
    s.body.setVelocityX((Math.sign(s.x - fromX) || 1) * base * (1 - GUARD.knockbackResist));
  }

  // ─────────────────────────────────────────────────────────────────
  //  Golden Door
  //
  //  Attack it to open the puzzle.  Solve it and the door swings ajar;
  //  get it wrong and it fires a bolt that pins the player in place for
  //  the hit.  Scaled x6 rather than the usual x3 so the opening reads
  //  as something the player could actually walk through — at x3 the
  //  door would be 66px tall against a 93px player.
  // ─────────────────────────────────────────────────────────────────
  _createDoor(x, groundY) {
    const DOOR_SCALE = 6;
    const sprite = this.physics.add.staticImage(x, groundY, 'gold_door')
      .setOrigin(0.5, 22 / 25)      // closed door's base, so it stands on the floor
      .setScale(DOOR_SCALE);
    sprite.setFrame(0);
    sprite.refreshBody();
    return { sprite, opened: false, solving: false, passed: false };
  }

  // Called from checkAttackHit when the player swings at the door.
  _strikeDoor() {
    const d = this.door;
    if (!d || d.opened || d.solving || this._chestSequenceActive) return;
    d.solving = true;
    // Deliberately NOT a checkpoint.  Checkpointing here would make a
    // laser death free — the gauntlet is already cleared, so the player
    // would respawn at the door and retry instantly, which is exactly
    // the brute-force the damage exists to prevent.  The checkpoint is
    // awarded for going THROUGH the door instead.
    this._openDoorPuzzle();
  }

  _openDoorPuzzle() {
    const W = this.scale.width, H = this.scale.height;
    const cam = this.cameras.main;
    // The camera is zoomed to 0.65, and scrollFactor-0 objects are still
    // zoomed with it — so screen-space UI has to be drawn 1/zoom larger
    // to come out at its intended size.  Canvas coords map to local as
    // local = (canvas - centre) / zoom + centre.
    const U  = 1 / cam.zoom;
    const CX = W / 2, CY = H / 2;
    const at = (dx, dy) => [CX + dx * U, CY + dy * U];   // canvas offset -> local
    const fs = px => `${Math.round(px * U)}px`;
    const FONT = '"Arial Black", Arial, sans-serif';
    const D = 1200;

    const layer = [];
    const add = o => { o.setScrollFactor(0).setDepth(D); layer.push(o); return o; };
    const cleanup = () => layer.forEach(o => o.destroy());

    this._chestSequenceActive = true;               // freezes player input
    const puzzle = generateDoorPuzzle();

    const dim = add(this.add.rectangle(CX, CY, W * U, H * U, 0x000000, 0));
    this.tweens.add({ targets: dim, fillAlpha: 0.78, duration: 240 });

    // ── Top: how to play ─────────────────────────────────────────
    add(this.add.text(...at(0, -196), 'THE GOLDEN SEAL', {
      fontSize: fs(21), fontFamily: FONT,
      color: '#ffd700', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5));
    add(this.add.text(...at(0, -168),
      'Four elements, one per slot.  Drag the tiles in, then submit.', {
      fontSize: fs(13), fontFamily: FONT,
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5));

    // ── Top-middle: the clues ────────────────────────────────────
    puzzle.clues.forEach((c, i) => {
      add(this.add.text(...at(0, -126 + i * 26), c, {
        fontSize: fs(14), fontFamily: FONT,
        color: '#ffe9a8', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5));
    });

    // ── Bottom-middle: the four slots ────────────────────────────
    const SLOT = 54, GAP = 14;
    const rowW = 4 * SLOT + 3 * GAP;
    const slots = [];
    for (let i = 0; i < DOOR.slots; i++) {
      const dx = -rowW / 2 + SLOT / 2 + i * (SLOT + GAP);
      const [lx, ly] = at(dx, -6);
      const box = add(this.add.rectangle(lx, ly, SLOT * U, SLOT * U, 0x24242c)
        .setStrokeStyle(3 * U, 0xffd700));
      add(this.add.text(...at(dx, -6 + SLOT / 2 + 13), `${i + 1}`, {
        fontSize: fs(11), fontFamily: FONT, color: '#c9a227',
      }).setOrigin(0.5));
      slots.push({ x: lx, y: ly, box, held: null });
    }

    // ── Bottom: the draggable element tiles ──────────────────────
    const tiles = [];
    const snapRadius = SLOT * U;
    PUZZLE_EL.forEach((el, i) => {
      const dx = -rowW / 2 + SLOT / 2 + i * (SLOT + GAP);
      const [lx, ly] = at(dx, 92);
      add(this.add.rectangle(lx, ly, SLOT * U, SLOT * U, 0x3a3a44)
        .setStrokeStyle(2 * U, 0x8a8a99));
      const icon = add(this.add.sprite(lx, ly, ELEMENT_DEFS[el].icon, 0).setScale(1.7 * U));
      icon.play(ELEMENT_DEFS[el].icon);
      icon.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(icon);
      const t = { el, icon, homeX: lx, homeY: ly, slot: null };
      const home = () => {
        if (t.slot !== null && slots[t.slot].held === t) slots[t.slot].held = null;
        t.slot = null; icon.x = t.homeX; icon.y = t.homeY;
      };
      icon.on('dragstart', () => icon.setDepth(D + 2));
      icon.on('drag', (pointer) => {
        // pointer is in canvas space; convert into this layer's space.
        icon.x = (pointer.x - CX) * U + CX;
        icon.y = (pointer.y - CY) * U + CY;
      });
      icon.on('dragend', () => {
        icon.setDepth(D);
        let best = null, bestD = Infinity;
        slots.forEach((s, si) => {
          const d = Phaser.Math.Distance.Between(icon.x, icon.y, s.x, s.y);
          if (d < bestD) { bestD = d; best = si; }
        });
        if (best === null || bestD > snapRadius) { home(); return; }
        const target = slots[best];
        if (target.held && target.held !== t) {
          const other = target.held;
          other.slot = null; other.icon.x = other.homeX; other.icon.y = other.homeY;
        }
        if (t.slot !== null && slots[t.slot].held === t) slots[t.slot].held = null;
        t.slot = best; target.held = t;
        icon.x = target.x; icon.y = target.y;
      });
      tiles.push(t);
    });

    // ── Very bottom: submit ──────────────────────────────────────
    // Kept above canvas y~400, where the HUD's XP/HP bars start.
    const [bx, by] = at(0, 140);
    const btn = add(this.add.text(bx, by, '  SUBMIT  ', {
      fontSize: fs(18), fontFamily: FONT,
      color: '#3a2a00', backgroundColor: '#ffd700',
      padding: { x: Math.round(18 * U), y: Math.round(8 * U) },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#ffe870' }));
    btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#ffd700' }));
    btn.on('pointerup', () => {
      const guess = slots.map(s => (s.held ? s.held.el : null));
      if (guess.some(g => g === null)) {
        this._flashDoorMessage('Fill every slot!', '#ffd700');
        return;
      }
      tiles.forEach(t => t.icon.disableInteractive());
      btn.disableInteractive();
      if (guess.every((g, i) => g === puzzle.answer[i])) this._doorSolved(cleanup);
      else                                              this._doorFailed(cleanup);
    });
  }

  // The checkpoint is earned by passing through the open door, not by
  // reaching it — so a laser death rewinds to whatever came before and
  // actually costs the player something.
  _updateDoor() {
    const d = this.door;
    if (!d || !d.opened || d.passed || !this.player) return;
    if (this.player.sprite.x > d.sprite.x + 20) {
      d.passed = true;
      // Through the door is the boss room.  It starts its own checkpoint
      // on entry, so dying to the Emperor replays the fight rather than
      // the gauntlet that led here.
      this.cameras.main.fade(340, 0, 0, 0);
      this.time.delayedCall(380, () =>
        this.scene.start('GameScene', { level: 'exboss' }));
    }
  }

  _flashDoorMessage(text, color) {
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2, text, {
      fontSize: '54px', fontFamily: '"Arial Black", Arial, sans-serif',
      color, stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1400).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, duration: 380, delay: 620,
                      onComplete: () => t.destroy() });
    return t;
  }

  _doorSolved(cleanup) {
    this._flashDoorMessage('Correct!', '#7CFC64');
    this.time.delayedCall(900, () => {
      cleanup();
      this._chestSequenceActive = false;
      this.door.opened = true;
      this.door.solving = false;
      this.door.sprite.setFrame(1);          // swing it ajar
      this.door.sprite.refreshBody();
      // An open door has to be walkable, or solving it changes nothing.
      this.door.sprite.body.enable = false;
      this.cameras.main.shake(160, 0.005);
    });
  }

  // Wrong answer: back to the world with the player pinned in place,
  // the door fires, the hit lands, then control returns.
  _doorFailed(cleanup) {
    this._flashDoorMessage('Wrong!', '#ff4444');
    this.time.delayedCall(700, () => {
      cleanup();
      this.door.solving = false;
      this._doorLockout = true;              // player frozen, input ignored
      this._chestSequenceActive = false;
      this._fireDoorBolt();
    });
  }

  _fireDoorBolt() {
    const ps = this.player.sprite, ds = this.door.sprite;
    const dir = Math.sign(ps.x - ds.x) || -1;
    const bolt = this.physics.add.image(ds.x + dir * 30, ps.y, 'laser_bolt')
      .setScale(SCALE).setDepth(14);
    bolt.body.setAllowGravity(false);
    bolt.setFlipX(dir < 0);
    bolt.body.setVelocityX(dir * DOOR.boltSpeed);
    this._doorBolt = bolt;
    this.physics.add.overlap(ps, bolt, () => {
      if (!bolt.active) return;
      bolt.destroy();
      this._doorBolt = null;
      this._damagePlayer(DOOR.damage);
      this.time.delayedCall(260, () => { this._doorLockout = false; });
    });
    // Safety net: if it somehow misses, don't strand the player.
    this.time.delayedCall(1500, () => {
      if (this._doorBolt) { this._doorBolt.destroy(); this._doorBolt = null; }
      this._doorLockout = false;
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Golden Emperor
  //
  //  rest -> windup (scepter raised) -> beams | summon -> rest.
  //  Every `summonEvery`-th cast is a summon instead of beams.
  // ─────────────────────────────────────────────────────────────────
  _createEmperor(x, groundY) {
    // Art occupies y=16..106 of a 128px frame, so anchoring at 106/128
    // stands him on the floor.
    const sprite = this.physics.add.staticImage(x, groundY + EMPEROR.yOffset, 'golden_emperor')
      .setOrigin(0.5, 106 / 128).setScale(SCALE);
    sprite.setFrame(0);
    sprite.refreshBody();
    // Texture space -> world: the origin puts frame point (64, 106) at the
    // sprite's position, so texture pixel (tx, ty) lands at
    // sprite.x + (tx-64)*SCALE, sprite.y + (ty-106)*SCALE.  A static body
    // won't derive that from an offset, so place it outright.
    sprite.body.setSize(EMPEROR_BODY.w * SCALE, EMPEROR_BODY.h * SCALE);
    sprite.body.position.set(
      sprite.x + (EMPEROR_BODY.x - 64)  * SCALE,
      sprite.y + (EMPEROR_BODY.y - 106) * SCALE);
    sprite.body.updateCenter();
    const e = {
      sprite, hp: EMPEROR.hp, maxHp: EMPEROR.hp, dead: false,
      state: 'rest', timer: Phaser.Math.Between(2500, 4000),
      castCount: 0, beamsLeft: 0,
    };
    if (this.anims.exists('emperor_idle')) sprite.play?.('emperor_idle');
    return e;
  }

  _updateEmperor(delta) {
    const e = this.emperor;
    if (!e || e.dead) return;
    e.timer -= delta;

    if (e.state === 'rest') {
      if (e.timer <= 0) {
        e.castCount++;
        e.state = 'windup';
        e.timer = EMPEROR.windupMs;
        e.sprite.setFrame(2);                 // scepter up: the tell
      }
      return;
    }

    if (e.state === 'windup') {
      // Shimmer between the two crackle frames while charging.
      e.sprite.setFrame(((this.time.now / 90) | 0) % 2 ? 3 : 2);
      if (e.timer <= 0) {
        if (e.castCount % EMPEROR.summonEvery === 0) {
          this._emperorSummon();
          this._emperorRest(e);
        } else {
          e.state = 'beaming';
          e.beamsLeft = EMPEROR.beamCount;
          e.timer = 0;
        }
      }
      return;
    }

    if (e.state === 'beaming') {
      e.sprite.setFrame(((this.time.now / 90) | 0) % 2 ? 3 : 2);
      if (e.timer <= 0) {
        if (e.beamsLeft > 0) {
          e.beamsLeft--;
          this._markSurge();
          e.timer = EMPEROR.beamIntervalMs;
        } else {
          this._emperorRest(e);
        }
      }
    }
  }

  // The throne is ~250px tall and a surge only 240, so its top sits just
  // above every geyser — and since the peons can't jump, a player stood
  // up there is out of reach of the whole fight.  Linger on it and
  // spikes rise out of the seat; step off and they sink away again.
  //
  // A shove was tried first and was the wrong tool: the player could
  // simply hold the opposite direction and win the tug of war.  Spikes
  // aren't something input can argue with.
  _buildThroneSpikes() {
    const sp0 = this.emperor.sprite;
    const eb  = sp0.body;
    const SW  = 8 * SCALE;
    const y   = eb.top - SW / 2;
    // Texture space -> world, matching how the body was placed.
    const left  = sp0.x + (EMPEROR_THRONE.x - 64) * SCALE;
    const right = left + EMPEROR_THRONE.w * SCALE;
    this._throneSpikes = [];
    for (let x = left + SW / 2; x < right; x += SW) {
      const sp = this.spikes.create(x, y, 'spike').setScale(SCALE);
      sp.body.setSize(6, 6).setOffset(1, 0);
      sp.refreshBody();
      sp.setVisible(false);
      sp.body.enable = false;
      this._throneSpikes.push(sp);
    }
    this._throneSpikesUp = false;
    this._throneDwell = 0;
  }

  _updateThroneSpikes(delta) {
    const e = this.emperor;
    if (!e || e.dead || !this._throneSpikes || !this.player) return;
    const pb = this.player.sprite.body, eb = e.sprite.body;
    const onTop = Math.abs(pb.bottom - eb.top) < 14
               && pb.right > eb.left && pb.left < eb.right;

    if (onTop) {
      this._throneDwell += delta;
      if (!this._throneSpikesUp && this._throneDwell >= EMPEROR.throneSpikeDelayMs) {
        this._throneSpikesUp = true;
        for (const sp of this._throneSpikes) {
          sp.setVisible(true).setScale(SCALE, 0);
          sp.body.enable = true;
          this.tweens.add({ targets: sp, scaleY: SCALE, duration: 110, ease: 'Back.easeOut' });
        }
      }
      return;
    }

    this._throneDwell = 0;
    if (this._throneSpikesUp) {
      this._throneSpikesUp = false;
      for (const sp of this._throneSpikes) {
        sp.body.enable = false;
        this.tweens.add({ targets: sp, scaleY: 0, duration: 120,
                          onComplete: () => sp.setVisible(false) });
      }
    }
  }

  _emperorRest(e) {
    e.state = 'rest';
    e.timer = Phaser.Math.Between(EMPEROR.restMinMs, EMPEROR.restMaxMs);
    e.sprite.setFrame(0);
  }

  // Mark the player's current spot, then erupt there after the warning.
  // The marker is what makes the 0.5s window a warning rather than just
  // a delayed hit — without it the player has nothing to read.
  _markSurge() {
    if (!this.player) return;
    const x = this.player.sprite.x;
    const y = this._groundTopY;
    const mark = this.add.ellipse(x, y, EMPEROR.beamW * 0.9, 18, 0x8b2fd6, 0.55)
      .setDepth(9);
    this.tweens.add({ targets: mark, alpha: 0.15, scaleX: 1.15,
                      duration: EMPEROR.beamWarnMs, ease: 'Sine.easeIn' });
    this.time.delayedCall(EMPEROR.beamWarnMs, () => {
      mark.destroy();
      this._spawnSurge(x, y);
    });
  }

  _spawnSurge(x, y) {
    if (!this.surges) return;
    const s = this.surges.create(x, y, 'dark_surge');
    if (!s) return;
    // Dark Surge is drawn at final size, so scale 1 — not SCALE.
    s.setOrigin(0.5, 1).setScale(1).setDepth(11);
    s.play('dark_surge');
    s.body.setAllowGravity(false);
    s.body.setSize(EMPEROR.beamW, EMPEROR.beamH);
    s.body.setOffset(0, 0);
    this.cameras.main.shake(120, 0.004);
    this.time.delayedCall(EMPEROR.beamLifeMs, () => { if (s.active) s.destroy(); });
  }

  // Surges damage over time rather than on contact, so they bypass the
  // i-frame path used for one-off hits and drain fractionally instead.
  _updateSurges(delta) {
    if (!this.surges || !this.player || this._portalReached) return;
    const pb = this.player.sprite.body;
    const pr = new Phaser.Geom.Rectangle(pb.left, pb.top, pb.width, pb.height);
    let touching = false;
    for (const s of this.surges.getChildren()) {
      if (!s.active) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(pr, s.getBounds())) {
        touching = true; break;
      }
    }
    if (!touching) { this._surgeAcc = 0; return; }
    this._surgeAcc = (this._surgeAcc || 0) + EMPEROR.beamDps * (delta / 1000);
    const whole = Math.floor(this._surgeAcc);
    if (whole <= 0) return;
    this._surgeAcc -= whole;
    const hpBefore = this._hp;
    this._hp = Math.max(0, this._hp - whole);
    // Flash the drained slice purple on the HUD so the drain reads as
    // the surge's doing rather than generic damage.
    // Surges drain 1 HP at a time, so flashing each tick alone would be a
    // 3px sliver.  While contact continues, keep the original anchor so
    // the purple band grows to cover the whole drain.
    const now = this.time.now;
    const drainOngoing = this._surgeFlash && now < this._surgeFlash.until;
    this._surgeFlash = {
      from:  drainOngoing ? this._surgeFlash.from : hpBefore,
      to:    this._hp,
      until: now + 600,
    };
    // Lifesteal: what the surge takes, the Emperor regains.
    if (EMPEROR.lifesteal && this.emperor && !this.emperor.dead) {
      const bossBefore = this.emperor.hp;
      this.emperor.hp = Math.min(this.emperor.maxHp, this.emperor.hp + whole);
      if (this.emperor.hp > bossBefore) {
        // Same idea in reverse: the gained slice shows purple, then
        // settles to gold, so it can't be mistaken for regeneration.
        const healOngoing = this._bossHealFlash && now < this._bossHealFlash.until;
        this._bossHealFlash = {
          from:  healOngoing ? this._bossHealFlash.from : bossBefore,
          to:    this.emperor.hp,
          until: now + 600,
        };
      }
    }
    const ps = this.player.sprite;
    ps.setTintFill(0x9b4dff);
    this.time.delayedCall(70, () => { if (ps.active) ps.clearTint(); });
    if (this._hp <= 0) this.respawnPlayer();
  }

  // Five butlers claw up out of the floor, spread across the room.
  _emperorSummon() {
    if (!this.zombies) this.zombies = [];
    const roomW = this.physics.world.bounds.width;
    const n = EMPEROR.summonCount;
    for (let i = 0; i < n; i++) {
      const x = 160 + (roomW - 380) * (i / (n - 1));
      const z = this._createZombie(x, this._groundTopY - 60, 'butler');
      z.cpId = 'summon' + (this._summonSeq = (this._summonSeq || 0) + 1);
      z.state = 'burrow';
      z.timer = EMPEROR.burrowMs;
      z.sprite.anims.play('butler_burrow', true);
      this.physics.add.collider(z.sprite, this.platforms);
      this.physics.add.collider(this.player.sprite, z.sprite);
      this.physics.add.overlap(z.sprite, this.elementProjectiles,
        (_s, pr) => { this._hitZombie(z, pr._damage || 1, pr.x,
            this._projOpts(pr)); pr.destroy(); },
        null, this);
      this.zombies.push(z);
    }
  }

  // One guard at the start, then a fresh one from the left on a long
  // timer — capped, so falling behind doesn't snowball into a screen of
  // guards you can't read.
  _updateBossGuards(delta) {
    if (!this.guards || this._bossOver) return;
    this._guardTimer -= delta;
    if (this._guardTimer > 0) return;
    const alive = this.guards.filter(g => !g.dead && g.sprite.active).length;
    if (alive >= EMPEROR.guardMaxAlive) return;   // hold at the cap
    const g = this._createGuard(90, this._groundTopY - 120);
    g.cpId = 'bossguard' + (this._bossGuardSeq = (this._bossGuardSeq || 0) + 1);
    this.physics.add.collider(g.sprite, this.platforms);
    this.physics.add.collider(this.player.sprite, g.sprite);
    this.physics.add.overlap(g.sprite, this.elementProjectiles,
      (_s, pr) => { this._hitGuard(g, pr._damage || 1, pr.x,
            this._projOpts(pr)); pr.destroy(); },
      null, this);
    this.guards.push(g);
    this._guardTimer = EMPEROR.guardEveryMs;
  }

  // Knockback-immune by design, so he can't be pinned in a melee combo.
  _hitEmperor(dmg, opts = {}) {
    const e = this.emperor;
    if (!e || e.dead) return;
    // Takes damage-over-time like anything else, and shatters out of a
    // freeze — but knockback, and the freeze/stun holds themselves, are
    // ignored by design so he can't be pinned in a combo.
    dmg = this._shatter(e, dmg, opts);
    this._applyHitEffects(e, opts);
    e.hp = Math.max(0, e.hp - dmg);
    e.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (!e.dead) e.sprite.clearTint(); });
    if (e.hp <= 0) this._emperorDefeated();
  }

  // Everything he was commanding falls with him, and nothing else
  // arrives — otherwise the player is left mopping up peons after the
  // fight is already decided.
  _routMinions() {
    this._bossOver = true;
    const rout = [...(this.zombies || []), ...(this.guards || [])]
      .filter(m => !m.dead && m.sprite && m.sprite.active);
    rout.forEach((m, i) => {
      m.dead = true;
      if (m.sprite.body) m.sprite.body.setVelocityX(0);
      // Slight stagger so they drop in a wave rather than all at once.
      this.tweens.add({
        targets: m.sprite, angle: 90, alpha: 0,
        duration: 380, delay: i * 60, ease: 'Power2',
        onComplete: () => m.sprite.destroy(),
      });
    });
    if (this.lightningBolts) this.lightningBolts.clear(true, true);
    return rout.length;
  }

  _emperorDefeated() {
    const e = this.emperor;
    e.dead = true;
    if (this.surges) this.surges.clear(true, true);
    this._routMinions();
    this.cameras.main.shake(500, 0.012);
    this.tweens.add({ targets: e.sprite, alpha: 0, angle: 12, duration: 900,
                      ease: 'Power2', onComplete: () => e.sprite.destroy() });

    // The whole point of the EX level: this is the gold skin.
    this.registry.set('goldSkinUnlocked', true);
    saveProgress({ goldSkinUnlocked: true });

    const W = this.scale.width, H = this.scale.height;
    const U = 1 / this.cameras.main.zoom;
    const mk = (dy, size, text, color) =>
      this.add.text(W / 2, H / 2 + dy * U, text, {
        fontSize: `${Math.round(size * U)}px`,
        fontFamily: '"Arial Black", Arial, sans-serif',
        color, stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1300).setAlpha(0);
    const a = mk(-30, 34, 'THE EMPEROR FALLS', '#ffd700');
    const b = mk(10, 18, 'Gold skin unlocked!', '#ffffff');
    this.tweens.add({ targets: [a, b], alpha: 1, duration: 500, delay: 700 });
  }

  _createRangedDummy(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'ranged_dummy').setScale(SCALE);
    sprite.body.setAllowGravity(true);
    sprite.setCollideWorldBounds(true);
    // Idle dummy: gravity still plants it on the floor, but the player
    // can't shove it around (otherwise it slides off into the spikes).
    sprite.body.pushable = false;
    this._fitBodyToTexture(sprite, { shrink: 0.85 });
    const maxHp = 5;
    // Floating HP bar (world-space), hidden until updateRangedBars runs.
    const barBg = this.add.rectangle(0, 0, 70, 9, 0x220000).setOrigin(0.5, 1).setDepth(15).setVisible(false);
    const barFg = this.add.rectangle(0, 0, 70, 9, 0xff3333).setOrigin(0,   1).setDepth(15).setVisible(false);
    const barLb = this.add.text(0, 0, '', { fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb' })
      .setOrigin(0.5, 1).setDepth(15).setVisible(false);
    // Small flame icon shown beside the healthbar while burning.
    const fireIcon = this.add.image(0, 0, 'icon_fire', 0).setScale(1.4).setDepth(15).setVisible(false);
    const rd = { sprite, hp: maxHp, maxHp, dead: false, fireTimer: 0,
                 bar: { bg: barBg, fg: barFg, label: barLb, fireIcon }, burn: null };
    // Stagger the two dummies so they don't fire in unison.
    rd.fireTimer = 1500 + Math.random() * 1500;
    return rd;
  }

  _updateRangedBars() {
    if (!this.rangedDummies) return;
    for (const rd of this.rangedDummies) {
      const b = rd.bar;
      if (rd.dead || !rd.sprite.active) {
        b.bg.setVisible(false); b.fg.setVisible(false); b.label.setVisible(false);
        b.fireIcon.setVisible(false);
        continue;
      }
      const ds = rd.sprite, barW = 70;
      const bx = ds.x, by = ds.y - ds.displayHeight / 2 - 6;
      b.bg.setPosition(bx, by).setSize(barW, 9).setVisible(true);
      b.fg.setPosition(bx - barW / 2, by).setSize(barW * rd.hp / rd.maxHp, 9).setVisible(true);
      b.label.setPosition(bx, by - 9).setText(`HP: ${rd.hp} / ${rd.maxHp}`).setVisible(true);
      b.fireIcon.setPosition(bx + barW / 2 + 12, by).setVisible(!!rd.burn);
    }
  }

  // Applies one status at one tier.  A lower tier is ignored outright —
  // it can't downgrade an active effect and can't refresh its timer.
  // `mul` is the wearer's effect multiplier (the gold skin's 2x), applied
  // on top of whatever the tier says — tiers describe what an effect is,
  // multipliers scale it.  It stretches duration, never tick damage, so
  // doubling an effect can't outpace its own tier table.
  _applyEffect(e, kind, tier, mul = 1) {
    if (!e || e.dead || !tier) return;
    const def = (EFFECT_TIERS[kind] || [])[tier];
    if (!def) return;
    switch (kind) {
      case 'burn':
        if (e.burn && e.burn.tier > tier) return;
        e.burn = { tier, dmgPerTick: def.dmgPerTick,
                   ticksLeft: Math.round(def.ticks * mul),
                   msLeft: BURN_TICK_MS };
        break;
      case 'poison': {
        if (e.poison && e.poison.tier > tier) return;
        // Stacks share one refreshed timer rather than each tracking its
        // own expiry — simpler to display and to reason about.
        const stacks = e.poison
          ? Math.min(POISON_MAX_STACKS, e.poison.stacks + 1) : 1;
        e.poison = { tier, stacks, tickMs: def.tickMs,
                     msLeft: def.tickMs, msTotal: Math.round(def.ms * mul) };
        break;
      }
      case 'freeze':
        if (e.frozen && e.frozen.tier > tier) return;
        e.frozen = { tier, msLeft: Math.round(def.ms * mul),
                     shatter: def.shatter };
        // Freeze is a hard interrupt: a wind-up in progress is thrown
        // away.  Stun deliberately isn't — it resumes where it left off.
        if (e.state === 'windup' || e.state === 'attack') {
          e.state = 'idle';
          e.timer = 0;
        }
        break;
      case 'stun':
        if (e.stunned && e.stunned.tier > tier) return;
        e.stunned = { tier, msLeft: Math.round(def.ms * mul) };
        break;
    }
  }

  // Everything a projectile carries into a hit.  Built in one place so a
  // new status doesn't mean editing five collision handlers.
  _projOpts(pr) {
    return { knockback: pr._knockback || 0, effectMul: pr._effMul || 1,
             burn: pr._burn, poison: pr._poison,
             freeze: pr._freeze, stun: pr._stun };
  }

  // Everything an element's `opts` can inflict, in one place so the three
  // _hit* methods stay identical in what they support.
  _applyHitEffects(e, opts) {
    const mul = opts.effectMul || 1;
    if (opts.burn)   this._applyEffect(e, 'burn',   opts.burn,   mul);
    if (opts.poison) this._applyEffect(e, 'poison', opts.poison, mul);
    if (opts.freeze) this._applyEffect(e, 'freeze', opts.freeze, mul);
    if (opts.stun)   this._applyEffect(e, 'stun',   opts.stun,   mul);
  }

  // White flash for hits that play no knockback frame — burn and poison
  // ticks, and the shatter hit on a frozen target.  Without it those land
  // with no feedback at all and read as nothing happening.
  _flashHit(e) {
    const s = e && e.sprite;
    if (!s || !s.active) return;
    s.setTintFill(0xffffff);
    this.time.delayedCall(80, () => { if (!e.dead && s.active) s.clearTint(); });
  }

  // A frozen target takes its tier's multiplier on the hit that breaks
  // the freeze, and thaws.  DOT ticks don't shatter — only a real hit.
  _shatter(e, dmg, opts) {
    if (!e || !e.frozen || opts.dot) return dmg;
    const out = Math.round(dmg * e.frozen.shatter);
    e.frozen = null;
    return out;
  }

  // Ticks every damage-over-time status on every kind of enemy, and runs
  // down the two crowd-control timers.
  _updateEffects(delta) {
    const burnTick = (e, hit) => {
      if (!e || e.dead || !e.burn) return;
      e.burn.msLeft -= delta;
      if (e.burn.msLeft > 0) return;
      hit(e.burn.dmgPerTick);
      e.burn.ticksLeft -= 1;
      if (e.burn.ticksLeft > 0 && !e.dead) e.burn.msLeft += BURN_TICK_MS;
      else e.burn = null;
    };
    // Tick damage is the stack count: 1 per stack, capped at 3.
    const poisonTick = (e, hit) => {
      if (!e || e.dead || !e.poison) return;
      e.poison.msTotal -= delta;
      e.poison.msLeft  -= delta;
      if (e.poison.msLeft <= 0) {
        hit(e.poison.stacks);
        e.poison.msLeft += e.poison.tickMs;
      }
      if (e.poison.msTotal <= 0) e.poison = null;
    };
    const ccTick = (e) => {
      if (!e || e.dead) return;
      if (e.frozen  && (e.frozen.msLeft  -= delta) <= 0) e.frozen  = null;
      if (e.stunned && (e.stunned.msLeft -= delta) <= 0) e.stunned = null;
    };
    const all = (e, hit) => { burnTick(e, hit); poisonTick(e, hit); ccTick(e); };

    for (const rd of this.rangedDummies || []) all(rd, n => this._damageRangedDummy(rd, n));
    for (const z of this.zombies || [])  all(z, n => this._hitZombie(z, n, z.sprite.x, { dot: true }));
    for (const g of this.guards  || [])  all(g, n => this._hitGuard(g,  n, g.sprite.x, { dot: true }));
    if (this.emperor) all(this.emperor, n => this._hitEmperor(n, { dot: true }));
    this._updateStatusIcons();
  }

  // Ranged dummies show their flame beside a healthbar; everything else
  // has no bar, so badges sit in a row above the sprite.  Several can be
  // active at once, so they lay out side by side rather than stacking.
  _updateStatusIcons() {
    const BADGE = 32, GAP = 4;
    const mark = (e) => {
      if (!e || !e.sprite) return;
      const live = !e.dead && e.sprite.active;
      const keys = live ? activeStatuses(e) : [];
      e.statusIcons = e.statusIcons || [];
      // Grow or shrink the badge row to match what's actually active.
      while (e.statusIcons.length > keys.length) {
        const b = e.statusIcons.pop();
        b.img.destroy();
        b.tier.destroy();
      }
      while (e.statusIcons.length < keys.length) {
        e.statusIcons.push({
          img: this.add.image(0, 0, 'effect_icons', 0)
            .setDisplaySize(BADGE, BADGE).setDepth(16),
          // Numeral hangs off the badge's bottom-right corner rather than
          // sitting inside it, so it never covers the icon art.
          tier: this.add.text(0, 0, '', {
            fontSize: '14px', fontFamily: '"Arial Black", Arial, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 4,
          }).setOrigin(1, 1).setDepth(17),
        });
      }
      const rowW = keys.length * BADGE + (keys.length - 1) * GAP;
      const top  = e.sprite.y - e.sprite.displayHeight / 2 - 18;
      keys.forEach((k, i) => {
        const b  = e.statusIcons[i];
        const cx = e.sprite.x - rowW / 2 + BADGE / 2 + i * (BADGE + GAP);
        b.img.setFrame(EFFECT_ICON_FRAME[k]).setPosition(cx, top);
        const st = e[STATUS_FIELD[k]];
        b.tier.setText(ROMAN[st && st.tier] || '')
              .setPosition(cx + BADGE / 2 + 3, top + BADGE / 2 + 3);
      });
    };
    (this.zombies || []).forEach(mark);
    (this.guards  || []).forEach(mark);
    // The Emperor is deliberately absent: his statuses are drawn larger,
    // under the boss healthbar, by HUDScene._updateBossStatusIcons.
  }

  // Apply damage to a ranged dummy and kill it if HP hits 0. Shared by
  // element hits and burn ticks.
  _damageRangedDummy(rd, dmg) {
    if (rd.dead) return;
    this._flashHit(rd);
    rd.hp = Math.max(0, rd.hp - dmg);
    if (rd.hp <= 0) {
      rd.dead = true;
      rd.burn = null;
      this.tweens.add({
        targets: rd.sprite, angle: 90, alpha: 0, duration: 360, ease: 'Power2',
        onComplete: () => rd.sprite.destroy(),
      });
    }
  }

  _createChestL2(x, y, tag) {
    // NOTE: don't play 'chest_closed' here — buildAnims() hasn't run
    // yet at entity-build time.  The closed anim is started after
    // buildAnims() in create(), mirroring level 1's chest.
    const sprite = this.physics.add.sprite(x, y, 'chest').setScale(5).setImmovable(true);
    sprite.body.setAllowGravity(false);
    this._fitBodyToTexture(sprite, { frame: 0 });
    return { sprite, opened: false, tag };
  }

  _createMovingPlatform(x, y, xMin, xMax, speed) {
    const sprite = this.physics.add.image(x, y, 'moving_platform').setScale(SCALE);
    sprite.body.setAllowGravity(false);
    sprite.body.setImmovable(true);
    // Crop the hitbox to the platform's actual painted pixels (the art
    // sits inside a 32×32 frame with transparent margins).
    this._fitBodyToTexture(sprite);
    sprite._xMin = xMin;
    sprite._xMax = xMax;
    sprite._speed = speed;
    sprite._dir   = 1;
    sprite.body.setVelocityX(speed);

    // Dotted-line path indicator (drawn under the platform).
    const dots = this.add.graphics().setDepth(0);
    dots.fillStyle(0xffffff, 0.55);
    const dotR = 3, gap = 12;
    for (let dx = xMin; dx <= xMax; dx += gap) {
      dots.fillCircle(dx, y + 22, dotR);
    }
    sprite._dotsGfx = dots;
    return sprite;
  }

  // ─────────────────────────────────────────────────────────────────
  //  Respawn on spike contact
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  //  Squash-and-stretch helpers
  //
  //  Rules that prevent the three bugs:
  //  • Only ONE tween (_ssTween) runs at a time — stopped via its own
  //    reference so we NEVER call killTweensOf (which would kill the
  //    invincibility tween and leave _spikeHit = true forever).
  //  • _squashActive flag blocks re-triggering while the squash runs,
  //    stopping the spam+phase loop caused by the body briefly lifting.
  //  • stretchPlayer clears _squashActive before stopping the tween so
  //    a mid-squash jump doesn't leave the flag stuck on.
  // ─────────────────────────────────────────────────────────────────
  squashPlayer() {
    if (this._squashActive) return;          // already squashing — skip
    this._squashActive = true;
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    const s = this.player.sprite;
    // dust burst at feet on landing
    this.dustEmitter?.explode(8, s.x, s.body.bottom);
    s.setScale(SCALE);
    this._ssTween = this.tweens.add({
      targets: s,
      scaleX: SCALE * 1.1,
      scaleY: SCALE * 0.95,
      duration: 55,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => { s.setScale(SCALE); this._squashActive = false; this._ssTween = null; },
    });
  }

  stretchPlayer() {
    this._squashActive = false;              // jump cancels any ongoing squash
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    const s = this.player.sprite;
    // dust burst at feet on jump launch
    this.dustEmitter?.explode(5, s.x, s.body.bottom);
    s.setScale(SCALE);
    this._ssTween = this.tweens.add({
      targets: s,
      scaleX: SCALE * 0.95,
      scaleY: SCALE * 1.1,
      duration: 90,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => { s.setScale(SCALE); this._ssTween = null; },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Checkpoints
  //
  //  Tutorial levels (1-5) stay forgiving: death just moves the player
  //  back and everything they killed stays dead, so a cleared stretch
  //  costs nothing to re-cross.  From level 6 on (and in the EX level)
  //  death rewinds the world to the last checkpoint instead — enemies
  //  that were alive then come back, and items and XP picked up since
  //  are handed back with them, so dying can't be farmed for loot.
  // ─────────────────────────────────────────────────────────────────
  get _hardCheckpoints() {
    return this._levelNum === 'ex' || this._levelNum === 'exboss' ||
           (typeof this._levelNum === 'number' && this._levelNum >= 6);
  }

  // Put the player back where they died-from and hand back the XP,
  // level and inventory they had at that moment.  Enemy filtering has
  // already happened at spawn time.
  _applyPendingCheckpoint() {
    const cp = this._pendingCheckpoint;
    if (!cp) return;
    this._respawnX = cp.x;
    this._respawnY = cp.y;
    this.player.sprite.setPosition(cp.x, cp.y);
    this.player.sprite.body.setVelocity(0, 0);
    this._xp       = cp.xp;
    this._level    = cp.level;
    this._xpToNext = cp.xpToNext;
    this._hp       = this._maxHp;              // full heal on respawn
    if (cp.sheet && window.statusSheet) window.statusSheet.restoreState(cp.sheet);
    // Carry the snapshot forward so the next death rewinds here again.
    this._checkpoint = cp;
    this._pendingCheckpoint = null;
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  _setCheckpoint(x, y) {
    this._respawnX = x;
    this._respawnY = y;
    this._refreshCheckpointState();
  }

  // Snapshot the world as it stands right now.  Taken when a checkpoint
  // is reached and again once a chest has finished handing over its
  // rewards — that ordering is what lets the player keep the chest's
  // contents through a later death, since the chest IS the checkpoint.
  _refreshCheckpointState() {
    if (!this._hardCheckpoints) return;
    const alive = [];
    for (const z of this.zombies || []) if (!z.dead) alive.push(z.cpId);
    for (const g of this.guards  || []) if (!g.dead) alive.push(g.cpId);
    this._checkpoint = {
      x: this._respawnX, y: this._respawnY,
      alive,
      xp: this._xp, level: this._level, xpToNext: this._xpToNext,
      sheet: window.statusSheet ? window.statusSheet.snapshotState() : null,
    };
  }

  // Rewind to the last checkpoint by rebuilding the level.  Restarting
  // beats resurrecting sprites in place: no stale bodies or timers, and
  // crucially the dead enemies are never re-created, so nothing runs
  // their death path and drops duplicate loot.
  _restartAtCheckpoint() {
    const cp = this._checkpoint;
    this.scene.start('GameScene', { level: this._levelNum, checkpoint: cp });
  }

  respawnPlayer() {
    if (this._spikeHit) return;
    this._spikeHit = true;

    if (this._hardCheckpoints && this._checkpoint) {
      this.player.sprite.setTintFill(0xff4444);
      this.cameras.main.shake(180, 0.011);
      this.cameras.main.fade(420, 0, 0, 0);
      this.time.delayedCall(460, () => this._restartAtCheckpoint());
      return;
    }

    const p = this.player;
    p.isAttacking = false;
    p.sprite.body.setVelocity(0, 0);
    // Stop only the squash/stretch tween — never killTweensOf (would kill invincibility tween)
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    this._squashActive = false;
    p.sprite.setScale(SCALE);
    p.sprite.setTintFill(0xff4444);
    this.cameras.main.shake(140, 0.009);

    this.time.delayedCall(280, () => {
      p.sprite.clearTint();
      p.sprite.setPosition(this._respawnX, this._respawnY);
      p.sprite.body.setVelocity(0, 0);
      p.jumpsLeft = 2;
      this._wasOnGround = true;   // prevent phantom land-squash on respawn

      // Star is lost on death — restore it so the player can try again
      if (this._gotStar) {
        this._gotStar = false;
        this._starSprite.setVisible(true).setScale(SCALE);
        this._starSprite.body.enable = true;
        this._startStarBob();
      }

      this.tweens.add({
        targets: p.sprite, alpha: 0.35,
        duration: 75, yoyo: true, repeat: 7,
        onComplete: () => { p.sprite.setAlpha(1); this._spikeHit = false; }
      });

      // Full heal on respawn
      this._hp = this._maxHp;
    });
  }

  // Called on spike overlap: 50 damage + i-frames, only respawns at 0 HP
  hitBySpikes() {
    if (this._spikeHit) return;

    this._hp = Math.max(0, this._hp - this.SPIKE_DAMAGE);

    if (this._hp <= 0) {
      this.respawnPlayer();   // full death flow (sets i-frames itself)
      return;
    }

    // Damage without death — i-frame flash, red tint, shake
    this._spikeHit = true;
    const p = this.player;
    p.sprite.setTintFill(0xff4444);
    this.cameras.main.shake(120, 0.008);
    this.time.delayedCall(160, () => p.sprite.clearTint());
    this.tweens.add({
      targets: p.sprite, alpha: 0.35,
      duration: 75, yoyo: true, repeat: 6,
      onComplete: () => { p.sprite.setAlpha(1); this._spikeHit = false; }
    });
  }

  togglePause() {
    this._paused = !this._paused;
    if (this._paused) {
      this.physics.world.pause();
      this.anims.pauseAll();
      this.tweens.pauseAll();
    } else {
      this.physics.world.resume();
      this.anims.resumeAll();
      this.tweens.resumeAll();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Hitbox helper
  //
  //  Fits an arcade-physics body to the visible (alpha > 16) bounding
  //  box of the object's texture frame.  Pixel data is read once per
  //  (texture, frame) and cached on the Texture, so the cost is a
  //  single canvas readback per asset for the whole game session.
  //
  //  Use this for any new entity unless you have a deliberate reason
  //  to hand-tune (e.g. spikes are intentionally shrunk for player
  //  forgiveness, the player's body is hand-tuned for cross-anim
  //  consistency).
  //
  //    obj    : a physics-enabled GameObject (sprite or image)
  //    opts   : { frame?, shrink?, pad? }
  //      frame  - frame index or name to measure (default 0).  Frame
  //               sizes can vary across animations; pick the frame
  //               whose silhouette is most representative.
  //      shrink - multiplier in [0,1] applied to width AND height,
  //               keeping the bbox centred.  Use < 1 for forgiveness
  //               (e.g. 0.85 makes contact feel deliberate).
  //      pad    - extra pixel inset on every side, applied AFTER
  //               shrink (positive = smaller body).
  //
  //  Limitation: arcade physics has one AABB per body.  If a sprite's
  //  silhouette is L-shaped or has wide wings, the AABB will include
  //  empty corners.  In that case attach extra invisible child-body
  //  sprites and update their positions each tick — or move that
  //  entity to Matter.js — neither is needed for current sprites.
  // ─────────────────────────────────────────────────────────────────
  _fitBodyToTexture(obj, opts = {}) {
    const { frame = 0, shrink = 1, pad = 0 } = opts;
    const tex = obj.texture;
    if (!tex || !obj.body) return null;
    const names = tex.getFrameNames();
    const fkey  = (typeof frame === 'string')
      ? frame
      : (names[frame] !== undefined ? names[frame] : '__BASE');
    const fr = tex.frames[fkey] || tex.frames['__BASE'];
    if (!fr) return null;

    tex._alphaBBoxCache = tex._alphaBBoxCache || {};
    let bbox = tex._alphaBBoxCache[fkey];
    if (!bbox) {
      const img = tex.getSourceImage();
      const fx = fr.cutX|0, fy = fr.cutY|0;
      const fw = fr.cutWidth|0, fh = fr.cutHeight|0;
      const cv = document.createElement('canvas');
      cv.width = fw; cv.height = fh;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
      const data = ctx.getImageData(0, 0, fw, fh).data;
      let minx = fw, miny = fh, maxx = -1, maxy = -1;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          if (data[(y * fw + x) * 4 + 3] > 16) {
            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
            if (y < miny) miny = y;
            if (y > maxy) maxy = y;
          }
        }
      }
      bbox = (maxx < 0)
        ? { x: 0, y: 0, w: fw, h: fh }    // fully transparent fallback
        : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
      tex._alphaBBoxCache[fkey] = bbox;
    }
    // Apply shrink % (centred) then pad px on every side.
    const sw = Math.max(1, Math.round(bbox.w * shrink) - 2 * pad);
    const sh = Math.max(1, Math.round(bbox.h * shrink) - 2 * pad);
    const ox = bbox.x + Math.round((bbox.w - sw) / 2);
    const oy = bbox.y + Math.round((bbox.h - sh) / 2);
    obj.body.setSize(sw, sh).setOffset(ox, oy);
    return bbox;
  }

  // ─────────────────────────────────────────────────────────────────
  //  Player / Dummy / Chest
  // ─────────────────────────────────────────────────────────────────
  createPlayer(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'player_idle')
      .setScale(SCALE).setCollideWorldBounds(true).setFlipX(true);
    sprite.body.setSize(14, 27).setOffset(2, 2);
    // The weapon_attack spritesheet uses 32×32 frames while every other
    // player sheet is 18×31.  Without compensating, switching to those
    // larger frames shifts the body's world position (offset is from the
    // frame's top-left, so +x widening shifts body left).  That lets
    // the player phase into walls during the attack — including walking
    // out of a spike pit.  We re-centre the 14×27 hitbox in update() on
    // every tick (see _syncBodyToFrame) instead of relying on
    // `animationupdate`, which doesn't fire on the very first frame of
    // a freshly-played anim — that one-frame gap was the leak.
    // Equipped-weapon overlay.  Hidden until a melee weapon is in the
    // status sheet; positioned each frame to follow the player's hand.
    // Origin is near the hilt so rotations swing the blade naturally.
    // Slightly smaller than the player so it reads as held, not stuck
    // on top of the sprite.
    const weaponSprite = this.add.image(x, y, 'item_wooden_sword')
      // The Sword.png artwork is drawn DIAGONALLY: hilt grip is at
      // texture coord (~10, 21) and the blade tip is at (~26, 5), so
      // the blade naturally points up-and-right at 45° from vertical
      // even at Phaser angle 0.  Two consequences:
      //   1. Origin (0.31, 0.66) puts the rotation pivot on the grip
      //      itself (col 10 / row 21) so rotations swing the sword
      //      around the hand.
      //   2. Every applied angle is offset by -45° in
      //      _updateWeaponOverlay to undo the texture's built-in tilt
      //      so `pose.a` is the actual visual angle from vertical.
      .setScale(SCALE * 0.9).setOrigin(0.31, 0.66)
      .setVisible(false).setDepth(sprite.depth + 1);
    return { sprite, weaponSprite, jumpsLeft: 2, isAttacking: false, attackCooldown: 0 };
  }

  createDummy(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'dummy').setScale(SCALE).setImmovable(true);
    sprite.body.setAllowGravity(false);
    this._fitBodyToTexture(sprite);          // dummy fills its 27×25 frame
    const maxHp = 5;
    return { sprite, hp: maxHp, maxHp, dead: false };
  }

  createChest(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'chest').setScale(5).setImmovable(true);
    sprite.body.setAllowGravity(false);
    // Frame 0 (closed) silhouette is 14×13 starting at y=3.  Open
    // frame is taller (full 14×16); we don't refit on open because
    // the chest is one-shot and refitting would jostle the body.
    this._fitBodyToTexture(sprite, { frame: 0 });
    return { sprite, opened: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Animations
  // ─────────────────────────────────────────────────────────────────
  buildAnims() {
    const add = (key, sheet, s, e, fps, repeat = -1) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frameRate: fps, repeat,
          frames: this.anims.generateFrameNumbers(sheet, { start:s, end:e }) });
    };
    add('idle',         'player_idle',   0, 0,  4);
    add('walk',         'player_walk',   0, 3,  8);
    add('jump',         'player_jump',   0, 2,  6, 0);
    add('attack',       'player_attack', 0, 3, 12, 0);
    // Weapon swing: raise (frames 0→2) then bring down (2→0).  Plays in
    // ~0.33s (5 frames @ 15 fps) so the hit-check at 200 ms lands during
    // the downswing.  Animation is built from explicit frames so we can
    // re-use the 3 raise frames in reverse for the strike.
    if (!this.anims.exists('weapon_attack')) {
      this.anims.create({
        key: 'weapon_attack', frameRate: 15, repeat: 0,
        frames: [0, 1, 2, 1, 0].map(f => ({ key: 'player_weapon_attack', frame: f })),
      });
    }
    add('duck',         'player_duck',   0, 0,  4);
    // Static block stance — the extended-fist attack frame, held.
    add('block',        'player_attack', 3, 3,  4, 0);

    // ── Female skin — single combined sheet (frames per the user's list,
    // 0-indexed): 0 idle, 1-2 weapon-attack (1 shared with bare-fist
    // attack), 3 duck, 4 bare-fist attack frame 2, 5 unused spare idle,
    // 6-7 jump, 8-9 walk. Fewer frames than the default skin, so walk/jump
    // are simpler 2-frame cycles instead of 3-4 frame ones.
    add('idle_f',  'player_female', 0, 0, 4);
    add('duck_f',  'player_female', 3, 3, 4);
    add('walk_f',  'player_female', 8, 9, 8);
    add('jump_f',  'player_female', 6, 7, 6, 0);
    if (!this.anims.exists('attack_f')) {
      this.anims.create({
        key: 'attack_f', frameRate: 12, repeat: 0,
        frames: [1, 4].map(f => ({ key: 'player_female', frame: f })),
      });
    }
    if (!this.anims.exists('weapon_attack_f')) {
      this.anims.create({
        key: 'weapon_attack_f', frameRate: 15, repeat: 0,
        frames: [1, 2, 1].map(f => ({ key: 'player_female', frame: f })),
      });
    }
    // Static block stance — reuses the unique bare-fist attack frame.
    add('block_f', 'player_female', 4, 4, 4, 0);

    // ── Gold skin (EX-level reward) — 11 frames, 0-indexed:
    // 0 idle, 1-2 weapon attack, 3-5 bare-fist attack, 6-7 jump,
    // 8-9 walk, 10 duck.  Unlike the female sheet the bare-fist attack
    // has its own three frames rather than borrowing the weapon ones.
    add('idle_gold', 'player_gold',  0,  0, 4);
    add('duck_gold', 'player_gold', 10, 10, 4);
    add('walk_gold', 'player_gold',  8,  9, 8);
    add('jump_gold', 'player_gold',  6,  7, 6, 0);
    add('attack_gold', 'player_gold', 3, 5, 12, 0);
    if (!this.anims.exists('weapon_attack_gold')) {
      this.anims.create({
        key: 'weapon_attack_gold', frameRate: 15, repeat: 0,
        frames: [1, 2, 1].map(f => ({ key: 'player_gold', frame: f })),
      });
    }
    // Block holds the furthest-extended bare-fist frame (5), matching how
    // the other two skins freeze on their most-extended punch.
    add('block_gold', 'player_gold', 5, 5, 4, 0);

    // ── Zombie (EX level) ────────────────────────────────────────
    // 0 idle, 1-2 walk, 3 duplicate of walk 2 (skipped), 4 attack
    // wind-up, 5 knockback.  The wind-up is a pose, not the strike —
    // damage lands when the zombie snaps back to idle after it.
    add('zombie_idle',      'zombie', 0, 0, 4);
    add('zombie_walk',      'zombie', 1, 2, 6);
    add('zombie_windup',    'zombie', 4, 4, 4, 0);
    add('zombie_knockback', 'zombie', 5, 5, 4, 0);
    // Butler sheet is the same layout without the duplicate walk frame,
    // so its wind-up and knockback sit one index earlier.
    // Frame 0 is the burrow-up pose (used when the Emperor summons them
    // out of the floor), so every other frame sits one later than on the
    // original 5-frame sheet.
    add('butler_burrow',    'zombie_butler', 0, 0, 4, 0);
    add('butler_idle',      'zombie_butler', 1, 1, 4);
    add('butler_walk',      'zombie_butler', 2, 3, 9);
    add('butler_windup',    'zombie_butler', 4, 4, 4, 0);
    add('butler_knockback', 'zombie_butler', 5, 5, 4, 0);

    // ── Golden Guard ─────────────────────────────────────────────
    // Walking is a fast alternation between the idle and walk frames.
    add('gg_idle',   'golden_guard', 0, 0, 4);
    add('gg_walk',   'golden_guard', 0, 1, 10);
    add('gg_attack', 'golden_guard', 2, 2, 4, 0);

    // ── Golden Emperor ───────────────────────────────────────────
    // Frames 0-1 idle and 2-3 attack; each pair differs only in how the
    // scepter's gem crackles, so both loop as a slow shimmer.  Raising
    // the scepter (idle -> attack) is the tell.
    add('emperor_idle',   'golden_emperor', 0, 1, 3);
    add('emperor_attack', 'golden_emperor', 2, 3, 6);
    add('dark_surge',     'dark_surge',     0, 1, 10);

    add('dummy_idle',   'dummy',         0, 0,  4);
    add('dummy_hit',    'dummy',         1, 1,  4, 0);
    add('chest_closed', 'chest',         0, 0,  4);
    add('chest_open',   'chest',         1, 1,  4, 0);
    // Element hotbar/choice-screen icons — looping idle animations.
    add('icon_fire',  'icon_fire',  0, 1, 6);
    add('icon_water', 'icon_water', 0, 2, 6);
    add('icon_air',   'icon_air',   0, 0, 6);
    add('icon_earth', 'icon_earth', 0, 2, 6);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dialog system
  //
  //  Layout (canvas coords, scrollFactor 0):
  //    When PLAYER speaks  → portrait square LEFT,  gray text area RIGHT
  //    When OTHER speaks   → gray text area LEFT,   portrait square RIGHT
  //
  //  showDialog(entries) – entries: [{ speaker:'player'|'dummy', text:'...' }, ...]
  //  Space advances through entries, then closes the box.
  // ─────────────────────────────────────────────────────────────────
  buildDialogBox() {
    const W  = this.scale.width;   // 800
    const H  = this.scale.height;  // 480
    const BH = 110;                // box height
    const BX = 0;
    const BY = H - BH;            // flush to bottom edge
    const BW = W;                  // full width
    const PS = 110;                // portrait square width (= BH so it's square)

    // Background graphics (redrawn per entry)
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(20).setVisible(false);

    // Portrait image — reuses existing sprite textures cropped to the square
    const portrait = this.add.image(0, 0, 'player_idle', 0)
      .setScrollFactor(0).setDepth(22).setVisible(false);

    // Dialogue text — big, bold, white (Dadish-style readability)
    const txt = this.add.text(0, 0, '', {
      fontSize: '20px',
      fontFamily: '"Arial Black", Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      wordWrap: { width: BW - PS - 32, useAdvancedWrap: true },
      lineSpacing: 6,
    }).setScrollFactor(0).setDepth(22).setVisible(false);

    // "Press SPACE" hint — bottom-right corner of the box
    const hint = this.add.text(BX + BW - 8, BY + BH - 6, '[SPACE]', {
      fontSize: '11px', fontFamily: 'monospace', color: '#aaaaaa',
    }).setScrollFactor(0).setDepth(22).setOrigin(1, 1).setVisible(false);

    // Proximity prompt shown in world space above dummy
    const prompt = this.add.text(0, 0, '[SPACE]', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
      backgroundColor: '#000000bb', padding: { x: 5, y: 2 },
    }).setDepth(15).setOrigin(0.5, 1).setVisible(false);

    this._dialog = { active: false, queue: [], gfx, portrait, txt, hint, prompt,
                     BX, BY, BW, BH, PS };
  }

  // entries: [{ speaker: 'player'|'dummy', text: '...' }, ...]
  showDialog(entries) {
    // Freeze the player in place so they don't drift during the dialog.
    // updatePlayer is suspended while dialog.active, so without this the
    // velocity from the triggering frame persists for the whole conversation.
    this.player.sprite.body.setVelocityX(0);

    this._dialog.queue = entries.slice();
    this._dialog.active = true;
    this._dialog.prompt.setVisible(false);
    this._advanceDialog();
  }

  _advanceDialog() {
    const d = this._dialog;
    if (d.queue.length === 0) { this._closeDialog(); return; }
    const { speaker, text } = d.queue.shift();
    this._renderDialogEntry(speaker, text);
  }

  _renderDialogEntry(speaker, text) {
    const d = this._dialog;
    const { BX, BY, BW, BH, PS } = d;
    const isPlayer = speaker === 'player';

    // ── Draw background panels ─────────────────────────────────────
    d.gfx.clear().setVisible(true);

    // Outer border/shadow
    d.gfx.fillStyle(0x222222, 1);
    d.gfx.fillRect(BX - 3, BY - 3, BW + 6, BH + 6);

    if (isPlayer) {
      // Black portrait square LEFT
      d.gfx.fillStyle(0x111111, 1);
      d.gfx.fillRect(BX, BY, PS, BH);
      // Dark gray text area RIGHT
      d.gfx.fillStyle(0x444444, 1);
      d.gfx.fillRect(BX + PS, BY, BW - PS, BH);

      // Portrait — player idle sprite, centred in square.  Follows the
      // selected skin so a skinned player doesn't talk with the default face.
      d.portrait.setTexture((SKIN_BY_KEY[this._skin] || SKIN_BY_KEY.default).tex, 0)
        .setScale(4).setFlipX(true)
        .setPosition(BX + PS / 2, BY + BH / 2)
        .setVisible(true);

      // Text — right side
      d.txt.setPosition(BX + PS + 14, BY + 14)
        .setStyle({ wordWrap: { width: BW - PS - 32 } });
    } else {
      // Dark gray text area LEFT
      d.gfx.fillStyle(0x444444, 1);
      d.gfx.fillRect(BX, BY, BW - PS, BH);
      // Black portrait square RIGHT
      d.gfx.fillStyle(0x111111, 1);
      d.gfx.fillRect(BX + BW - PS, BY, PS, BH);

      // Portrait — dummy sprite, centred in square
      d.portrait.setTexture('dummy', 0)
        .setScale(4).setFlipX(false)
        .setPosition(BX + BW - PS / 2, BY + BH / 2)
        .setVisible(true);

      // Text — left side
      d.txt.setStyle({ wordWrap: { width: BW - PS - 28 } })
        .setPosition(BX + 14, BY + 14);
    }

    d.txt.setText(text).setVisible(true);
    d.hint.setVisible(true);
  }

  _closeDialog() {
    const d = this._dialog;
    d.active = false;
    d.gfx.clear().setVisible(false);
    d.portrait.setVisible(false);
    d.txt.setVisible(false);
    d.hint.setVisible(false);
  }

  // Show proximity prompt above dummy head; auto-trigger dialog on first approach
  _checkDummyProximity() {
    if (!this.dummy || this.dummy.dead || this._dummyDialogTriggered) {
      this._dialog.prompt.setVisible(false);
      return;
    }
    const dist = Math.abs(this.player.sprite.x - this.dummy.sprite.x);
    const inRange = dist < 160;

    this._dialog.prompt
      .setVisible(inRange && !this._dialog.active)
      .setPosition(this.dummy.sprite.x, this.dummy.sprite.y - 55);

    if (inRange && !this._dialog.active) {
      this._dummyDialogTriggered = true;
      this.showDialog([
        { speaker: 'dummy',  text: 'Hello.' },
        { speaker: 'player', text: "Hi! I'm here to kill you." },
        { speaker: 'dummy',  text: 'What? Why?' },
        { speaker: 'player', text: 'Because that random sign over there says so.' },
        { speaker: 'dummy',  text: 'Oh. OK then.' },
      ]);
    }
  }

  // Same pattern as _checkDummyProximity but for the patrol dummy on
  // section 5.  Fires once when the player gets close enough; never
  // re-triggers (and never if the dummy died first).
  //
  // Distance is 500 (vs the default 160 used for the first dummy) so
  // the dialogue starts before pit 4 (x=3600–3792) — at ~x=3532 —
  // giving the player time to read and dismiss before reaching the
  // pit edge or the dummy itself.  Use 160 as the default for any
  // future dialogue triggers, and only bump it when the NPC is
  // behind an obstacle the player must cross first.
  _checkPatrolDummyProximity() {
    if (!this.patrolDummy || this.patrolDummy.dead || this._patrolDummyDialogTriggered) return;
    const dist = Math.abs(this.player.sprite.x - this.patrolDummy.sprite.x);
    if (dist < 500 && !this._dialog.active) {
      this._patrolDummyDialogTriggered = true;
      this.showDialog([
        { speaker: 'player', text: 'How did you get so fast?!?' },
        { speaker: 'dummy',  text: 'LOTS OF STEROIDS.' },
        { speaker: 'player', text: 'Neat.' },
      ]);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Instruction boxes
  //
  //  Static world-space panels that float above the ground and
  //  fade in/out as the player walks into range.
  //
  //  Positions chosen so each sign is visible just before the
  //  player reaches the relevant section:
  //    1. x=280   → visible from spawn (x=120)
  //    2. x=880   → visible approaching pit 1  (starts at x=1008)
  //    3. x=1550  → visible approaching dummy   (at x=1800)
  //    4. x=2860  → visible approaching chest   (at x=3000)
  // ─────────────────────────────────────────────────────────────────
  buildInstructionBoxes() {
    const groundTop = 768;
    const boxY      = groundTop - 240;   // float 240px above ground surface
    const PAD  = 22;                     // inner padding (px)
    const FONT = 20;                     // world-space font size
    const LS   = 6;                      // extra line-spacing

    // Each level has its own set of signs.  Level 2 currently ships
    // with no signs — they'll be added as the user finishes pixel art
    // for the rest of the level.
    const defsByLevel = {
      1: [
        { x:  280, lines: ['Use WASD or arrow keys', 'to move'] },
        { x:  880, lines: ['Press W or ↑ to jump', 'Twice to double jump'] },
        { x: 1550, lines: ['Press E or , to attack', 'Kill the training dummy'] },
        { x: 2860, lines: ['Press E or , to', 'open the chest'] },
        // Secret-star sign — sits next to the star floating above the
        // hidden spike pit past the portal.  Only visible to players
        // who jump over the portal instead of stepping into it.
        { x: 5520, lines: [
          'You found a secret star!',
          "There's one of these hidden",
          'in every level. Collect',
          'them all for a surprise!',
        ] },
      ],
      2: [
        // Top safe A — just before the overhead duck platforms (tile 20).
        // topLevel:true floats it above the elevated platform, not the floor.
        { x: 18 * TS, topLevel: true,
          lines: ['Press ↓ or S to duck', 'and slip under spikes'] },
        // Floor drop area — by the second ranged dummy (tile 46)
        { x: 44 * TS, lines: ['Hold T or / to block', 'and reduce incoming damage'] },
        // Secret star — floats 160px above it, the same gap level 1's
        // star sign uses.  Explicit y because the star hangs in the air
        // rather than sitting on a surface.
        { x: 1500, y: 640, lines: [
          'Stars only save if you get',
          'to a checkpoint after',
          'getting them!',
        ] },
      ],
    };
    const defs = defsByLevel[this._levelNum] || [];
    const topSurface = groundTop - 4 * TS;   // level-2 elevated platform surface

    this._instructionBoxes = defs.map(({ x, y, lines, topLevel }) => {
      // Signs normally hang a fixed height above whichever surface they
      // belong to; `y` overrides that for ones pinned to a floating
      // object rather than to the ground.
      const boxYThis = (y != null) ? y : (topLevel ? topSurface : groundTop) - 240;
      // Size the box to the text
      const lineCount = lines.length;
      const boxH = lineCount * (FONT + LS) + PAD * 2 - LS;
      // Longest line determines width (monospace: ~12px per char at 20px font)
      const longestChars = Math.max(...lines.map(l => l.length));
      const boxW = longestChars * 12 + PAD * 2;

      const bg = this.add.graphics().setDepth(10).setVisible(false);
      // Dark navy panel
      bg.fillStyle(0x1e2340, 0.96);
      bg.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
      // Subtle lighter border
      bg.lineStyle(2, 0x4a5888, 1);
      bg.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);
      bg.setPosition(x, boxYThis);

      const txt = this.add.text(x, boxYThis, lines.join('\n'), {
        fontSize:   `${FONT}px`,
        fontFamily: '"Courier New", Courier, monospace',
        fontStyle:  'bold',
        color:      '#ffffff',
        align:      'center',
        lineSpacing: LS,
      }).setOrigin(0.5).setDepth(11).setVisible(false);

      // Show when player is roughly 500px before → 700px past the sign
      return { bg, txt, showMin: x - 500, showMax: x + 700 };
    });
  }

  _updateInstructionBoxes() {
    const px = this.player.sprite.x;
    this._instructionBoxes.forEach(({ bg, txt, showMin, showMax }) => {
      const show = px >= showMin && px <= showMax;
      bg.setVisible(show);
      txt.setVisible(show);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  HUD
  // ─────────────────────────────────────────────────────────────────
  buildHUD() {
    // Pre-create both dummy HP bar widgets up front; visibility is
    // toggled per-tick in updateDummyBar.  On levels without a dummy
    // (e.g. level 2) the bars stay hidden because their owners are
    // never set to !dead.
    const barBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1).setVisible(false);
    const barFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1).setVisible(false);
    const barLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1).setVisible(false);
    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    const pBarBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1).setVisible(false);
    const pBarFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1).setVisible(false);
    const pBarLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1).setVisible(false);
    this.patrolDummyBar = { bg: pBarBg, fg: pBarFg, label: pBarLabel };

    const { width, height } = this.scale;
    this.add.text(width/2, 18,
      'Arrow/WASD = move   ↑/W = jump (×2)   ↓/S = duck   E or , = attack',
      { fontSize:'11px', fontFamily:'monospace',
        color:'#1a3a5c', backgroundColor:'#ffffffcc', padding:{x:10,y:5} }
    ).setOrigin(0.5, 0).setScrollFactor(0);

    this.victoryText = this.add.text(width/2, height/2, '  Level Complete!  ', {
      fontSize:'36px', fontFamily:'"Arial Black", Arial, sans-serif',
      color:'#ff5722', stroke:'#ffffff', strokeThickness:6,
      backgroundColor:'#ffffffcc', padding:{x:24,y:14}
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(10);

    this.checkpointText = this.add.text(width/2, height/2 - 60, '✓  Checkpoint!', {
      fontSize:'24px', fontFamily:'"Arial Black", Arial, sans-serif',
      color:'#ffffff', stroke:'#2d6a4f', strokeThickness:5,
      backgroundColor:'#2d6a4fdd', padding:{x:18,y:10}
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(10);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Update loop
  // ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    // Frozen when paused — physics.world is also paused so entities stay put
    if (this._paused) return;

    // These always run — even during dialog
    this._updateInstructionBoxes();
    this.updatePatrolDummy();   // must never pause: dummy roams off-platform if skipped

    // Space advances or closes the dialog box
    if (this._dialog.active) {
      if (Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
        this._advanceDialog();
      }
      this.updateDummyBar();
      return;   // freeze player input while dialog is open
    }

    // Chest cinematic: freeze input & player, allow Space to skip ahead.
    if (this._chestSequenceActive) {
      const bod = this.player && this.player.sprite && this.player.sprite.body;
      if (bod) bod.setVelocity(0, bod.velocity.y);    // arrest horizontal drift
      if (Phaser.Input.Keyboard.JustDown(this._spaceKey) && this._chestSkipHandler) {
        this._chestSkipHandler();
      }
      this.updateDummyBar();
      return;
    }

    this.updatePlayer(delta);
    this.updateDummyBar();
    this._checkDummyProximity();
    this._checkPatrolDummyProximity();
    this._updateElements(delta);
    this._updateBlockInput();
    this._updateLevel2(delta);
    this._updateZombies(delta);
    this._updateFoodDrops();
    this._updateGuards(delta);
    this._updateDoor();
    if (this._levelNum === 'exboss') {
      this._updateEmperor(delta);
      this._updateThroneSpikes(delta);
      this._updateSurges(delta);
      this._updateBossGuards(delta);
    }
    this._updateLightning();
  }

  // Per-frame tick for level-2-specific systems: ranged dummies firing,
  // projectile cleanup, moving platform reversal, element cooldown.
  // Element cooldowns and spent shots — every level, since the hotbar
  // travels with the player.
  _updateElements(delta) {
    if (this._hotbar) {
      for (const slot of this._hotbar) {
        if (slot && slot.cooldownRemaining > 0) {
          slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - delta);
        }
      }
    }
    if (this.elementProjectiles) {
      this.elementProjectiles.children.iterate(pr => {
        if (!pr) return;
        // Each shot has its own _maxX travel cap stored at spawn.
        if (pr._dir > 0 && pr.x > pr._maxX) pr.destroy();
        else if (pr._dir < 0 && pr.x < pr._maxX) pr.destroy();
      });
    }
    this._updateEffects(delta);
  }

  _updateLevel2(delta) {
    if (this._levelNum !== 2) return;
    this._updateRangedBars();

    // ── Ranged dummies: shoot a fireball every ~3s ────────────────
    if (this.rangedDummies) {
      for (const rd of this.rangedDummies) {
        if (rd.dead) continue;
        rd.fireTimer -= delta;
        if (rd.fireTimer <= 0) {
          rd.fireTimer = 3000;
          this._fireBlueFireball(rd);
        }
      }
    }

    // ── Recycle off-screen / dead projectiles ────────────────────
    if (this.fireballs) {
      this.fireballs.children.iterate(fb => {
        if (!fb) return;
        if (fb.x < -64 || fb.x > this.physics.world.bounds.width + 64) fb.destroy();
      });
    }
    // ── Moving platform: bounce between x bounds + carry rider ───
    if (this.movingPlatform) {
      const mp = this.movingPlatform;
      if (mp._dir === 1 && mp.x >= mp._xMax) {
        mp._dir = -1; mp.body.setVelocityX(-mp._speed);
      } else if (mp._dir === -1 && mp.x <= mp._xMin) {
        mp._dir =  1; mp.body.setVelocityX(mp._speed);
      }
      // Carry the player: arcade physics doesn't move a rider with an
      // immovable platform, so add the platform's per-frame delta to
      // the player's x while they stand on top.  Riding is detected via
      // the actual collider's touching.down flag (set this frame by the
      // collider callback) rather than an approximate bounding-box check,
      // which could drop out near the platform's edges and let the
      // player get left behind mid-air.
      const ps = this.player.sprite;
      const dx = (mp._prevX == null) ? 0 : (mp.x - mp._prevX);
      if (this._riderOnMP && dx !== 0) ps.x += dx;
      this._riderOnMP = false;
      mp._prevX = mp.x;
    }
  }

  // Spawn a Blue_Fireball travelling straight left or right toward
  // wherever the player currently is.  Damage on overlap = 5.
  _fireBlueFireball(rd) {
    if (!this.fireballs || !this.player) return;
    const ps = this.player.sprite;
    const dir = ps.x < rd.sprite.x ? -1 : 1;
    const fb = this.fireballs.create(rd.sprite.x + dir * 60, rd.sprite.y, 'blue_fireball', 0);
    if (!fb) return;
    fb.setScale(SCALE);
    fb.body.setAllowGravity(false);
    fb.setFlipX(dir < 0);
    // Crop to the painted pixels like every other shot.  The art is only
    // 16x7 inside its 32x32 frame, so the old hand-written 20x16 body was
    // more than twice the visual height — fireballs connected while
    // visibly passing above or below.  The bbox is horizontally centred,
    // so flipX needs no mirrored offset here.
    this._fitBodyToTexture(fb, { frame: 0 });
    fb.body.setVelocityX(dir * 160);   // 0.8× the player's 200px/s run speed
    fb._damage = 5;
    // Two-frame loop animation
    if (!this.anims.exists('blue_fireball_loop')) {
      this.anims.create({
        key: 'blue_fireball_loop', frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers('blue_fireball', { start: 0, end: 1 }),
      });
    }
    fb.anims.play('blue_fireball_loop', true);
  }

  _onPlayerHitByFireball(fb) {
    if (!fb || !fb.active) return;
    const fx = fb.x, fy = fb.y;
    if (this._spikeHit) { this._explodeFireball(fx, fy); fb.destroy(); return; }   // i-frames absorb
    let dmg = fb._damage || 5;
    // Blocking is a base stance: it knocks 2 off incoming damage, and
    // an equipped shield adds its defenceLevel on top (so a shield
    // fully negates a 3-damage fireball).  Without a shield the player
    // still takes the chip damage.
    if (this._blocking) {
      dmg = Math.max(0, dmg - (2 + this._shieldDefence()));
    }
    this._explodeFireball(fx, fy);
    fb.destroy();
    if (dmg <= 0) {
      // Flash white briefly to show a successful block
      this.player.sprite.setTintFill(0xffffff);
      this.time.delayedCall(80, () => this.player.sprite.clearTint());
      return;
    }
    this._damagePlayer(dmg);
  }

  // Take `dmg` off the player with the standard hit reaction: red flash,
  // screen shake, and a blink of invincibility (_spikeHit) so a single
  // source can't chain-hit.  Shared by fireballs and zombie strikes.
  // Returns false when i-frames swallowed the hit.
  _damagePlayer(dmg) {
    if (this._spikeHit || dmg <= 0) return false;
    this._hp = Math.max(0, this._hp - dmg);
    if (this._hp <= 0) { this.respawnPlayer(); return true; }
    this._spikeHit = true;
    const ps = this.player.sprite;
    ps.setTintFill(0xff4444);
    this.cameras.main.shake(100, 0.007);
    this.time.delayedCall(140, () => ps.clearTint());
    this.tweens.add({
      targets: ps, alpha: 0.4,
      duration: 70, yoyo: true, repeat: 5,
      onComplete: () => { ps.setAlpha(1); this._spikeHit = false; }
    });
    return true;
  }

  // Fireball hit solid terrain — burst into blue pixels and vanish.
  _onFireballHitSolid(fb) {
    if (!fb || !fb.active) return;
    this._explodeFireball(fb.x, fb.y);
    fb.destroy();
  }

  // Scatter a handful of little blue squares from (x, y) that fly
  // outward, shrink, and fade — the fireball "exploding into pixels".
  // A player element shot striking terrain (or a chest / platform /
  // portal) bursts in its own colours instead of passing through.
  _onElementHitSolid(pr) {
    if (!pr || !pr.active) return;
    this._burstPixels(pr.x, pr.y, pr._burstColors || [0xffffff]);
    pr.destroy();
  }

  _explodeFireball(x, y) {
    this._burstPixels(x, y, [0x9be3ff, 0x5cc6ff, 0x2f8fff, 0x1f63dd]);
  }

  // A player shot and an enemy fireball met in mid-air: both die, and
  // both burst at the point of contact so the trade reads as one event
  // in two colours rather than two explosions in different places.
  // Phaser doesn't promise argument order across groups, so work out
  // which is which rather than assuming.
  _onShotsCollide(a, b) {
    const pr = this.elementProjectiles.contains(a) ? a : b;
    const fb = (pr === a) ? b : a;
    if (!pr || !fb || !pr.active || !fb.active) return;
    const mx = (pr.x + fb.x) / 2, my = (pr.y + fb.y) / 2;
    this._burstPixels(mx, my, pr._burstColors || [0xffffff]);
    this._explodeFireball(mx, my);
    pr.destroy();
    fb.destroy();
  }

  _burstPixels(x, y, colors) {
    for (let i = 0; i < 11; i++) {
      const sz = (3 + Math.random() * 4) * (SCALE / 3);
      const px = this.add.rectangle(x, y, sz, sz, colors[i % colors.length])
        .setDepth(12);
      const ang  = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 28;
      this.tweens.add({
        targets: px,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: 260 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => px.destroy(),
      });
    }
  }

  _onElementHitDummy(rd, pr) {
    if (rd.dead || !pr || !pr.active) return;
    const dmg = pr._damage || 1;
    pr.destroy();
    rd.sprite.setTintFill(0xffffff);
    this.time.delayedCall(80, () => { if (!rd.dead) rd.sprite.clearTint(); });
    // Knockback for Water/Air
    if (pr._knockback) {
      rd.sprite.body.setVelocityX(pr._dir * pr._knockback);
      this.time.delayedCall(200, () => { if (rd.sprite?.active) rd.sprite.body.setVelocityX(0); });
    }
    // Same status pipeline as every other enemy — dummies just show a
    // flame beside their healthbar instead of a badge row.
    this._applyHitEffects(rd, this._projOpts(pr));
    this._damageRangedDummy(rd, dmg);
  }

  _isShielded() {
    if (!window.statusSheet) return false;
    const eq = window.statusSheet.getState().equipment;
    return !!(eq && eq.defence && eq.defence.itemId);
  }

  _shieldDefence() {
    if (!window.statusSheet || !window.itemRegistry) return 0;
    const slot = window.statusSheet.getState().equipment?.defence;
    const id = slot?.itemId;
    if (!id) return 0;
    const item = window.itemRegistry.get(id);
    return Math.max(0, Number(item?.stats?.defenceLevel) || 0);
  }

  // Block state, updated on every level.  This used to live inside
  // _updateLevel2, which returns early unless _levelNum === 2 — so
  // outside the tutorial the stance animation played but _blocking never
  // became true, leaving the shield invisible and the damage reduction
  // switched off.  Gated on owning a shield, so both stay off without one.
  _updateBlockInput() {
    const k = this.keys;
    this._blocking = !!(k && (k.t.isDown || k.slash.isDown)) && this._isShielded();
    this._updateShieldOverlay();
  }

  // Floats a shield image on the player's free hand while blocking.
  _updateShieldOverlay() {
    if (!this.player) return;
    if (!this._shieldOverlay) {
      this._shieldOverlay = this.add.image(0, 0, 'shield_overlay')
        .setScale(SCALE * 0.7).setDepth(this.player.sprite.depth + 1).setVisible(false);
    }
    // _blocking is already gated on _isShielded(), so this follows it.
    const show = this._blocking;
    this._shieldOverlay.setVisible(show);
    if (!show) return;
    const s = this.player.sprite;
    const dir = s.flipX ? 1 : -1;   // facing/forward direction
    // Sits on the extended lead hand, at arm height, above the player so
    // it covers the fist.  Scale is deliberately under 1x SCALE — at 1.05
    // it read as a tower shield against a 54x93 player.
    this._shieldOverlay.setScale(SCALE * 0.75);
    this._shieldOverlay.setPosition(s.x + dir * 14, s.y + 8);
    this._shieldOverlay.setFlipX(dir < 0);
    this._shieldOverlay.setDepth(s.depth + 2);
  }

  // Fire whichever element sits in hotbar slot `idx` (0-based). Called by
  // key-press handling in _tryFireElement and by HUD slot clicks.
  _fireElementInSlot(idx) {
    if (!this.elementProjectiles) return;
    const slot = this._hotbar && this._hotbar[idx];
    if (!slot || slot.cooldownRemaining > 0) return;
    const def = ELEMENT_DEFS[slot.element];
    if (!def) return;
    slot.cooldownRemaining = def.reload;

    const ps = this.player.sprite;
    const dir = ps.flipX ? 1 : -1;
    const startX = ps.x + dir * 36;
    const pr = this.elementProjectiles.create(startX, ps.y, def.icon, 0);
    if (!pr) return;
    pr.play(def.icon);
    pr.setScale(SCALE * (def.scale || 0.6));
    pr.setFlipX(dir < 0);
    pr.body.setAllowGravity(false);
    pr.body.setVelocityX(dir * def.speed);
    // Skin modifiers — the gold skin doubles elemental damage and the
    // riders that come with it (knockback, and burn duration).
    const mods   = (SKIN_BY_KEY[this._skin] || {}).mods || {};
    const dmgMul = mods.elementDamage || 1;
    const effMul = mods.elementEffect || 1;

    pr._dir = dir;
    pr._damage = Math.round(def.damage * dmgMul);
    pr._maxX = startX + dir * def.range * 32;
    pr._burstColors = def.burst;
    if (def.knockback) pr._knockback = def.knockback * effMul;
    // Statuses travel as a tier number; the multiplier rides alongside so
    // the tier table stays the single source of truth for what each does.
    pr._effMul = effMul;
    if (def.burn)   pr._burn   = def.burn;
    if (def.poison) pr._poison = def.poison;
    if (def.freeze) pr._freeze = def.freeze;
    if (def.stun)   pr._stun   = def.stun;
    // Crop the hitbox to the painted pixels.  Each element's art fills
    // only part of its 32x32 frame, so the default full-frame body would
    // burst the shot well before it visually touches anything now that
    // projectiles collide with terrain.  Air opts out: its art is a tiny
    // 8x8 puff and the roomy full-frame box is what makes it land.
    if (def.fitBody !== false) this._fitBodyToTexture(pr, { frame: 0 });
    // Ground-huggers ride the surface the player is standing on rather
    // than flying at chest height.  Place, measure, then correct — that
    // lands the *visible* bottom on the ground whatever the art's
    // padding, scale or origin happen to be.
    if (def.hugsGround) {
      pr._hugsGround = true;
      pr.y = ps.body.bottom;
      pr.body.updateFromGameObject();
      pr.y += ps.body.bottom - pr.body.bottom;
      pr.body.updateFromGameObject();
    }
  }

  // Fire keys '1'-'8' → hotbar slots 0-7. Edge-triggered so holding
  // doesn't auto-fire — the per-slot cooldown still gates rate anyway.
  _tryFireElement(k) {
    if (!k) return;
    const slotKeys = [k.one, k.two, k.three, k.four, k.five, k.six, k.seven, k.eight];
    for (let i = 0; i < slotKeys.length; i++) {
      if (slotKeys[i] && Phaser.Input.Keyboard.JustDown(slotKeys[i])) this._fireElementInSlot(i);
    }
  }

  // Drive the sword overlay through an asymmetric arc on each swing:
  // a low windup behind the shoulder, a hard chop down past the rest
  // pose, then a smooth recover back to rest.  Position and angle are
  // both tweened so the blade follows the hand smoothly across the
  // motion — independent of the 3-frame `weapon_attack` spritesheet,
  // which is symmetric (same frames on the way up and down).
  _beginSwingTween(p) {
    p._swing = { x: 4, y: 7, a: 30 };          // start at REST
    this.tweens.killTweensOf(p._swing);
    this.tweens.chain({
      targets: p._swing,
      onComplete: () => { p._swing = null; },
      tweens: [
        // Windup — small backward cock at shoulder height.  Blade
        // stays mostly upright (a=-20°) instead of folding behind the
        // head.
        { x: 5, y: 5, a: -20, duration: 110, ease: 'Sine.easeIn'  },
        // Chop down — committed strike that goes well past the rest
        // line so the swing actually visibly comes DOWN.
        { x: 9, y: 13, a: 150, duration: 110, ease: 'Sine.easeIn'  },
        // Recover — smooth return to the up-right rest pose.
        { x: 4, y: 7,  a:  30, duration: 150, ease: 'Sine.easeOut' },
      ],
    });
  }

  // Map a semantic animation name to the actual Phaser anim key for the
  // currently selected skin (e.g. 'duck' -> 'duck_f' when playing as the
  // female skin), and the reverse — strip a skin suffix back down to the
  // semantic name for lookups (POSE table, sheathed-check) that only key
  // off the base name.
  _animKey(base) {
    const suffix = SKIN_ANIM_SUFFIX[this._skin] || '';
    return base + suffix;
  }
  // Strips whichever skin suffix an anim key carries, so 'duck_gold' and
  // 'duck_f' both look up POSE.duck.  Driven off SKINS rather than a
  // hard-coded '_f' — the gold skin's '_gold' fell straight through that
  // and every pose silently fell back to idle, which is why its sword
  // hung at the hip while ducking instead of sheathing across the back.
  _animBase(key) {
    if (!key) return key;
    for (const sk of SKINS) {
      if (sk.suffix && key.endsWith(sk.suffix)) return key.slice(0, -sk.suffix.length);
    }
    return key;
  }

  // Re-centre the 14×27 hitbox inside whatever frame the sprite is
  // currently displaying.  Cheap to call every tick (idempotent when
  // the frame width hasn't changed), and crucially closes the
  // one-frame window where `animationupdate` hasn't fired yet on a
  // freshly-played anim with a different frame size.
  _syncBodyToFrame(s) {
    const fw = s.frame.width;
    const want = (fw - 14) / 2;
    if (s.body.offset.x !== want) {
      s.body.setSize(14, 27).setOffset(want, 2);
    }
  }

  updatePlayer(delta) {
    const p = this.player, s = p.sprite, bod = s.body, k = this.keys;
    // Pinned in place while the door's bolt is in flight — the player
    // watches it land rather than dodging it.
    if (this._doorLockout) {
      bod.setVelocityX(0);
      s.anims.play(this._animKey('idle'), true);
      return;
    }
    // Portal reached — input is locked while the level-complete
    // sequence plays (player + portal shrink, then MapScene).
    if (this._portalReached) return;
    this._syncBodyToFrame(s);
    const onGround = bod.blocked.down;
    if (onGround) p.jumpsLeft = 2;
    if (p.attackCooldown > 0) p.attackCooldown -= delta;

    // ── Squash on landing ─────────────────────────────────────────
    // _squashActive guard stops re-triggering while the tween is still running
    if (onGround && !this._wasOnGround && !this._squashActive) this.squashPlayer();
    this._wasOnGround = onGround;

    if (p.isAttacking) { this.applyHorizontalMove(p, k, 0.6); this._updateWeaponOverlay(); return; }

    if ((k.e.isDown || k.comma.isDown) && p.attackCooldown <= 0) {
      p.isAttacking = true; p.attackCooldown = 600;
      const armed   = this._isArmedMelee();
      const animKey = this._animKey(armed ? 'weapon_attack' : 'attack');
      s.anims.play(animKey, true);
      s.once('animationcomplete-' + animKey, () => { p.isAttacking = false; });
      this.time.delayedCall(200, () => this.checkAttackHit());
      if (armed) this._beginSwingTween(p);
      return;
    }

    // ── Block stance (level 2) ───────────────────────────────────
    // Hold T or '/' to guard: freeze into the extended-fist attack
    // frame (no weapon in hand), sheath the sword across the back, and
    // raise the shield over the lead hand/arm.  Movement still works,
    // but duck and jump are locked out so the player commits to the
    // stance.  Placed BEFORE the jump/duck branches so it preempts them.
    // Requires an actually-equipped shield — without one there's nothing
    // to guard with, so a player who skipped chest A can't block.
    if ((k.t.isDown || k.slash.isDown) && onGround
        && this._isShielded()) {
      this._tryFireElement(k);
      this.applyHorizontalMove(p, k, 1);
      s.anims.play(this._animKey('block'), true);
      // Make sure the standing hitbox is restored — block must not leave
      // the player crouched if they pressed T mid-duck.
      if (s.body.sourceHeight !== 27 && this._hasStandHeadroom(s)) {
        s.body.setSize(14, 27).setOffset((s.frame.width - 14) / 2, 2);
      }
      this._updateWeaponOverlay();
      this._updateShieldOverlay();
      // Reset the jump-rising-edge guard so a queued up-press while
      // blocking doesn't fire the moment the block is released.
      this._jumpHeld = k.up.isDown || k.w.isDown;
      return;
    }

    const jp = k.up.isDown || k.w.isDown;
    if (jp && !this._jumpHeld && p.jumpsLeft > 0) {
      bod.setVelocityY(-Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * TS));
      p.jumpsLeft--;
      s.anims.play(this._animKey('jump'), true);
      // ── Stretch on jump launch ────────────────────────────────
      this.stretchPlayer();
    }
    this._jumpHeld = jp;

    if ((k.down.isDown || k.s.isDown) && onGround) {
      // Duck: play crouch anim, slow horizontal movement.  ALSO shrink
      // the body's vertical extent so the player fits under low
      // overhead platforms (level 2).  Width stays 14; height drops
      // 27 → 14 with the offset pushed down so the feet stay put.
      s.anims.play(this._animKey('duck'), true);
      // NOTE: body.height is the *scaled* height (14·SCALE); the unscaled
      // value we set lives in body.sourceHeight — compare against that.
      if (s.body.sourceHeight !== 14) {
        s.body.setSize(14, 14).setOffset((s.frame.width - 14) / 2, 15);
      }
      this.applyHorizontalMove(p, k, 0.4);
      // Keep the overlay tracking the player while ducking — without
      // this, the sword stays painted at the last position before duck
      // started and visibly floats while the player slides underneath.
      this._updateWeaponOverlay();
      this._tryFireElement(k);
      return;
    } else if (s.body.sourceHeight === 14) {
      // Trying to stand back up.  Only restore the full standing hitbox
      // if there's headroom — otherwise the body would grow straight into
      // an overhead platform, embedding the player (a size change carries
      // no movement delta for arcade to separate against, so collision
      // silently breaks and every spike platform turns non-solid).  Stay
      // crouched and keep shuffling until clear of the obstacle.
      if (this._hasStandHeadroom(s)) {
        s.body.setSize(14, 27).setOffset((s.frame.width - 14) / 2, 2);
      } else {
        s.anims.play(this._animKey('duck'), true);
        this.applyHorizontalMove(p, k, 0.4);
        this._updateWeaponOverlay();
        this._tryFireElement(k);
        return;
      }
    }

    this._tryFireElement(k);
    this.applyHorizontalMove(p, k, 1);

    // Base animation off key state, not velocity, so it responds the instant
    // a direction key is pressed (no one-frame lag from the physics solver).
    const movingH = k.left.isDown || k.a.isDown || k.right.isDown || k.d.isDown;
    if (!onGround) {
      const jumpKey = this._animKey('jump');
      if (s.anims.currentAnim?.key !== jumpKey) s.anims.play(jumpKey, true);
    } else if (movingH) {
      s.anims.play(this._animKey('walk'), true);
    } else {
      s.anims.play(this._animKey('idle'), true);
    }
    this._updateWeaponOverlay();
  }

  // Position the equipped-melee overlay every frame so it tracks the
  // player.  Hidden when no melee weapon is equipped.  flipX matches
  // player facing (sprite.flipX === true means facing right).
  _updateWeaponOverlay() {
    const p = this.player, s = p.sprite, w = p.weaponSprite;
    if (!w) return;
    const armed = this._isArmedMelee();
    w.setVisible(armed);
    if (!armed) return;
    // Pose values are in unscaled sprite px from the sprite's local
    // centre (+x = forward, +y = down) and `a` is the angle in degrees
    // (0 = blade straight up, +90 = blade forward, -90 = blade back).
    // With origin (0.5, 0.9) the pivot is the hilt, so position values
    // are also where the player's hand is.  Direction is encoded as
    // `dir`: +1 facing right, -1 facing left, applied to both x and a
    // so the sword mirrors via angle negation alone — no flipX needed.
    let pose;
    if (p._swing) {
      // Tween-driven asymmetric swing arc set up by _beginSwingTween.
      pose = p._swing;
    } else {
      const animKey = this._animBase(s.anims.currentAnim?.key) || 'idle';
      // Phaser frame indices are 1-based within the animation.
      const frame   = (s.anims.currentFrame?.index || 1) - 1;
      // Hand sits at hip / waist height — around y=7 unscaled below
      // the sprite's local centre — and slightly forward (x=4).
      // a=30° tilts the blade up-and-forward out of the hand.
      const REST = { x: 4, y: 7, a: 30 };
      const POSE = {
        idle:          [REST],
        // Measured off walk.png rather than eyeballed: the sword hand
        // sits at exactly the idle position in frames 0, 1 and 3, and
        // only swings on frame 2 — forward 1.8px and up 0.9px.  The old
        // table bobbed on 1 and 3 and held still on 2, which is why the
        // hilt drifted off the hand while walking but looked right idle.
        walk:          [
          REST,
          REST,
          { x: 6, y: 6, a: 30 },
          REST,
        ],
        jump:          [
          { x: 5, y:  6, a: 20 },
          { x: 5, y:  4, a: 10 },
          { x: 5, y:  6, a: 20 },
        ],
        // Sheathed across the back: hilt sticks up over the shoulder,
        // blade extends straight down behind the body.  Negative x =
        // behind facing direction (mirrored by `dir`); pose.a = 180 →
        // blade points down (after the -45 texture-tilt fix).  The
        // overlay's depth is dropped below the player below, so only
        // the hilt above the shoulder and the blade tip below the hip
        // poke out of the silhouette — exactly the back-sheath look.
        duck:          [{ x: -3, y: -1, a: 180 }],
        // Block stance: the exact duck sheathe (same x and a=180 → blade
        // straight down the back, tucked against the body) just raised in
        // y so the hilt clears the taller standing silhouette's shoulder.
        block:         [{ x: -3, y: -7, a: 180 }],
        attack:        [
          { x: 5, y:  6, a:  10 },
          { x: 7, y:  3, a: -30 },
          { x: 7, y:  8, a:  60 },
        ],
        // Fallback for the first frame of weapon_attack before
        // _beginSwingTween populates p._swing — same as REST.
        weapon_attack: [REST, REST, REST],
      };
      const table = POSE[animKey] || POSE.idle;
      pose = table[Math.min(Math.max(frame, 0), table.length - 1)];
    }
    const facingRight = s.flipX;
    const dir = facingRight ? 1 : -1;
    // Position the pivot at the player's hand (pose.x/pose.y are in
    // unscaled sprite px from sprite centre).
    w.setPosition(s.x + dir * pose.x * SCALE, s.y + pose.y * SCALE);
    // Subtract 45° to undo Sword.png's built-in diagonal tilt so
    // `pose.a` is the real visual angle from vertical (0 = blade up,
    // +90 = blade horizontal forward, -90 = blade back).  `dir`
    // mirrors the swing for facing-left without needing flipX.
    w.setAngle(dir * pose.a - 45);
    w.setFlipX(false);
    // Sheathed-on-back when ducking → render behind the player so only
    // the hilt and blade tip stick out of the silhouette.  Otherwise
    // the sword sits in the hand in front of the body.
    const animNow  = this._animBase(s.anims.currentAnim?.key);
    const sheathed = (animNow === 'duck' || animNow === 'block');
    w.setDepth(s.depth + (sheathed ? -1 : 1));
  }

  applyHorizontalMove(p, k, mult) {
    const spd = 200 * mult, s = p.sprite;
    if      (k.left.isDown  || k.a.isDown) { s.body.setVelocityX(-spd); s.setFlipX(false); }
    else if (k.right.isDown || k.d.isDown) { s.body.setVelocityX( spd); s.setFlipX(true);  }
    else                                    { s.body.setVelocityX(0); }
  }

  // True when the full standing hitbox (14×27 at SCALE) would NOT overlap
  // any platform above the crouched player's current feet — i.e. there's
  // room to stand up.  Used to block standing while still under a low
  // overhead platform (see the duck branch in updatePlayer).
  _hasStandHeadroom(s) {
    const halfW = (14 * SCALE) / 2;
    const standH = 27 * SCALE;
    const feet  = s.body.bottom;
    const top   = feet - standH;
    const left  = s.x - halfW;
    const right = s.x + halfW;
    const pad   = 2;   // ignore the floor we're standing on / grazing edges
    for (const pl of this.platforms.getChildren()) {
      const b = pl && pl.body;
      if (!b) continue;
      if (right - pad > b.left && left + pad < b.right &&
          feet  - pad > b.top  && top  + pad < b.bottom) {
        return false;
      }
    }
    return true;
  }

  checkAttackHit() {
    const ps = this.player.sprite, reach = TS * 1.3;
    if (this.emperor && !this.emperor.dead) {
      const es = this.emperor.sprite;
      const facing = ps.flipX ? es.x > ps.x : es.x < ps.x;
      if (Math.abs(ps.x - es.x) < reach + 60 && Math.abs(ps.y - es.y) < TS * 2 && facing) {
        this._hitEmperor(this._meleeDamage());
      }
    }
    if (this.door && !this.door.opened) {
      const ds = this.door.sprite;
      const facing = ps.flipX ? ds.x > ps.x : ds.x < ps.x;
      if (Math.abs(ps.x - ds.x) < reach + 40 && Math.abs(ps.y - ds.y) < TS * 2 && facing) {
        this._strikeDoor();
      }
    }
    if (this.guards) {
      for (const g of this.guards) {
        if (g.dead || !g.sprite.active) continue;
        const gs2 = g.sprite;
        const facing = ps.flipX ? gs2.x > ps.x : gs2.x < ps.x;
        if (Math.abs(ps.x - gs2.x) < reach && Math.abs(ps.y - gs2.y) < TS * 1.5 && facing) {
          this._hitGuard(g, this._meleeDamage(), ps.x);
        }
      }
    }
    if (this.zombies) {
      for (const z of this.zombies) {
        if (z.dead || !z.sprite.active) continue;
        const zs = z.sprite;
        const facing = ps.flipX ? zs.x > ps.x : zs.x < ps.x;
        if (Math.abs(ps.x - zs.x) < reach && Math.abs(ps.y - zs.y) < TS && facing) {
          this._hitZombie(z, this._meleeDamage(), ps.x);
        }
      }
    }
    if (this.dummy && !this.dummy.dead) {
      const ds = this.dummy.sprite;
      const facing = ps.flipX ? ds.x > ps.x : ds.x < ps.x;
      if (Math.abs(ps.x-ds.x) < reach && Math.abs(ps.y-ds.y) < TS && facing) this.hitDummy();
    }
    if (this.patrolDummy && !this.patrolDummy.dead) {
      const ds = this.patrolDummy.sprite;
      const facing = ps.flipX ? ds.x > ps.x : ds.x < ps.x;
      if (Math.abs(ps.x-ds.x) < reach && Math.abs(ps.y-ds.y) < TS && facing) this.hitPatrolDummy();
    }
    if (this.chest && !this.chest.opened) {
      const cs = this.chest.sprite;
      const facing = ps.flipX ? cs.x > ps.x : cs.x < ps.x;
      if (Math.abs(ps.x-cs.x) < reach && Math.abs(ps.y-cs.y) < TS && facing) this.openChest();
    }
    // ── Level 2 melee targets ────────────────────────────────────
    // The sword carried over from level 1 can also kill the ranged
    // dummies and trip the two L2 checkpoint chests.
    if (this.rangedDummies) {
      for (const rd of this.rangedDummies) {
        if (rd.dead) continue;
        const ds = rd.sprite;
        const facing = ps.flipX ? ds.x > ps.x : ds.x < ps.x;
        if (Math.abs(ps.x-ds.x) < reach && Math.abs(ps.y-ds.y) < TS && facing) {
          this._hitRangedDummy(rd);
        }
      }
    }
    [this.chestL2A, this.chestL2B].forEach(c => {
      if (!c || c.opened) return;
      const cs = c.sprite;
      const facing = ps.flipX ? cs.x > ps.x : cs.x < ps.x;
      if (Math.abs(ps.x-cs.x) < reach && Math.abs(ps.y-cs.y) < TS && facing) {
        this._openChestL2(c);
      }
    });
  }

  // Melee a ranged dummy (shares the element-hit damage/death path).
  _hitRangedDummy(rd) {
    rd.hp = Math.max(0, rd.hp - this._meleeDamage());
    rd.sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => { if (!rd.dead) rd.sprite.clearTint(); });
    if (rd.hp <= 0) {
      rd.dead = true;
      this.tweens.add({
        targets: rd.sprite, angle: 90, alpha: 0, duration: 360, ease: 'Power2',
        onComplete: () => rd.sprite.destroy(),
      });
    }
  }

  // Chest A drops the Wooden Shield + 10 XP and plays the level-up
  // cinematic on its first open; chest B (and any replay) is a plain
  // checkpoint: open animation, "Checkpoint!" banner, respawn move.
  _openChestL2(c) {
    if (c.opened) return;
    c.opened = true;
    c.sprite.anims.play('chest_open', true);
    this.tweens.add({ targets: c.sprite, scaleX: 5 * 1.15, scaleY: 5 * 1.15,
      duration: 120, yoyo: true, repeat: 2 });
    this._setCheckpoint(c.sprite.x - 80, c.sprite.y - 30);

    const firstChestA = c.tag === 'A' && !this.registry.get('level2ChestAOpened');
    if (firstChestA) {
      this.registry.set('level2ChestAOpened', true);
      saveProgress({ level2ChestAOpened: true });
      this._playChestSequence({
        xpGain: 10,
        itemId: 'wooden_shield',
        itemTextureKey: 'item_wooden_shield',
      });
    } else {
      this.checkpointText.setVisible(true);
      this.time.delayedCall(1800, () => this.checkpointText.setVisible(false));
    }
  }

  // Damage of the equipped melee weapon (or 1 for bare fists).
  _meleeDamage() {
    if (!window.statusSheet) return 1;
    const slot = window.statusSheet.getState().equipment?.meleeWeapon;
    const id   = slot?.itemId;
    if (!id || !window.itemRegistry) return 1;
    const item = window.itemRegistry.get(id);
    return Math.max(1, Number(item?.stats?.damage) || 1);
  }

  hitDummy() {
    const d = this.dummy;
    d.hp = Math.max(0, d.hp - this._meleeDamage());
    if (d.hp <= 0) {
      d.dead = true;
      d.sprite.anims.play('dummy_hit', true);
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        this.tweens.add({ targets:d.sprite, angle:90, alpha:0, duration:400, ease:'Power2',
          onComplete: () => d.sprite.destroy() });
        this.dummyBar.bg.setVisible(false);
        this.dummyBar.fg.setVisible(false);
        this.dummyBar.label.setVisible(false);
      });
    } else {
      d.sprite.anims.play('dummy_hit', true);
      d.sprite.setTintFill(0xffffff);
      this.time.delayedCall(100, () => {
        if (!d.dead) { d.sprite.clearTint(); d.sprite.anims.play('dummy_idle', true); }
      });
    }
  }

  hitPatrolDummy() {
    const d = this.patrolDummy;
    d.hp = Math.max(0, d.hp - this._meleeDamage());
    if (d.hp <= 0) {
      d.dead = true;
      d.sprite.anims.play('dummy_hit', true);
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        this.tweens.add({ targets: d.sprite, angle: 90, alpha: 0, duration: 400, ease: 'Power2',
          onComplete: () => d.sprite.destroy() });
        this.patrolDummyBar.bg.setVisible(false);
        this.patrolDummyBar.fg.setVisible(false);
        this.patrolDummyBar.label.setVisible(false);
      });
    } else {
      d.sprite.anims.play('dummy_hit', true);
      d.sprite.setTintFill(0xffffff);
      this.time.delayedCall(100, () => {
        if (!d.dead) { d.sprite.clearTint(); d.sprite.anims.play('dummy_idle', true); }
      });
    }
  }

  updateDummyBar() {
    if (this.dummy && !this.dummy.dead) {
      const ds = this.dummy.sprite, bar = this.dummyBar, barW = 80;
      const bx = ds.x, by = ds.y - 25*SCALE/2 - 8;
      bar.bg.setPosition(bx, by).setSize(barW, 10).setVisible(true);
      bar.fg.setPosition(bx - barW/2, by).setSize(barW * this.dummy.hp / this.dummy.maxHp, 10).setVisible(true);
      bar.label.setPosition(bx, by-10).setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`).setVisible(true);
    }
    const pd = this.patrolDummy;
    if (pd && !pd.dead && pd.sprite?.active) {
      const ds = pd.sprite, bar = this.patrolDummyBar, barW = 80;
      const bx = ds.x, by = ds.y - 25*SCALE/2 - 8;
      bar.bg.setPosition(bx, by).setSize(barW, 10).setVisible(true);
      bar.fg.setPosition(bx - barW/2, by).setSize(barW * pd.hp / pd.maxHp, 10).setVisible(true);
      bar.label.setPosition(bx, by-10).setText(`HP: ${pd.hp} / ${pd.maxHp}`).setVisible(true);
    }
  }

  // True iff the player has a melee weapon equipped via the status sheet.
  _isArmedMelee() {
    if (!window.statusSheet) return false;
    const eq = window.statusSheet.getState().equipment;
    return !!(eq && eq.meleeWeapon && eq.meleeWeapon.itemId);
  }

  openChest() {
    const c = this.chest;
    if (c.opened) return;
    c.opened = true;
    c.sprite.anims.play('chest_open', true);
    this.tweens.add({ targets:c.sprite, scaleX:5*1.15, scaleY:5*1.15,
      duration:120, yoyo:true, repeat:2 });
    // Update respawn checkpoint to just left of the chest
    this._setCheckpoint(c.sprite.x - 80, c.sprite.y - 30);

    // First time on this save: play the cinematic and award the tutorial
    // sword.  On replay runs the chest just shows the regular Checkpoint!
    // banner so we don't duplicate the cinematic or the loot.
    const firstOpen = !this.registry.get('level1ChestOpened');
    if (firstOpen) {
      this.registry.set('level1ChestOpened', true);
      saveProgress({ level1ChestOpened: true });
      this._playChestSequence({
        xpGain: 10,
        itemId: 'wooden_sword',
        itemTextureKey: 'item_wooden_sword',
      });
    } else {
      this.checkpointText.setVisible(true);
      this.time.delayedCall(1800, () => this.checkpointText.setVisible(false));
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Chest reward cinematic
  //
  //  Phases (Phaser tweens, all on a UI layer with scrollFactor 0):
  //    1. Dim screen
  //    2. Enlarged XP bar fades in with "+N XP" text
  //    3. Text bursts into blue orbs that arc into the bar; both the
  //       cinematic bar and the HUD's real bar tick up per orb
  //    4. Bar fades out, an enlarged open-chest frame fades in with a
  //       gold glow
  //    5. The reward item rises out of the chest with its name +
  //       rarity colour
  //    6. Auto-dismisses after a short hold (Space skips ahead).
  //
  //  While the cinematic is active, _chestSequenceActive blocks player
  //  input and movement updates.
  // ─────────────────────────────────────────────────────────────────
  // Save XP/level/threshold so the bar doesn't snap back to 0/15 on the
  // next run.  Only logged-in users persist (saveProgress is a no-op
  // for guests, which is intentional).
  _persistXp() {
    if (typeof saveProgress === 'function') {
      saveProgress({ xp: this._xp, level: this._level, xpToNext: this._xpToNext });
    }
  }

  _playChestSequence(opts) {
    if (this._chestSequenceActive) return;
    this._chestSequenceActive = true;
    this._pendingElementChoices = 0;   // incremented once per level-up below

    const W = this.scale.width, H = this.scale.height;
    const cx = W / 2, cy = H / 2;
    const D  = 1000;            // base depth for cinematic UI

    const layer = [];
    const add   = obj => { obj.setScrollFactor(0).setDepth(D); layer.push(obj); return obj; };

    // Phase 1 — dim screen
    const dim = add(this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0));
    this.tweens.add({ targets: dim, fillAlpha: 0.66, duration: 280, ease: 'Sine.easeOut' });

    // Phase 2 — enlarged XP bar
    const BIG_W = 540, BIG_H = 36;
    const xpToNext = this._xpToNext;
    const startXp  = this._xp;
    const endXp    = Math.min(this._xp + opts.xpGain, xpToNext);

    const barBg = add(this.add.rectangle(cx, cy, BIG_W, BIG_H, 0x222222).setStrokeStyle(3, 0x000000));
    // Use full BIG_W width and a `_fill` ratio property updated via
    // setSize() each step.  Tweening `displayWidth` on a Rectangle with
    // an initial width of 0 (when startXp = 0) collapses to a no-op
    // because displayWidth = width * scaleX — there's nothing to scale.
    const barFill = add(this.add.rectangle(cx - BIG_W/2, cy, BIG_W, BIG_H, 0x3b9fff)
                        .setOrigin(0, 0.5));
    barFill._fill = startXp / xpToNext;
    barFill.setSize(BIG_W * barFill._fill, BIG_H);
    const barText = add(this.add.text(cx, cy, `${startXp}/${xpToNext}`, {
      fontSize: '20px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5));
    const xpLabel = add(this.add.text(cx, cy - 70, `+${opts.xpGain} XP`, {
      fontSize: '40px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#3b9fff', stroke: '#ffffff', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0));
    [barBg, barFill, barText, xpLabel].forEach(o => o.setAlpha(o === xpLabel ? 0 : 0).setScale(0.6));
    this.tweens.add({
      targets: [barBg, barFill, barText],
      alpha: 1, scale: 1, duration: 320, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: xpLabel,
      alpha: 1, duration: 280, delay: 240,
      onComplete: () => this._chestPhaseOrbs(opts, {
        cx, cy, BIG_W, BIG_H,
        startXp, endXp, xpToNext,
        barFill, barText, xpLabel, barBg, layer, add, D,
        cleanup: () => layer.forEach(o => o.destroy()),
      }),
    });

    // Skip key — Space speeds through and jumps to dismiss.
    this._chestSkipHandler = () => {
      if (this._chestDismiss) this._chestDismiss();
    };
  }

  _chestPhaseOrbs(opts, ctx) {
    // Break the XP gain into per-level fill segments.  Any segment that
    // tops the bar out is flagged levelUpAfter, so the driver plays a
    // "Level UP!" beat and resets the bar before the next segment.
    const xpToNext = ctx.xpToNext;
    const segments = [];
    let cur = ctx.startXp;
    let remaining = opts.xpGain;
    while (remaining > 0) {
      const room = xpToNext - cur;
      if (room > 0 && remaining >= room) {
        segments.push({ from: cur, to: xpToNext, levelUpAfter: true });
        remaining -= room;
        cur = 0;
      } else {
        segments.push({ from: cur, to: cur + remaining, levelUpAfter: false });
        cur += remaining;
        remaining = 0;
      }
    }
    this._runXpSegments(opts, ctx, segments, 0);
    // Fade the "+N XP" label out as the first orbs leave.
    this.tweens.add({ targets: ctx.xpLabel, alpha: 0, y: ctx.cy - 100, duration: 380, delay: 80 });
  }

  // Run fill segments in order, inserting a level-up beat between any
  // segment that maxed the bar.  When all segments are done, persist and
  // move on to the chest-reveal phase.
  _runXpSegments(opts, ctx, segments, idx) {
    if (idx >= segments.length) {
      this._persistXp();
      this.time.delayedCall(280, () => this._chestPhaseChest(opts, ctx));
      return;
    }
    const seg = segments[idx];
    this._chestFillSegment(ctx, seg, () => {
      if (seg.levelUpAfter) {
        this._chestLevelUp(ctx, () => this._runXpSegments(opts, ctx, segments, idx + 1));
      } else {
        this._runXpSegments(opts, ctx, segments, idx + 1);
      }
    });
  }

  // Fly ORB_COUNT blue orbs into the big bar, filling it from seg.from to
  // seg.to (both within the current level), then call done().
  _chestFillSegment(ctx, seg, done) {
    const { cx, cy, BIG_W, BIG_H, xpToNext, barFill, barText } = ctx;
    const ORB_COUNT = 6;
    const xpPerOrb  = (seg.to - seg.from) / ORB_COUNT;
    let landed = 0;

    // Snap the bar to the segment's starting point.
    barFill._fill = seg.from / xpToNext;
    barFill.setSize(BIG_W * barFill._fill, BIG_H);
    this._xp = Math.round(seg.from);
    barText.setText(`${this._xp}/${xpToNext}`);

    for (let i = 0; i < ORB_COUNT; i++) {
      const orb = ctx.add(this.add.circle(cx + (i - ORB_COUNT/2) * 14, cy - 60, 8, 0x66c8ff));
      orb.setStrokeStyle(2, 0x1a4d8c);
      orb.setAlpha(0);
      const targetX = cx - BIG_W/2 + BIG_W * ((seg.from + xpPerOrb * (i + 1)) / xpToNext);
      const delay   = 80 * i;
      this.tweens.add({ targets: orb, alpha: 1, duration: 120, delay });
      this.tweens.add({
        targets: orb,
        x: targetX, y: cy,
        duration: 480,
        delay: delay + 120,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          // Pulse on impact + grow the bar fill via addCounter → setSize
          // (tweening displayWidth on a width-0 Rectangle renders nothing).
          this.tweens.add({ targets: orb, alpha: 0, scale: 2, duration: 140 });
          const newXp = seg.from + xpPerOrb * (landed + 1);
          const fromF = barFill._fill;
          const toF   = newXp / xpToNext;
          this.tweens.addCounter({
            from: fromF, to: toF,
            duration: 160, ease: 'Sine.easeOut',
            onUpdate: t => {
              const f = t.getValue();
              barFill._fill = f;
              barFill.setSize(BIG_W * f, BIG_H);
            },
          });
          // Update the real GameScene XP (HUD reflects automatically).
          this._xp = Math.min(xpToNext, Math.round(newXp));
          barText.setText(`${this._xp}/${xpToNext}`);
          landed++;
          if (landed === ORB_COUNT) {
            this._xp = Math.round(seg.to);
            barText.setText(`${this._xp}/${xpToNext}`);
            this.time.delayedCall(240, done);
          }
        },
      });
    }
  }

  // "Level UP!" beat: pop the banner, bump the level (HUD mirrors it),
  // then empty the bar for the new level and continue.
  _chestLevelUp(ctx, done) {
    const { cx, cy, BIG_W, BIG_H, xpToNext, barFill, barText } = ctx;
    this._level += 1;
    this._pendingElementChoices = (this._pendingElementChoices || 0) + 1;
    const lvlText = ctx.add(this.add.text(cx, cy - 70, 'Level UP!', {
      fontSize: '46px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffd166', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0.6));
    this.tweens.add({ targets: lvlText, alpha: 1, scale: 1, duration: 320, ease: 'Back.easeOut' });
    // Quick celebratory pulse of the full bar before it empties.
    this.tweens.add({ targets: barFill, scaleY: 1.3, duration: 140, yoyo: true, repeat: 1 });
    this.time.delayedCall(820, () => {
      barFill._fill = 0;
      barFill.setSize(0, BIG_H);
      this._xp = 0;
      barText.setText(`0/${xpToNext}`);
      this.tweens.add({ targets: lvlText, alpha: 0, y: cy - 110, duration: 380 });
      this.time.delayedCall(280, done);
    });
  }

  _chestPhaseChest(opts, ctx) {
    const { cx, cy, barFill, barText, barBg } = ctx;
    // Fade out bar
    this.tweens.add({
      targets: [barFill, barText, barBg], alpha: 0, duration: 260,
      onComplete: () => {
        // Gold glow + enlarged open-chest sprite (frame 1 = open).
        const glow = ctx.add(this.add.circle(cx, cy, 90, 0xffd166, 0.0));
        const chestImg = ctx.add(this.add.image(cx, cy, 'chest', 1).setScale(0));
        this.tweens.add({ targets: glow,     fillAlpha: 0.55, scale: 1.4, duration: 420, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: chestImg, scale: 8,        duration: 380, ease: 'Back.easeOut',
          onComplete: () => this._chestPhaseReward(opts, ctx, chestImg, glow),
        });
      },
    });
  }

  _chestPhaseReward(opts, ctx, chestImg, glow) {
    const { cx, cy } = ctx;
    // Award the item to the status sheet (auto-equips if slot empty).
    const result = window.statusSheet && window.statusSheet.award
      ? window.statusSheet.award(opts.itemId, 1) : false;
    const item = window.itemRegistry && window.itemRegistry.get(opts.itemId);

    // Item sprite rises out of the chest.
    const tex = this.textures.exists(opts.itemTextureKey) ? opts.itemTextureKey : null;
    const itemImg = ctx.add(tex
      ? this.add.image(cx, cy, tex).setScale(0)
      : this.add.text(cx, cy, '?', { fontSize: '48px' }).setOrigin(0.5).setScale(0));
    if (tex) itemImg.setScale(0);
    this.tweens.add({
      targets: itemImg,
      scale: 5, y: cy - 80, duration: 520, ease: 'Back.easeOut',
    });

    // Item name in rarity colour + outcome line.
    const rarityColor = {
      common: '#aaaaaa', uncommon: '#44cc66', rare: '#4488ff', epicRare: '#e84057',
      ultraRare: '#66ccff', legendary: '#ffcc00', mythical: '#88ee88',
      elder: '#aa66dd', exclusive: '#ff77bb',
    };
    const name = item ? item.name : opts.itemId;
    const colr = item && rarityColor[item.rarity] || '#ffffff';
    const nameText = ctx.add(this.add.text(cx, cy + 60, name, {
      fontSize: '28px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: colr, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0));
    const outcome = result === 'equipped' ? 'Auto-equipped!' : 'Added to inventory';
    const subText = ctx.add(this.add.text(cx, cy + 96, outcome, {
      fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0));
    this.tweens.add({ targets: [nameText, subText], alpha: 1, duration: 320, delay: 200 });

    // Auto-dismiss after a hold; Space also dismisses early.
    this._chestDismiss = () => {
      if (!this._chestSequenceActive) return;
      this._chestDismiss = null;
      this._chestSkipHandler = null;
      this.tweens.add({
        targets: ctx.layer, alpha: 0, duration: 280,
        onComplete: () => {
          ctx.cleanup();
          this._runPendingElementChoices();
        },
      });
    };
    this.time.delayedCall(1600, () => this._chestDismiss && this._chestDismiss());
  }

  // After the chest cinematic fully dismisses, show one "choose a basic
  // element" screen per level gained during it, in sequence. Keeps
  // _chestSequenceActive true (freezing player input) until all are
  // resolved, then releases control back to the player.
  _runPendingElementChoices() {
    if (this._pendingElementChoices > 0) {
      this._pendingElementChoices -= 1;
      this._playElementChoiceScreen(() => this._runPendingElementChoices());
    } else {
      this._chestSequenceActive = false;
      // The chest IS the checkpoint, so fold its rewards into the
      // snapshot — otherwise a later death would rewind past them.
      this._refreshCheckpointState();
    }
  }

  // "You leveled up! Choose a basic element." — dim screen + 4 bordered
  // icon squares (Fire/Water/Air/Earth). Clicking one drops it into the
  // next empty hotbar slot and persists it, then calls done().
  _playElementChoiceScreen(done) {
    const emptySlot = this._hotbar.findIndex(s => !s);
    if (emptySlot === -1) { done(); return; }   // hotbar full — nothing to assign

    const W = this.scale.width, H = this.scale.height;
    const cx = W / 2, cy = H / 2;
    const D  = 1000;
    const layer = [];
    const add = obj => { obj.setScrollFactor(0).setDepth(D); layer.push(obj); return obj; };

    const dim = add(this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0));
    this.tweens.add({ targets: dim, fillAlpha: 0.66, duration: 280, ease: 'Sine.easeOut' });

    const msg = add(this.add.text(cx, cy - 90, 'You leveled up!\nChoose a basic element.', {
      fontSize: '22px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0));
    this.tweens.add({ targets: msg, alpha: 1, duration: 320 });

    const options = [
      { key: 'fire',  icon: 'icon_fire',  label: 'Fire'  },
      { key: 'water', icon: 'icon_water', label: 'Water' },
      { key: 'air',   icon: 'icon_air',   label: 'Air'   },
      { key: 'earth', icon: 'icon_earth', label: 'Earth' },
    ];
    const boxSize = 84, gap = 24;
    const rowW = options.length * boxSize + (options.length - 1) * gap;
    const startX = cx - rowW / 2 + boxSize / 2;

    let resolved = false;
    const cleanup = () => layer.forEach(o => o.destroy());
    const choose = (elKey) => {
      if (resolved) return;
      resolved = true;
      this._hotbar[emptySlot] = { element: elKey, cooldownRemaining: 0 };
      saveProgress({ hotbar: this._hotbar.map(s => s ? s.element : null) });
      this.tweens.add({
        targets: layer, alpha: 0, duration: 220,
        onComplete: () => { cleanup(); done(); },
      });
    };

    options.forEach((opt, i) => {
      const bx = startX + i * (boxSize + gap);
      const box = add(this.add.rectangle(bx, cy + 30, boxSize, boxSize, 0x333333)
        .setStrokeStyle(3, 0xffffff)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0));
      const icon = add(this.add.sprite(bx, cy + 18, opt.icon, 0).setScale(1.6).setAlpha(0));
      icon.play(opt.icon);
      const label = add(this.add.text(bx, cy + 30 + boxSize / 2 - 14, opt.label, {
        fontSize: '13px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0));
      this.tweens.add({ targets: [box, icon, label], alpha: 1, duration: 320, delay: 120 + i * 60, ease: 'Back.easeOut' });
      box.on('pointerover', () => box.setFillStyle(0x4a4a4a));
      box.on('pointerout',  () => box.setFillStyle(0x333333));
      box.on('pointerup',   () => choose(opt.key));
    });
  }

  reachPortal() {
    if (this._portalReached) return;
    this._portalReached = true;
    // Flag the completion of whichever level we're in.
    const completeKey = `level${this._levelNum}Complete`;
    const starKey     = `level${this._levelNum}Star`;
    this.registry.set(completeKey, true);
    if (this._gotStar) this.registry.set(starKey, true);   // only saved now
    // Persist to localStorage for logged-in users (guests are no-ops).
    const update = { [completeKey]: true };
    if (this._gotStar) update[starKey] = true;
    saveProgress(update);

    // ── Freeze the player ────────────────────────────────────────
    // updatePlayer early-returns on _portalReached, so input is
    // already locked.  Kill any in-flight motion / swing tween,
    // disable the body so gravity can't drag the sprite down while
    // it shrinks, and snap to idle so the silhouette is calm.
    const p = this.player, ps = p.sprite;
    if (p._swing) { this.tweens.killTweensOf(p._swing); p._swing = null; }
    ps.body.setVelocity(0, 0);
    ps.body.enable = false;
    ps.anims.play(this._animKey('idle'), true);

    // Stop the portal's bob tween so it doesn't fight the shrink.
    this.tweens.killTweensOf(this.portal);

    // ── Banner ───────────────────────────────────────────────────
    this.victoryText.setVisible(true).setAlpha(0).setScale(0.6);
    this.tweens.add({
      targets: this.victoryText,
      alpha: 1, scale: 1,
      duration: 280, ease: 'Back.easeOut',
    });

    // ── Shrink both player and portal into nothingness ──────────
    const sinkTargets = [ps, this.portal];
    // Include the held weapon if it's visible — otherwise a tiny
    // sword would hang in the air after the player vanishes.
    if (p.weaponSprite && p.weaponSprite.visible) sinkTargets.push(p.weaponSprite);
    this.tweens.add({
      targets: sinkTargets,
      scaleX: 0, scaleY: 0, alpha: 0,
      angle: '+=180',
      duration: 900,
      delay: 350,                          // let the banner pop first
      ease: 'Back.easeIn',
      onComplete: () => {
        this.time.delayedCall(450, () => this.scene.start('MapScene'));
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Secret star
  // ─────────────────────────────────────────────────────────────────
  _startStarBob() {
    if (this._starBobTween) this._starBobTween.stop();
    this._starSprite.y = this._starOrigY;
    this._starBobTween = this.tweens.add({
      targets: this._starSprite,
      y: this._starOrigY - 10,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  collectStar() {
    if (this._gotStar || !this._starSprite.visible) return;
    this._gotStar = true;
    if (this._starBobTween) { this._starBobTween.stop(); this._starBobTween = null; }
    this._starSprite.body.enable = false;
    this.tweens.add({
      targets: this._starSprite,
      scaleX: SCALE * 2, scaleY: SCALE * 2, alpha: 0,
      duration: 350, ease: 'Sine.easeOut',
      onComplete: () => this._starSprite.setVisible(false).setAlpha(1).setScale(SCALE),
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Patrol dummy
  //
  //  Lives on section 5 (tiles 40-44, x=3840-4224), bordered by
  //  spike pits on both sides.  Speed = 1.2× player (240 px/s).
  //  setImmovable keeps its velocity unchanged by collisions so it
  //  physically shoves the player sideways — potentially off the edge.
  //  Tilts ±5° to show which way it's walking.
  // ─────────────────────────────────────────────────────────────────
  createPatrolDummy(x, y, leftBound, rightBound) {
    const sprite = this.physics.add.sprite(x, y, 'dummy').setScale(SCALE);
    this._fitBodyToTexture(sprite);          // tight bbox matches createDummy
    // NOTE: do NOT setImmovable — static platforms are also immovable, and
    // Phaser skips separation entirely when both bodies are immovable, making
    // the dummy fall through the floor.  We re-assert velocity every frame
    // instead, so player collisions can't permanently knock it off course.
    sprite.body.setAllowGravity(true);
    sprite.anims.play('dummy_idle', true);
    sprite.setAngle(5);   // start leaning right
    const maxHp = 5;
    return { sprite, leftBound, rightBound, speed: 240, dir: 1, hp: maxHp, maxHp, dead: false };
  }

  updatePatrolDummy() {
    const pd = this.patrolDummy;
    if (!pd || pd.dead) return;
    const { sprite, leftBound, rightBound, speed } = pd;
    const db = sprite.body;
    const pb = this.player.sprite.body;

    // ── Hard position clamp ───────────────────────────────────────
    // Without this, a player collision can impulse the dummy past the
    // platform edge and into a spike pit where it sits forever.
    // leftBound=3830 → dummy body-left ≈ 3795, first tile covers 3792+  ✓
    // rightBound=4250 → dummy body-right ≈ 4285, past pit lip (4272)    ✓
    //   so the player body (width 42) is FULLY over the pit before the
    //   dummy turns, guaranteeing they fall in.
    if (sprite.x < leftBound || sprite.x > rightBound) {
      sprite.x = Phaser.Math.Clamp(sprite.x, leftBound, rightBound);
      db.reset(sprite.x, sprite.y);   // sync body; also zeroes velocity (re-set below)
    }

    // Direction flip at the same limits
    if (pd.dir === 1 && sprite.x >= rightBound) {
      pd.dir = -1;
      sprite.setAngle(-5);
    } else if (pd.dir === -1 && sprite.x <= leftBound) {
      pd.dir = 1;
      sprite.setAngle(5);
    }

    // Re-assert velocity every frame (body.reset zeroes it; also prevents
    // player collision impulses from permanently changing patrol speed)
    db.setVelocityX(pd.dir * speed);

    // ── Bulldozer push ────────────────────────────────────────────
    // db.touching.right/left is only set on the exact physics frame a
    // collision is resolved — if Phaser skips or misses the contact for
    // one frame the flag is false and the push never fires.  A direct
    // body-bounds proximity check fires every frame the bodies are close,
    // regardless of whether the physics step registered a collision.
    const PUSH_GAP  = 10;   // px tolerance — catches sub-pixel separation
    const sameLevel = Math.abs(db.center.y - pb.center.y) < TS; // ignore jump-over
    const pressing =
      sameLevel && (
        (pd.dir ===  1 && db.right >= pb.left - PUSH_GAP && pb.left > db.left) ||
        (pd.dir === -1 && db.left  <= pb.right + PUSH_GAP && pb.right < db.right)
      );
    if (pressing) {
      pb.setVelocityX(pd.dir * (speed + 140));  // 380 px/s > walk speed (200)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Portal — end-of-level trigger
  // ─────────────────────────────────────────────────────────────────
  createPortal(x, y) {
    const sprite = this.physics.add.image(x, y, 'portal').setScale(SCALE);
    sprite.body.setImmovable(true).setAllowGravity(false);
    // Portal artwork only fills 17×21 of the 32×32 frame (lots of
    // empty alpha around it).  Without refit the player triggers the
    // overlap ~7 unscaled px before they actually touch the visible
    // portal.  shrink: 0.92 trims a sliver off each side so contact
    // requires walking into the portal, not brushing past.
    this._fitBodyToTexture(sprite, { shrink: 0.92 });
    // Gently bob up and down for visual feedback
    this.tweens.add({
      targets: sprite,
      y: y - 12,
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return sprite;
  }
}

// ── Boot ─────────────────────────────────────
// ── MapScene ─────────────────────────────────────────────────────────────────
class MapScene extends Phaser.Scene {
  constructor() { super('MapScene'); }

  create() {
    const W = this.scale.width;   // 800
    const H = this.scale.height;  // 480

    // ── Background ────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, 0xb8dff8).setOrigin(0);      // sky
    this.add.rectangle(0, H * 0.70, W, H * 0.30, 0x7ab648).setOrigin(0); // grass
    this.add.rectangle(0, H * 0.70, W, 10, 0x52a84f).setOrigin(0);       // grass edge

    // Clouds
    [[130, 62, 1.0], [420, 44, 0.72], [690, 70, 0.88]].forEach(([cx, cy, s]) => {
      const g = this.add.graphics().fillStyle(0xffffff, 0.88);
      g.fillEllipse(cx,        cy,        72*s, 36*s);
      g.fillEllipse(cx - 26*s, cy + 8*s,  46*s, 28*s);
      g.fillEllipse(cx + 26*s, cy + 5*s,  54*s, 30*s);
    });

    // ── Title ─────────────────────────────────────────────────────
    this.add.text(W / 2, 36, 'TUTORIAL WORLD', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#3a6090', strokeThickness: 5,
    }).setOrigin(0.5);

    // ── Level positions (slight Y variation like Dadish) ──────────
    const lvPos = [
      { x: 115, y: 265 },
      { x: 253, y: 240 },
      { x: 393, y: 268 },
      { x: 533, y: 243 },
      { x: 663, y: 262 },
    ];

    // ── Read completion state ──────────────────────────────────────
    const lvl1Done = this.registry.get('level1Complete') || false;
    const lvl1Star = this.registry.get('level1Star')     || false;
    const lvl2Done = this.registry.get('level2Complete') || false;
    const lvl2Star = this.registry.get('level2Star')     || false;

    // ── Connecting dashed path ────────────────────────────────────
    const pathGfx = this.add.graphics();
    pathGfx.lineStyle(7, 0xc8a878, 1);
    for (let i = 0; i < lvPos.length - 1; i++) {
      this._dashed(pathGfx, lvPos[i], lvPos[i + 1], 12, 9);
    }

    // ── Level nodes ────────────────────────────────────────────────
    // Level n unlocks when level (n-1) is complete.  Currently only
    // levels 1 and 2 have content; the rest stay locked.
    const doneByLevel = { 1: lvl1Done, 2: lvl2Done };
    const starByLevel = { 1: lvl1Star, 2: lvl2Star };
    lvPos.forEach((p, i) => {
      const n        = i + 1;
      const unlocked = (n === 1) || (n === 2 && lvl1Done);
      const done     = !!doneByLevel[n];
      const star     = !!starByLevel[n];
      this._node(p.x, p.y, n, unlocked, done, star);
    });

    // ── EX node ───────────────────────────────────────────────────
    // Off in the corner, away from the numbered path.  Locked with an
    // opening date beforehand, playable during the window, gone after.
    const exPhase = exWindowPhase();
    if (exPhase !== 'over') this._exNode(720, 400, exPhase);

    // ── Back button ───────────────────────────────────────────────
    const back = this.add.text(20, 20, '◀  Menu', {
      fontSize: '15px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#00000055', padding: { x: 10, y: 6 },
    }).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setAlpha(0.75));
    back.on('pointerout',  () => back.setAlpha(1.00));
    back.on('pointerdown', () => this.scene.start('MenuScene'));

    // ── Keyboard fallbacks: 1/ENTER/SPACE → level 1, 2 → level 2 ───
    this.input.keyboard.once('keydown-ONE',   () => this.scene.start('GameScene', { level: 1 }));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('GameScene', { level: 1 }));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene', { level: 1 }));
    if (lvl1Done) {
      this.input.keyboard.once('keydown-TWO', () => this.scene.start('GameScene', { level: 2 }));
    }
    // Always available, in or out of the event window, so the level can
    // be tested at any time.
    this.input.keyboard.once('keydown-X', () => this.scene.start('GameScene', { level: 'ex' }));
  }

  // ── Helpers ───────────────────────────────────────────────────────

  _dashed(gfx, a, b, dash, gap) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len, ny = dy / len;
    let d = 0, on = true;
    while (d < len) {
      const seg = Math.min(on ? dash : gap, len - d);
      if (on) {
        gfx.beginPath();
        gfx.moveTo(a.x + nx * d,       a.y + ny * d);
        gfx.lineTo(a.x + nx * (d+seg), a.y + ny * (d+seg));
        gfx.strokePath();
      }
      d += seg; on = !on;
    }
  }

  // The anniversary node: gold rather than the numbered path's blue, and
  // labelled EX so it reads as outside the normal progression.  Open to
  // everyone — no completion gate — since it's an event level.
  _exNode(x, y, phase) {
    const R = 33;
    const open = phase === 'open';
    const done = this.registry.get('goldSkinUnlocked') || false;

    const gfx = this.add.graphics({ x, y });
    gfx.fillStyle(0x000000, 0.18).fillCircle(4, 6, R);
    // Muted while it's still upcoming, full gold once it's playable.
    gfx.fillStyle(!open ? 0xe6dcc0 : (done ? 0xf5c518 : 0xfff4cc), 1).fillCircle(0, 0, R);
    gfx.lineStyle(5, open ? 0xd4a800 : 0xb0a070, 1).strokeCircle(0, 0, R);

    const lbl = this.add.text(x, y, 'EX', {
      fontSize: '24px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: open ? '#7a5000' : '#8d8163',
    }).setOrigin(0.5);

    if (open) {
      lbl.setInteractive(new Phaser.Geom.Rectangle(-R, -R, R * 2, R * 2),
                         Phaser.Geom.Rectangle.Contains);
      lbl.input.cursor = 'pointer';
      lbl.on('pointerover', () =>
        this.tweens.add({ targets: [gfx, lbl], scaleX: 1.12, scaleY: 1.12, duration: 110, ease: 'Back.easeOut' }));
      lbl.on('pointerout', () =>
        this.tweens.add({ targets: [gfx, lbl], scaleX: 1, scaleY: 1, duration: 110 }));
      lbl.on('pointerup', () => this.scene.start('GameScene', { level: 'ex' }));
    } else {
      // Small padlock over the EX, matching the locked numbered nodes.
      gfx.fillStyle(0xffffff, 0.75).fillRoundedRect(-9, 6, 18, 14, 3);
      gfx.lineStyle(4, 0xffffff, 0.75);
      gfx.beginPath(); gfx.arc(0, 6, 8, Math.PI, 0, false); gfx.strokePath();
    }

    this.add.text(x, y + R + 16, open ? 'Anniversary' : exOpensLabel(), {
      fontSize: '11px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: open ? '#7a5000' : '#6b6350', strokeThickness: 4,
    }).setOrigin(0.5);
  }

  _node(x, y, n, unlocked, done, hasStar) {
    const R = 33;

    if (unlocked) {
      // Graphics positioned AT (x,y) so scale tweens pivot from the circle centre
      const gfx = this.add.graphics({ x, y });
      gfx.fillStyle(0x000000, 0.18).fillCircle(4, 6, R);               // shadow
      gfx.fillStyle(done ? 0xf5c518 : 0xffffff, 1).fillCircle(0, 0, R); // fill
      gfx.lineStyle(5, done ? 0xd4a800 : 0x5b8dd9, 1).strokeCircle(0, 0, R); // border

      // Text label — made interactive with a rect hit area covering the whole circle.
      // Same technique as the working back button; avoids Arc/Zone/Container issues.
      const lbl = this.add.text(x, y, `${n}`, {
        fontSize: '28px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: done ? '#7a5000' : '#2c5aa0',
      }).setOrigin(0.5);

      // Hit area is a 2R×2R rectangle centred at the text's local origin (0,0)
      lbl.setInteractive(
        new Phaser.Geom.Rectangle(-R, -R, R * 2, R * 2),
        Phaser.Geom.Rectangle.Contains
      );
      lbl.input.cursor = 'pointer';

      lbl.on('pointerover', () =>
        this.tweens.add({ targets: [gfx, lbl], scaleX: 1.12, scaleY: 1.12, duration: 110, ease: 'Back.easeOut' }));
      lbl.on('pointerout', () =>
        this.tweens.add({ targets: [gfx, lbl], scaleX: 1, scaleY: 1, duration: 110 }));
      // pointerup (not pointerdown) matches MenuScene PLAY button pattern which works
      lbl.on('pointerup', () => {
        console.log('[MapScene] Level', n, 'clicked → starting GameScene');
        try {
          this.scene.start('GameScene', { level: n });
        } catch (e) {
          console.error('[MapScene] scene.start threw:', e);
        }
      });

    } else {
      // Locked — gray node, no interaction
      const gfx = this.add.graphics({ x, y });
      gfx.fillStyle(0x000000, 0.15).fillCircle(4, 6, R);
      gfx.fillStyle(0xaaaaaa, 1).fillCircle(0, 0, R);
      gfx.lineStyle(5, 0x888888, 1).strokeCircle(0, 0, R);
      // Padlock body
      gfx.fillStyle(0xffffff, 0.65).fillRoundedRect(-11, -4, 22, 18, 4);
      // Padlock shackle
      gfx.lineStyle(5, 0xffffff, 0.65);
      gfx.beginPath(); gfx.arc(0, -4, 10, Math.PI, 0, false); gfx.strokePath();
    }

    // Star indicator below the circle (gold if earned, gray outline if not)
    const sg  = this.add.graphics({ x, y });
    const sy  = R + 18;   // relative to gfx origin (x,y)
    const pts = Array.from({ length: 10 }, (_, i) => {
      const angle = (i * Math.PI / 5) - Math.PI / 2;
      const r     = i % 2 === 0 ? 10 : 4;
      return new Phaser.Math.Vector2(Math.cos(angle) * r, sy + Math.sin(angle) * r);
    });
    if (hasStar) { sg.fillStyle(0xf5c518, 1).fillPoints(pts, true); }
    sg.lineStyle(2, hasStar ? 0xd4a800 : 0xaaaaaa, 1).strokePoints(pts, true);
  }
}

// ── HUDScene ─────────────────────────────────
// Runs in parallel with GameScene. Uses its own camera (no zoom) so all
// HUD elements render at full 800×480 resolution on top of the game.
class HUDScene extends Phaser.Scene {
  constructor() { super('HUDScene'); }

  create() {
    const W  = this.scale.width;   // 800
    const H  = this.scale.height;  // 480
    this._gs = this.scene.get('GameScene');

    // ── Layout reference (no visible panel) ───────
    const panelY = H - 80;

    // ── Bar geometry ──────────────────────────────
    // Bars are horizontally centred on the screen.  Widened from 260x14
    // so they don't look undersized beside the enlarged element row.
    // A landscape phone scales the 800x480 canvas to about 0.78, so a
    // 36px button lands at 28 real pixels — well under the ~44px
    // comfortable touch target.  With touch controls on, the whole HUD
    // steps up so buttons land around 44.  Desktop keeps 36.
    const TOUCH_HUD = touchControlsOn();
    this._TOUCH_HUD = TOUCH_HUD;
    const BAR_W = TOUCH_HUD ? 420 : 340, BAR_H = TOUCH_HUD ? 18 : 16;
    const BAR_X = Math.round((W - BAR_W) / 2);  // 230 for W=800
    // Stack measured up from the bottom edge: slots sit lowest (they're
    // the tallest now), then HP, then XP.
    // Stack sits higher when the buttons are bigger, so the taller slot
    // row still clears the bottom edge.
    const xpY   = TOUCH_HUD ? 379 : 402;
    const hpY   = TOUCH_HUD ? 401 : 422;
    this._BAR_W = BAR_W;
    this._BAR_X = BAR_X;
    this._HP_Y  = hpY;

    // ── XP bar (blue) ─────────────────────────────
    this.add.rectangle(BAR_X, xpY, BAR_W, BAR_H, 0x222222).setOrigin(0, 0.5);
    this.xpFill = this.add.rectangle(BAR_X, xpY, BAR_W, BAR_H, 0x3b9fff).setOrigin(0, 0.5);
    this.add.rectangle(BAR_X, xpY, BAR_W, BAR_H)
      .setOrigin(0, 0.5).setStrokeStyle(2, 0x000000).setFillStyle();
    this.xpText = this.add.text(BAR_X + BAR_W / 2, xpY, '0/15', {
      fontSize: '11px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Level badge — circle on the left of the XP bar
    this.add.circle(BAR_X - 4, xpY, 14, 0x3b9fff).setStrokeStyle(3, 0x1e5a9d);
    this.lvlText = this.add.text(BAR_X - 4, xpY, '0', {
      fontSize: '15px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#1e5a9d', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── HP bar (green) ────────────────────────────
    this.add.rectangle(BAR_X, hpY, BAR_W, BAR_H, 0x222222).setOrigin(0, 0.5);
    this.hpFill = this.add.rectangle(BAR_X, hpY, BAR_W, BAR_H, 0x52a850).setOrigin(0, 0.5);
    this.add.rectangle(BAR_X, hpY, BAR_W, BAR_H)
      .setOrigin(0, 0.5).setStrokeStyle(2, 0x000000).setFillStyle();
    // Purple slice showing HP a Dark Surge just drained, before it goes.
    // Built at full width and resized with setSize: a Rectangle created
    // at width 0 can't be driven by displayWidth (width * scaleX == 0).
    this.hpGhost = this.add.rectangle(BAR_X, hpY, BAR_W, BAR_H, 0x9b4dff)
      .setOrigin(0, 0.5).setVisible(false);
    this.hpText = this.add.text(BAR_X + BAR_W / 2, hpY, '100/100', {
      fontSize: '11px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── Boss health bar ───────────────────────────
    // Screen-wide across the top, well clear of the player's own bars at
    // the bottom.  Hidden until a boss is actually alive.
    const BOSS_W = 620, BOSS_H = 26;
    const bossX = Math.round((W - BOSS_W) / 2);
    const bossY = 54;
    this._BOSS_BAR_W = BOSS_W;
    this.bossLabel = this.add.text(W / 2, 28, 'Boss: Golden Emperor', {
      fontSize: '17px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffd700', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    const bossBg = this.add.rectangle(bossX, bossY, BOSS_W, BOSS_H, 0x2a0a12).setOrigin(0, 0.5);
    this.bossFill = this.add.rectangle(bossX, bossY, BOSS_W, BOSS_H, 0xffd700).setOrigin(0, 0.5);
    const bossEdge = this.add.rectangle(bossX, bossY, BOSS_W, BOSS_H)
      .setOrigin(0, 0.5).setStrokeStyle(3, 0x000000).setFillStyle();
    // Purple slice showing HP the Emperor just stole, before it turns gold.
    this.bossGhost = this.add.rectangle(bossX, bossY, BOSS_W, BOSS_H, 0x9b4dff)
      .setOrigin(0, 0.5).setVisible(false);
    this._BOSS_X = bossX;
    this._BOSS_Y = bossY;
    this.bossText = this.add.text(W / 2, bossY, '350 / 350', {
      fontSize: '13px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#3a2a00', stroke: '#ffe98a', strokeThickness: 2,
    }).setOrigin(0.5);
    this._bossBarObjs = [this.bossLabel, bossBg, this.bossFill, this.bossGhost,
                         bossEdge, this.bossText];
    this._bossBarObjs.forEach(o => o.setVisible(false));
    // Boss statuses hang under the bar instead of over the sprite, at the
    // same size the peons use, left-aligned with the bar.
    this._BOSS_BADGE = 32;
    this._BOSS_BADGE_Y = bossY + BOSS_H / 2 + 10 + this._BOSS_BADGE / 2;
    this._bossStatusIcons = [];

    // ── Pause button (yellow) — raised so there's air below it ──
    // Buttons are pushed out to three corners so the middle of the bottom
    // edge is free for the wider element row.  Pause goes top-right,
    // clear of the boss bar (which spans x 90-710) and its badges.
    const BTN = TOUCH_HUD ? 56 : 36;    // 56 * 0.78 = 43.7 real px
    const btnY  = TOUCH_HUD ? 444 : 454;   // bottom row, aligned with slots
    const pauseX = W - 28, pauseY = 28;
    const invX   = 28;
    const abX    = W - 28, abY = btnY;
    const pb = this.add.rectangle(pauseX, pauseY, BTN, BTN, 0xffd54f)
      .setStrokeStyle(3, 0xc99a1a)
      .setInteractive({ useHandCursor: true });
    this.pauseIcon = this.add.text(pauseX, pauseY, '⏸', {
      fontSize: '22px', fontFamily: 'Arial, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);
    pb.on('pointerover', () => pb.setFillStyle(0xffe47a));
    pb.on('pointerout',  () => pb.setFillStyle(0xffd54f));
    pb.on('pointerup',   () => this._togglePause());

    // ── Inventory button (chest) ──────────────────
    const ib = this.add.rectangle(invX, btnY, BTN, BTN, 0xb98b5a)
      .setStrokeStyle(3, 0x6b4a25)
      .setInteractive({ useHandCursor: true });
    this.add.image(invX, btnY + 1, 'chest', 0).setScale(1.6);
    ib.on('pointerover', () => ib.setFillStyle(0xd4a46c));
    ib.on('pointerout',  () => ib.setFillStyle(0xb98b5a));
    ib.on('pointerup',   () => this._openStatusSheet());

    // Hotkey: 'I' opens the status sheet (close handled by overlay itself).
    this.input.keyboard.on('keydown-I', () => {
      if (!window.statusSheet || window.statusSheet.isOpen()) return;
      this._openStatusSheet();
    });

    // ── Arrows button (3 drawn arrows + quantity badge) ──
    const ab = this.add.rectangle(abX, abY, BTN, BTN, 0xa5adb8)
      .setStrokeStyle(3, 0x4a4f5a)
      .setInteractive({ useHandCursor: true });
    // Draw 3 diagonal arrows with Graphics (quiver look)
    const ag = this.add.graphics();
    ag.lineStyle(2, 0x1e2a38, 1);
    for (let i = 0; i < 3; i++) {
      const dy = (i - 1) * 5;
      ag.beginPath();
      ag.moveTo(abX - 11, abY - 4 + dy + 7);
      ag.lineTo(abX + 9,  abY - 4 + dy - 7);
      ag.strokePath();
    }
    ag.fillStyle(0x1e2a38, 1);
    for (let i = 0; i < 3; i++) {
      const dy = (i - 1) * 5;
      ag.fillTriangle(
        abX + 9,  abY - 4 + dy - 7,
        abX + 3,  abY - 4 + dy - 4,
        abX + 6,  abY - 4 + dy,
      );
      // Fletching squares at tail
      ag.fillRect(abX - 13, abY - 4 + dy + 6, 3, 3);
    }
    // Quantity badge (bottom-right)
    this.arrowCount = this.add.text(abX + 14, abY + 14, '0', {
      fontSize: '12px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 1);
    ab.on('pointerover', () => ab.setFillStyle(0xb8bfcb));
    ab.on('pointerout',  () => ab.setFillStyle(0xa5adb8));
    ab.on('pointerup',   () => { /* TODO: arrows UI */ });

    // ── 10 Element slots (aligned with bar edges) ──
    // setOrigin(0, 0.5) → sx is the LEFT edge of each slot (not centre).
    // Without this, default origin 0.5 makes the row sit ~11px too far left.
    // Slots match the corner buttons at 36px so they're the same touch
    // target, which makes the row wider than the bars — so it centres on
    // the screen rather than on the bars.
    const slotSize  = BTN;
    const slotGap   = 5;
    const slotRowW  = 10 * slotSize + 9 * slotGap;         // 405
    const slotStart = Math.round((W - slotRowW) / 2);      // 198
    const slotY     = btnY;
    this.hotbarSlots = [];
    for (let i = 0; i < 10; i++) {
      const sx = slotStart + i * (slotSize + slotGap);
      const rect = this.add.rectangle(sx, slotY, slotSize, slotSize, 0x8b98a7)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, 0x000000)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this._gs && this._gs._fireElementInSlot(i));
      const icon = this.add.sprite(sx + slotSize / 2, slotY, 'icon_fire', 0)
        .setScale(TOUCH_HUD ? 1.4 : 0.9).setVisible(false);   // tracks slot size
      const darken = this.add.rectangle(sx, slotY, slotSize, slotSize, 0x000000, 0.55)
        .setOrigin(0, 0.5).setVisible(false);
      const reloadBar = this.add.rectangle(sx, slotY + slotSize / 2, slotSize, 0, 0x33aaff)
        .setOrigin(0, 1).setVisible(false);
      this.hotbarSlots.push({ rect, icon, darken, reloadBar, element: null });
    }

    // ── Effects placeholder area (right side) ─────
    // (Empty for now — per spec, irrelevant until status effects are added.)

    this._buildTouchControls(W, H);

    // ── PAUSED overlay (hidden by default) ────────
    this.pausedText = this.add.text(W / 2, H / 2 - 40, 'PAUSED', {
      fontSize: '48px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setVisible(false);

    // Exit back to the map.  Only reachable while paused, so it can't be
    // hit mid-fight by accident.
    this.exitBtn = this.add.text(W / 2, H / 2 + 30, '  EXIT TO MAP  ', {
      fontSize: '20px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#c0392b', padding: { x: 18, y: 9 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.exitBtn.on('pointerover', () => this.exitBtn.setStyle({ backgroundColor: '#e04b39' }));
    this.exitBtn.on('pointerout',  () => this.exitBtn.setStyle({ backgroundColor: '#c0392b' }));
    this.exitBtn.on('pointerup',   () => this._exitToMap());

    // Touch-control toggle — auto-detects by default, but a phone that
    // reports the wrong pointer type, or a desktop player who wants to
    // try them, needs a way to force it either way.
    const labelFor = () => {
      const p = touchPref();
      const state = p === 'auto' ? (deviceIsTouch() ? 'Auto (on)' : 'Auto (off)')
                  : p === 'on'   ? 'On' : 'Off';
      return `  Touch controls: ${state}  `;
    };
    this.touchToggle = this.add.text(W / 2, H / 2 + 84, labelFor(), {
      fontSize: '15px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#3f4a63', padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.touchToggle.on('pointerover', () => this.touchToggle.setStyle({ backgroundColor: '#55638a' }));
    this.touchToggle.on('pointerout',  () => this.touchToggle.setStyle({ backgroundColor: '#3f4a63' }));
    this.touchToggle.on('pointerup', () => {
      const next = { auto: 'on', on: 'off', off: 'auto' }[touchPref()];
      const wasOn = touchControlsOn();
      setTouchPref(next);
      this.touchToggle.setText(labelFor());
      this._applyTouchControlVisibility();
      // Button and bar sizes are decided in create(), so crossing the
      // on/off line needs a rebuild — the HUD reads the paused state from
      // GameScene each frame, so it comes straight back up paused.
      if (touchControlsOn() !== wasOn) this.scene.restart();
    });
  }

  // Leaving mid-level: unpause first so the world isn't left frozen for
  // the next run, then hand off to the map.  GameScene's shutdown stops
  // this HUD scene.
  _exitToMap() {
    const gs = this._gs;
    if (gs) {
      if (gs._paused) gs.togglePause();
      gs.scene.start('MapScene');
    }
  }

  _togglePause() {
    this._gs.togglePause();
    const paused = this._gs._paused;
    this.pauseIcon.setText(paused ? '▶' : '⏸');
    this.pausedText.setVisible(paused);
    this.exitBtn.setVisible(paused);
    this.touchToggle.setVisible(paused);
  }

  _openStatusSheet() {
    if (!window.statusSheet) return;
    const gs = this._gs;
    const wasPaused = gs && gs._paused;
    if (gs && !wasPaused) gs.togglePause();

    // Open FIRST.  open() runs loadFromProgress(), which resets state to
    // defaults (hp 0/0) before restoring saved data — so anything pushed
    // in beforehand is wiped.  Pushing afterwards is what makes the
    // mirrored HP survive; setStat re-renders while the sheet is open.
    window.statusSheet.open({
      onClose: () => {
        // Eating heals inside the sheet, but GameScene owns the live HP —
        // read it back so food actually restores health in play.
        // Guarded on a sane max: a sheet that failed to load reports
        // 0/0, and writing that back would silently zero the player.
        if (gs && window.statusSheet.getState) {
          const hp  = window.statusSheet.getState().hp || {};
          const cur = Number(hp.current), max = Number(hp.max);
          if (Number.isFinite(cur) && max > 0) {
            gs._hp = Phaser.Math.Clamp(cur, 0, gs._maxHp);
          }
        }
        if (gs && !wasPaused) gs.togglePause();
      },
    });

    // Mirror in-game HP into the sheet so the bar reflects current state.
    if (gs && window.statusSheet.setStat) {
      window.statusSheet.setStat('hp.current', gs._hp);
      window.statusSheet.setStat('hp.max',     gs._maxHp);
      window.statusSheet.setStat('level',      gs._level);
    }
  }

  update() {
    if (!this._gs || !this._gs.scene.isActive()) return;
    const gs = this._gs;

    // HP bar
    this.hpFill.displayWidth = (gs._hp / gs._maxHp) * this._BAR_W;
    this.hpText.setText(`${gs._hp}/${gs._maxHp}`);

    // Surge drain: purple over the stretch of bar that just emptied.
    const sf = gs._surgeFlash;
    if (sf && gs.time.now < sf.until && gs._maxHp > 0) {
      const x0 = this._BAR_X + (sf.to / gs._maxHp) * this._BAR_W;
      const w  = ((sf.from - sf.to) / gs._maxHp) * this._BAR_W;
      this.hpGhost.setPosition(x0, this._HP_Y).setVisible(true);
      this.hpGhost.setSize(Math.max(2, w), this.hpFill.height);
    } else {
      this.hpGhost.setVisible(false);
    }

    // Boss bar — only while a boss is on its feet.
    const boss = gs.emperor;
    const showBoss = !!(boss && !boss.dead && boss.sprite.active);
    this._bossBarObjs.forEach(o => o.setVisible(showBoss));
    if (showBoss) {
      this.bossFill.displayWidth = (boss.hp / boss.maxHp) * this._BOSS_BAR_W;
      this.bossText.setText(`${boss.hp} / ${boss.maxHp}`);
      // Lifesteal: the slice he just gained shows purple, then settles
      // to gold when the flash expires.
      const bf = gs._bossHealFlash;
      if (bf && gs.time.now < bf.until) {
        const x0 = this._BOSS_X + (bf.from / boss.maxHp) * this._BOSS_BAR_W;
        const w  = ((bf.to - bf.from) / boss.maxHp) * this._BOSS_BAR_W;
        this.bossGhost.setPosition(x0, this._BOSS_Y).setVisible(true);
        this.bossGhost.setSize(Math.max(2, w), this.bossFill.height);
      } else {
        this.bossGhost.setVisible(false);
      }
    }
    this._updateBossStatusIcons(showBoss ? boss : null);
    if (this._actionBtns) this._refreshActionIcons();

    // XP bar + level
    this.xpFill.displayWidth = (gs._xp / gs._xpToNext) * this._BAR_W;
    this.xpText.setText(`${gs._xp}/${gs._xpToNext}`);
    this.lvlText.setText(`${gs._level}`);

    // Keep pause icon in sync (in case ESC toggled it)
    const paused = gs._paused;
    if (paused && this.pauseIcon.text !== '▶') this.pauseIcon.setText('▶');
    if (!paused && this.pauseIcon.text !== '⏸') this.pauseIcon.setText('⏸');
    this.pausedText.setVisible(paused);
    this.exitBtn.setVisible(paused);
    this.touchToggle.setVisible(paused);

    // Hotbar: icon + darken/reload-bar overlay per slot
    if (gs._hotbar) {
      this.hotbarSlots.forEach((s, i) => {
        const slot = gs._hotbar[i];
        if (!slot) { s.icon.setVisible(false); s.darken.setVisible(false); s.reloadBar.setVisible(false); return; }
        const def = ELEMENT_DEFS[slot.element];
        if (s.element !== slot.element) {
          s.element = slot.element;
          s.icon.setVisible(true).play(def.icon);
        }
        const onCooldown = slot.cooldownRemaining > 0;
        s.darken.setVisible(onCooldown);
        s.reloadBar.setVisible(onCooldown);
        if (onCooldown) {
          const size = s.rect.height;
          const frac = 1 - (slot.cooldownRemaining / def.reload);
          s.reloadBar.setSize(size, size * Phaser.Math.Clamp(frac, 0, 1));
        }
      });
    }
  }

  // On-screen movement and action buttons.  The element slots, pause and
  // inventory buttons already respond to taps through their own pointer
  // handlers, so these cover only what used to be keyboard-only.
  //
  // They sit above the HUD row and hard against the left and right edges,
  // which is where thumbs land in landscape.  Semi-transparent because
  // they unavoidably overlay gameplay on a phone.
  _buildTouchControls(W, H) {
    const gs = this._gs;
    this._touchBtns = [];
    const SIZE = 56, R = SIZE / 2;

    // Pressing sets the virtual twin of a key; releasing clears it.
    // pointerupoutside matters — a thumb that slides off the button
    // would otherwise leave the key stuck down.
    // keyName may be null for a button whose action doesn't exist yet —
    // it still lights up on press so the layout can be felt out, it just
    // doesn't drive anything.
    const makeBtn = (x, y, label, keyName, fontSize = 26, radius = R) => {
      const circle = this.add.circle(x, y, radius, 0x1e2340, 0.42)
        .setStrokeStyle(3, 0xffffff, 0.5)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, y, label, {
        fontSize: `${fontSize}px`, fontFamily: 'Arial, sans-serif',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0.85);

      const press   = () => {
        if (keyName && gs && gs.virtualKeys) gs.virtualKeys[keyName] = true;
        circle.setFillStyle(0x3b9fff, 0.65);
      };
      const release = () => {
        if (keyName && gs && gs.virtualKeys) gs.virtualKeys[keyName] = false;
        circle.setFillStyle(0x1e2340, 0.42);
      };
      circle.on('pointerdown', press);
      circle.on('pointerup', release);
      circle.on('pointerupoutside', release);
      circle.on('pointerout', release);

      this._touchBtns.push(circle, txt);
      circle._label = txt;
      return circle;
    };

    // These only ever show alongside the enlarged touch HUD, whose XP bar
    // top edge sits at y=370 — so a 56px button centred at 320 reaches
    // 348, leaving 22px of air, and the joystick's base clears it by 24.
    // Left thumb: a joystick (see _buildJoystick).
    this._buildJoystick(96, 292);
    // Right thumb: the action cluster.
    this._buildActionCluster(makeBtn);

    this._applyTouchControlVisibility();
  }

  // Five actions fanned around an oversized jump button.  Jump sits
  // lower-left of the cluster because in a landscape grip the thumb
  // pivots at the corner but *rests* up and inward from it, so that's
  // the easiest spot to reach, not the corner itself.  The remaining
  // four sit on a 96px arc, ordered by how urgently they're needed:
  // defence nearest (blocking is reactive), artifact furthest.
  //
  // Every button but jump and melee is hidden unless something is
  // equipped in its slot, so an early-game player sees two buttons and
  // the cluster fills out as they gear up.
  _buildActionCluster(makeBtn) {
    // x, y, r, virtual key, and which equipment slot supplies the icon.
    const SPEC = [
      { id: 'jump',     x: 651, y: 305, r: 42, vk: 'up', label: '\u25B2', fs: 32 },
      { id: 'artifact', x: 626, y: 212, r: 33, slot: 'artifact'     },
      { id: 'ranged',   x: 710, y: 229, r: 33, slot: 'rangedWeapon' },
      { id: 'defence',  x: 747, y: 297, r: 33, slot: 'defence', vk: 't' },
      // Melee always shows: bare fists are still an attack.
      { id: 'melee',    x: 722, y: 369, r: 33, slot: 'meleeWeapon', vk: 'e', always: true },
    ];

    this._actionBtns = SPEC.map(def => {
      const circle = makeBtn(def.x, def.y, def.label || '', def.vk || null,
                             def.fs || 22, def.r);
      // Icon sits above the circle; swapped out when gear changes.
      const icon = def.slot
        ? this.add.image(def.x, def.y, '__missing').setVisible(false)
        : null;
      if (icon) this._touchBtns.push(icon);
      return { ...def, circle, icon, textObj: circle._label, shownItem: undefined };
    });
    this._refreshActionIcons();
  }

  // Repoints each slot-backed button at whatever is equipped now.  Cheap
  // to call every frame: it only touches a button whose item changed.
  _refreshActionIcons() {
    const st = window.statusSheet && window.statusSheet.getState();
    const equipment = (st && st.equipment) || {};
    const showAll = touchControlsOn();

    for (const b of this._actionBtns || []) {
      if (!b.slot) continue;
      const slotted = equipment[b.slot] && equipment[b.slot].itemId;
      // Bare fists for an unarmed melee slot; nothing at all for the rest.
      const wanted = slotted || (b.always ? '__fist__' : null);
      if (wanted === b.shownItem) continue;
      b.shownItem = wanted;

      const visible = showAll && !!wanted;
      b.circle.setVisible(visible);
      if (b.textObj) b.textObj.setVisible(visible);
      b.icon.setVisible(visible);
      if (!wanted) continue;

      if (wanted === '__fist__') {
        // Frame 3 of the unarmed attack sheet — the punch at full reach.
        b.icon.setTexture('player_attack', 3);
      } else if (this.textures.exists('item_' + wanted)) {
        b.icon.setTexture('item_' + wanted);
      } else {
        b.icon.setVisible(false);
        continue;
      }
      // Fit the art inside the circle whatever its native size is.  The
      // largest square that fits is r*sqrt(2); 1.3 leaves a little margin
      // so a diagonal sword's corners don't poke past the ring.
      const src = b.icon.frame;
      const fit = b.r * 1.3;
      b.icon.setDisplaySize(
        ...(src.width / src.height > 1
          ? [fit, fit * src.height / src.width]
          : [fit * src.width / src.height, fit]));
      b.icon.setFlipX(true);   // sheet art faces left; the player faces right
    }
  }

  // Left-thumb joystick.  Angles are degrees clockwise from straight up,
  // so 90 is right, 180 is down, 270 is left.
  //
  //        315 ─── 0 ─── 45      up: ignored (jump is a right-hand button)
  //         │              │
  //        270            90     left / right: walk
  //         │              │
  //        225 ── 180 ── 135     duck band
  //
  // Inside the duck band the player also walks, at the 40% duck speed the
  // existing duck branch already applies — except in the narrow band
  // either side of straight down, which is a stationary duck.  Nothing
  // latches: the keys track the stick's live angle, so the player stays
  // ducked for exactly as long as the thumb stays in the band.
  _buildJoystick(cx, cy) {
    const gs = this._gs;
    const BASE_R = 54, KNOB_R = 24;
    // Fraction of BASE_R that reads as centred.  Sized for angular
    // stability rather than jitter: the stationary-duck band is only 30
    // degrees wide, and closer to the centre a few pixels of thumb wobble
    // swing the angle far enough to fall out of it.  At 0.30 (16px) a 4px
    // wobble moves the angle 14 degrees; at 0.22 it moved it 18.
    const DEAD   = 0.30;
    const DUCK_MIN = 135, DUCK_MAX = 225;   // walk + duck
    const PURE_MIN = 165, PURE_MAX = 195;   // duck, no walk

    const base = this.add.circle(cx, cy, BASE_R, 0x1e2340, 0.34)
      .setStrokeStyle(3, 0xffffff, 0.45)
      .setInteractive({ useHandCursor: true });
    const knob = this.add.circle(cx, cy, KNOB_R, 0xffffff, 0.55)
      .setStrokeStyle(3, 0x1e2340, 0.7);
    this._touchBtns.push(base, knob);

    const setKeys = (left, right, down) => {
      if (!gs || !gs.virtualKeys) return;
      gs.virtualKeys.left  = left;
      gs.virtualKeys.right = right;
      gs.virtualKeys.down  = down;
    };
    const recentre = () => { knob.setPosition(cx, cy); setKeys(false, false, false); };

    const update = (pointer) => {
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const dist = Math.hypot(dx, dy);
      // Knob follows the thumb but stays inside the base.
      const clamped = Math.min(dist, BASE_R);
      if (dist > 0) knob.setPosition(cx + dx / dist * clamped, cy + dy / dist * clamped);
      else knob.setPosition(cx, cy);

      if (dist < BASE_R * DEAD) { setKeys(false, false, false); return; }

      // atan2(dx, -dy) puts 0 at the top and grows clockwise.
      let ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (ang < 0) ang += 360;

      if (ang >= DUCK_MIN && ang <= DUCK_MAX) {
        const stationary = ang >= PURE_MIN && ang <= PURE_MAX;
        // Past straight down leans left, before it leans right.
        setKeys(!stationary && ang > PURE_MAX, !stationary && ang < PURE_MIN, true);
      } else if (ang > DUCK_MAX && ang < 360 - 45) {
        setKeys(true, false, false);                    // 225-315: left
      } else if (ang > 45 && ang < DUCK_MIN) {
        setKeys(false, true, false);                    // 45-135: right
      } else {
        setKeys(false, false, false);                   // 315-45: up, ignored
      }
    };

    // Track only the pointer that grabbed the stick, so the other thumb
    // working the action buttons can't drag it.
    let owner = null;
    base.on('pointerdown', (p) => { owner = p.id; update(p); });
    this.input.on('pointermove', (p) => { if (p.id === owner) update(p); });
    const drop = (p) => { if (p.id === owner) { owner = null; recentre(); } };
    this.input.on('pointerup', drop);
    this.input.on('pointerupoutside', drop);

    this._joystickRecentre = recentre;
  }

  _applyTouchControlVisibility() {
    const show = touchControlsOn();
    (this._touchBtns || []).forEach(o => o.setVisible(show));
    // The blanket pass above would light up empty gear slots, so let the
    // icon refresh have the final say on those.
    if (this._actionBtns) {
      this._actionBtns.forEach(b => { b.shownItem = undefined; });
      this._refreshActionIcons();
    }
    // Clear anything stuck down when they're switched off mid-press, and
    // put the knob back so it isn't left deflected on the next show.
    const gs = this._gs;
    if (!show) {
      if (this._joystickRecentre) this._joystickRecentre();
      if (gs && gs.virtualKeys) {
        Object.keys(gs.virtualKeys).forEach(k => { gs.virtualKeys[k] = false; });
      }
    }
  }

  // The boss's statuses, drawn under his healthbar rather than over his
  // sprite.  Same size and layout as the peons' badge row in GameScene,
  // just anchored to the HUD instead of to a world sprite.
  _updateBossStatusIcons(boss) {
    const BADGE = this._BOSS_BADGE, GAP = 4;
    const keys = boss ? activeStatuses(boss) : [];
    while (this._bossStatusIcons.length > keys.length) {
      const b = this._bossStatusIcons.pop();
      b.img.destroy();
      b.tier.destroy();
    }
    while (this._bossStatusIcons.length < keys.length) {
      this._bossStatusIcons.push({
        img: this.add.image(0, 0, 'effect_icons', 0)
          .setDisplaySize(BADGE, BADGE),
        tier: this.add.text(0, 0, '', {
          fontSize: '14px', fontFamily: '"Arial Black", Arial, sans-serif',
          color: '#ffffff', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(1, 1),
      });
    }
    if (!keys.length) return;
    // Left-aligned with the bar, filling rightwards as statuses stack up.
    const y = this._BOSS_BADGE_Y;
    keys.forEach((k, i) => {
      const b  = this._bossStatusIcons[i];
      const cx = this._BOSS_X + BADGE / 2 + i * (BADGE + GAP);
      b.img.setFrame(EFFECT_ICON_FRAME[k]).setPosition(cx, y);
      const st = boss[STATUS_FIELD[k]];
      b.tier.setText(ROMAN[st && st.tier] || '')
            .setPosition(cx + BADGE / 2 + 3, y + BADGE / 2 + 3);
    });
  }
}

// Phaser.Scale.FIT scales the 800×480 canvas to fill the browser window
// while maintaining aspect ratio.  backgroundColor matches the sky so
// any slim letterbox is invisible.
window._ewGame = new Phaser.Game({
  type:   Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#eef8ff',
  pixelArt: true,
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  800,
    height: 480,
  },
  physics: { default:'arcade', arcade:{ gravity:{ y:600 }, debug:false } },
  scene:  [PreloadScene, MenuScene, MapScene, GameScene, HUDScene]
});
