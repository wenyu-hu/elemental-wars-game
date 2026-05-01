// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE = 3;
const TILE  = 32;
const TS    = TILE * SCALE;   // 96px display per tile

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

function logOut() { setSessionUsername(null); }

// Merge-save so we never downgrade fields (e.g. keeps level1Star=true if
// the player replays without collecting the star).
function saveProgress(update) {
  const name = getSessionUsername();
  if (!name) return;                      // guests never persist
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

  const makeField = (labelText, type, autocomplete) => {
    const wrap = document.createElement('label');
    wrap.textContent = labelText;
    wrap.style.cssText = 'display:flex;flex-direction:column;font-size:12px;color:#555;';
    const input = document.createElement('input');
    input.type = type;
    input.autocomplete = autocomplete;
    input.style.cssText = [
      'margin-top:4px', 'padding:8px 10px',
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
    'padding:8px 16px', 'font:14px "Arial Black",Arial,sans-serif',
    'color:#555', 'background:#eee', 'border:none', 'border-radius:6px', 'cursor:pointer',
  ].join(';');

  const submitBtn = document.createElement('button');
  submitBtn.textContent = mode === 'login' ? 'Log In' : 'Create Account';
  submitBtn.style.cssText = [
    'padding:8px 16px', 'font:14px "Arial Black",Arial,sans-serif',
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
    this.load.spritesheet('player_idle',   'assets/idle.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_walk',   'assets/walk.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_jump',   'assets/jump.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_attack',        'assets/attack.png',        { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_weapon_attack', 'assets/weapon_attack.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_duck',   'assets/duck.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('dummy',         'assets/dummy.png',  { frameWidth: 27, frameHeight: 25 });
    this.load.spritesheet('chest',         'assets/chest.png',  { frameWidth: 14, frameHeight: 16 });
    this.load.image('item_wooden_sword', 'assets/Sword.png');
    this.load.image('ground',   'assets/ground.png');
    this.load.image('dirt',     'assets/dirt.png');
    this.load.image('platform', 'assets/platform.png');
    this.load.image('spike',    'assets/spike.png');
    this.load.image('portal',   'assets/portal.png');
    this.load.image('star',     'assets/star.png');
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
    makeSheet('dummy',         0xcc4444, 2, 27, 25);
    makeSheet('chest',         0xcc9922, 2, 14, 16);
    makeImg  ('ground',        0x4a9944, 32, 32);
    makeImg  ('dirt',          0x3d2008, 32, 32);
    makeImg  ('platform',      0x8b5e3c, 32,  6);
    makeImg  ('spike',         0xddddcc,  8,  8);  // 8×8 fallback
    makeImg  ('dust',          0xd4c4a8,  4,  4);
    makeImg  ('portal',        0x00ddff, 32, 32);   // portal fallback
    makeImg  ('star',          0xf5c518, 14, 14);  // star fallback
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

    this.add.text(width/2, height/2-90, 'ELEMENTAL WARS', {
      fontSize: '42px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ff5722', stroke: '#ffffff', strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(width/2, height/2-38, 'Tutorial Level', {
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
      this.add.text(width/2, height/2 - 5, `Welcome back, ${user.username}!`, {
        fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif',
        color: '#2d6a4f', stroke: '#ffffff', strokeThickness: 3
      }).setOrigin(0.5);
      makeBtn(height/2 + 40, 'PLAY',    '#ff5722', '#e64a19', startGame);
      makeBtn(height/2 + 95, 'LOG OUT', '#8c8c8c', '#6c6c6c', () => {
        logOut();
        this.scene.restart();
      });
      this.input.keyboard.once('keydown-ENTER', startGame);
      this.input.keyboard.once('keydown-SPACE', startGame);
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

  create() {
    const WORLD_W   = 5800;
    const WORLD_H   = 1200;
    const floorY    = WORLD_H - 4 * TS;       // grass tile centre  y = 816
    const groundTop = floorY - TS / 2;         // grass surface      y = 768

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
    const _saved     = (_user && _user.progress) || {};
    this._level    = Number(_saved.level)     || 0;
    this._xp       = Number(_saved.xp)        || 0;
    this._xpToNext = Number(_saved.xpToNext)  || 15;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + TS * 2);
    this.cameras.main.setBackgroundColor(0xeef8ff);
    this.addBackground(WORLD_W, WORLD_H);

    // Level + entities
    this.platforms = this.physics.add.staticGroup();
    this.buildLevel(WORLD_W, WORLD_H, floorY);

    this.player     = this.createPlayer(this._respawnX, this._respawnY);
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

    this.spikes = this.physics.add.staticGroup();
    this.buildSpikes(floorY);

    // Colliders
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.collider(this.dummy.sprite,  this.platforms);
    this.physics.add.collider(this.chest.sprite,  this.platforms);
    this.physics.add.collider(this.patrolDummy.sprite, this.platforms);

    // Make dummy and chest solid — without these the player passes right through
    this.physics.add.collider(this.player.sprite, this.dummy.sprite);
    this.physics.add.collider(this.player.sprite, this.chest.sprite);
    // Patrol dummy is solid and can push the player off the platform
    this.physics.add.collider(this.player.sprite, this.patrolDummy.sprite);
    this.physics.add.overlap(
      this.player.sprite, this.spikes,
      () => this.hitBySpikes(), null, this
    );
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

    // ── Camera ───────────────────────────────────────────────────────
    // followOffset(0, +181): Phaser subtracts the offset from the target,
    // so +181 lifts the camera focus 181 world-units ABOVE the player,
    // giving ~75% sky / 20% ground on screen (Dadish look).
    this.cameras.main.setZoom(0.65);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.10);
    // +107 lifts camera focus above player so ground occupies ~30% of screen height
    this.cameras.main.setFollowOffset(0, 107);

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
    });
    this._jumpHeld = false;
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._dummyDialogTriggered = false;

    // ESC toggles pause
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());

    // Launch HUD in parallel (runs on top of GameScene, no camera zoom)
    this.scene.launch('HUDScene');
    // Stop the HUD when this scene shuts down (e.g. reaching portal)
    this.events.once('shutdown', () => this.scene.stop('HUDScene'));

    this.buildAnims();
    this.player.sprite.anims.play('idle', true);
    this.dummy.sprite.anims.play('dummy_idle', true);
    this.chest.sprite.anims.play('chest_closed', true);
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
  }

  // ─────────────────────────────────────────────────────────────────
  //  Background
  // ─────────────────────────────────────────────────────────────────
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

  respawnPlayer() {
    if (this._spikeHit) return;
    this._spikeHit = true;

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
    sprite.body.setAllowGravity(false).setSize(23, 23).setOffset(2, 1);
    const maxHp = 5;
    return { sprite, hp: maxHp, maxHp, dead: false };
  }

  createChest(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'chest').setScale(5).setImmovable(true);
    sprite.body.setAllowGravity(false).setSize(12, 14).setOffset(1, 1);
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
    add('dummy_idle',   'dummy',         0, 0,  4);
    add('dummy_hit',    'dummy',         1, 1,  4, 0);
    add('chest_closed', 'chest',         0, 0,  4);
    add('chest_open',   'chest',         1, 1,  4, 0);
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

      // Portrait — player idle sprite, centred in square
      d.portrait.setTexture('player_idle', 0)
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
    if (this.dummy.dead || this._dummyDialogTriggered) {
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
        { speaker: 'player', text: 'Hello to you, too.' },
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

    const defs = [
      { x:  280, lines: ['Use WASD or arrow keys', 'to move'] },
      { x:  880, lines: ['Press W or ↑ to jump', 'Twice to double jump'] },
      { x: 1550, lines: ['Press E or , to attack', 'Kill the training dummy'] },
      { x: 2860, lines: ['Press E or , to', 'open the chest'] },
    ];

    this._instructionBoxes = defs.map(({ x, lines }) => {
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
      bg.setPosition(x, boxY);

      const txt = this.add.text(x, boxY, lines.join('\n'), {
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
    const barBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1);
    const barFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1);
    const barLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1);
    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    const pBarBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1);
    const pBarFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1);
    const pBarLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1);
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
      const animKey = armed ? 'weapon_attack' : 'attack';
      s.anims.play(animKey, true);
      s.once('animationcomplete-' + animKey, () => { p.isAttacking = false; });
      this.time.delayedCall(200, () => this.checkAttackHit());
      if (armed) this._beginSwingTween(p);
      return;
    }

    const jp = k.up.isDown || k.w.isDown;
    if (jp && !this._jumpHeld && p.jumpsLeft > 0) {
      bod.setVelocityY(-Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * TS));
      p.jumpsLeft--;
      s.anims.play('jump', true);
      // ── Stretch on jump launch ────────────────────────────────
      this.stretchPlayer();
    }
    this._jumpHeld = jp;

    if ((k.down.isDown || k.s.isDown) && onGround) {
      // Duck: play crouch anim but still allow slow horizontal movement
      s.anims.play('duck', true);
      this.applyHorizontalMove(p, k, 0.4);
      // Keep the overlay tracking the player while ducking — without
      // this, the sword stays painted at the last position before duck
      // started and visibly floats while the player slides underneath.
      this._updateWeaponOverlay();
      return;
    }

    this.applyHorizontalMove(p, k, 1);

    // Base animation off key state, not velocity, so it responds the instant
    // a direction key is pressed (no one-frame lag from the physics solver).
    const movingH = k.left.isDown || k.a.isDown || k.right.isDown || k.d.isDown;
    if (!onGround) {
      if (s.anims.currentAnim?.key !== 'jump') s.anims.play('jump', true);
    } else if (movingH) {
      s.anims.play('walk', true);
    } else {
      s.anims.play('idle', true);
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
      const animKey = s.anims.currentAnim?.key || 'idle';
      // Phaser frame indices are 1-based within the animation.
      const frame   = (s.anims.currentFrame?.index || 1) - 1;
      // Hand sits at hip / waist height — around y=7 unscaled below
      // the sprite's local centre — and slightly forward (x=4).
      // a=30° tilts the blade up-and-forward out of the hand.
      const REST = { x: 4, y: 7, a: 30 };
      const POSE = {
        idle:          [REST],
        walk:          [
          REST,
          { x: 5, y: 6, a: 25 },
          REST,
          { x: 3, y: 8, a: 35 },
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
    const sheathed = (s.anims.currentAnim?.key === 'duck');
    w.setDepth(s.depth + (sheathed ? -1 : 1));
  }

  applyHorizontalMove(p, k, mult) {
    const spd = 200 * mult, s = p.sprite;
    if      (k.left.isDown  || k.a.isDown) { s.body.setVelocityX(-spd); s.setFlipX(false); }
    else if (k.right.isDown || k.d.isDown) { s.body.setVelocityX( spd); s.setFlipX(true);  }
    else                                    { s.body.setVelocityX(0); }
  }

  checkAttackHit() {
    const ps = this.player.sprite, reach = TS * 1.3;
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
    if (!this.dummy.dead) {
      const ds = this.dummy.sprite, bar = this.dummyBar, barW = 80;
      const bx = ds.x, by = ds.y - 25*SCALE/2 - 8;
      bar.bg.setPosition(bx, by).setSize(barW, 10);
      bar.fg.setPosition(bx - barW/2, by).setSize(barW * this.dummy.hp / this.dummy.maxHp, 10);
      bar.label.setPosition(bx, by-10).setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`);
    }
    const pd = this.patrolDummy;
    if (pd && !pd.dead && pd.sprite?.active) {
      const ds = pd.sprite, bar = this.patrolDummyBar, barW = 80;
      const bx = ds.x, by = ds.y - 25*SCALE/2 - 8;
      bar.bg.setPosition(bx, by).setSize(barW, 10);
      bar.fg.setPosition(bx - barW/2, by).setSize(barW * pd.hp / pd.maxHp, 10);
      bar.label.setPosition(bx, by-10).setText(`HP: ${pd.hp} / ${pd.maxHp}`);
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
    this._respawnX = c.sprite.x - 80;
    this._respawnY = c.sprite.y - 30;

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
    const { cx, cy, BIG_W, BIG_H, startXp, endXp, xpToNext, barFill, barText, xpLabel } = ctx;
    const ORB_COUNT = 6;
    const xpPerOrb  = (endXp - startXp) / ORB_COUNT;
    let landed = 0;

    for (let i = 0; i < ORB_COUNT; i++) {
      const orb = ctx.add(this.add.circle(cx + (i - ORB_COUNT/2) * 14, cy - 60, 8, 0x66c8ff));
      orb.setStrokeStyle(2, 0x1a4d8c);
      orb.setAlpha(0);
      const targetX = cx - BIG_W/2 + BIG_W * ((startXp + xpPerOrb * (i + 1)) / xpToNext);
      const delay   = 80 * i;
      // Pop into existence at the label, then arc toward the bar.
      this.tweens.add({ targets: orb, alpha: 1, duration: 120, delay });
      this.tweens.add({
        targets: orb,
        x: targetX, y: cy,
        duration: 480,
        delay: delay + 120,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          // Pulse on impact + grow the bar fill via an addCounter tween
          // that drives setSize() — tweening displayWidth on a
          // Rectangle with width=0 doesn't render any growth.
          this.tweens.add({ targets: orb, alpha: 0, scale: 2, duration: 140 });
          const newXp   = startXp + xpPerOrb * (landed + 1);
          const fromF   = barFill._fill;
          const toF     = newXp / xpToNext;
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
            // Snap to exact target value to avoid float drift.
            this._xp = endXp;
            barText.setText(`${endXp}/${xpToNext}`);
            this._persistXp();
            this.time.delayedCall(280, () => this._chestPhaseChest(opts, ctx));
          }
        },
      });
    }
    // Fade label out as orbs leave.
    this.tweens.add({ targets: xpLabel, alpha: 0, y: cy - 100, duration: 380, delay: 80 });
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
        onComplete: () => { ctx.cleanup(); this._chestSequenceActive = false; },
      });
    };
    this.time.delayedCall(1600, () => this._chestDismiss && this._chestDismiss());
  }

  reachPortal() {
    if (this._portalReached) return;
    this._portalReached = true;
    this.registry.set('level1Complete', true);
    if (this._gotStar) this.registry.set('level1Star', true);  // only saved now
    // Persist to localStorage for logged-in users (guests are no-ops).
    const update = { level1Complete: true };
    if (this._gotStar) update.level1Star = true;
    saveProgress(update);
    this.victoryText.setVisible(true);
    this.time.delayedCall(2500, () => this.scene.start('MapScene'));
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
    sprite.body.setSize(23, 23).setOffset(2, 1);
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

    // ── Connecting dashed path ────────────────────────────────────
    const pathGfx = this.add.graphics();
    pathGfx.lineStyle(7, 0xc8a878, 1);
    for (let i = 0; i < lvPos.length - 1; i++) {
      this._dashed(pathGfx, lvPos[i], lvPos[i + 1], 12, 9);
    }

    // ── Level nodes ────────────────────────────────────────────────
    lvPos.forEach((p, i) => {
      const n        = i + 1;
      const unlocked = n === 1;
      const done     = n === 1 && lvl1Done;
      const star     = n === 1 && lvl1Star;
      this._node(p.x, p.y, n, unlocked, done, star);
    });

    // ── Back button ───────────────────────────────────────────────
    const back = this.add.text(20, 20, '◀  Menu', {
      fontSize: '15px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#00000055', padding: { x: 10, y: 6 },
    }).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setAlpha(0.75));
    back.on('pointerout',  () => back.setAlpha(1.00));
    back.on('pointerdown', () => this.scene.start('MenuScene'));

    // ── Keyboard fallback: press 1 or ENTER to start Level 1 ──────
    this.input.keyboard.once('keydown-ONE',   () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
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
          this.scene.start('GameScene');
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
    // Bars are horizontally centred on the screen.
    const BAR_W = 260, BAR_H = 14;
    const BAR_X = Math.round((W - BAR_W) / 2);  // 270 for W=800
    const xpY   = panelY + 18;                  // 418
    const hpY   = panelY + 40;                  // 440
    this._BAR_W = BAR_W;

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
    this.hpText = this.add.text(BAR_X + BAR_W / 2, hpY, '100/100', {
      fontSize: '11px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── Pause button (yellow) — raised so there's air below it ──
    const btnY = panelY + 50;   // was 65; 15px higher for bottom padding
    const pb = this.add.rectangle(28, btnY, 36, 36, 0xffd54f)
      .setStrokeStyle(3, 0xc99a1a)
      .setInteractive({ useHandCursor: true });
    this.pauseIcon = this.add.text(28, btnY, '⏸', {
      fontSize: '22px', fontFamily: 'Arial, sans-serif',
      color: '#000000',
    }).setOrigin(0.5);
    pb.on('pointerover', () => pb.setFillStyle(0xffe47a));
    pb.on('pointerout',  () => pb.setFillStyle(0xffd54f));
    pb.on('pointerup',   () => this._togglePause());

    // ── Inventory button (chest) ──────────────────
    const ib = this.add.rectangle(72, btnY, 36, 36, 0xb98b5a)
      .setStrokeStyle(3, 0x6b4a25)
      .setInteractive({ useHandCursor: true });
    this.add.image(72, btnY + 1, 'chest', 0).setScale(1.6);
    ib.on('pointerover', () => ib.setFillStyle(0xd4a46c));
    ib.on('pointerout',  () => ib.setFillStyle(0xb98b5a));
    ib.on('pointerup',   () => this._openStatusSheet());

    // Hotkey: 'I' opens the status sheet (close handled by overlay itself).
    this.input.keyboard.on('keydown-I', () => {
      if (!window.statusSheet || window.statusSheet.isOpen()) return;
      this._openStatusSheet();
    });

    // ── Arrows button (3 drawn arrows + quantity badge) ──
    const ab = this.add.rectangle(116, btnY, 36, 36, 0xa5adb8)
      .setStrokeStyle(3, 0x4a4f5a)
      .setInteractive({ useHandCursor: true });
    // Draw 3 diagonal arrows with Graphics (quiver look)
    const ag = this.add.graphics();
    ag.lineStyle(2, 0x1e2a38, 1);
    for (let i = 0; i < 3; i++) {
      const dy = (i - 1) * 5;
      ag.beginPath();
      ag.moveTo(116 - 11, btnY - 4 + dy + 7);
      ag.lineTo(116 + 9,  btnY - 4 + dy - 7);
      ag.strokePath();
    }
    ag.fillStyle(0x1e2a38, 1);
    for (let i = 0; i < 3; i++) {
      const dy = (i - 1) * 5;
      ag.fillTriangle(
        116 + 9,  btnY - 4 + dy - 7,
        116 + 3,  btnY - 4 + dy - 4,
        116 + 6,  btnY - 4 + dy,
      );
      // Fletching squares at tail
      ag.fillRect(116 - 13, btnY - 4 + dy + 6, 3, 3);
    }
    // Quantity badge (bottom-right)
    this.arrowCount = this.add.text(116 + 14, btnY + 14, '0', {
      fontSize: '12px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 1);
    ab.on('pointerover', () => ab.setFillStyle(0xb8bfcb));
    ab.on('pointerout',  () => ab.setFillStyle(0xa5adb8));
    ab.on('pointerup',   () => { /* TODO: arrows UI */ });

    // ── 10 Element slots (aligned with bar edges) ──
    // setOrigin(0, 0.5) → sx is the LEFT edge of each slot (not centre).
    // Without this, default origin 0.5 makes the row sit ~11px too far left.
    const slotSize  = 22;
    const slotGap   = 4;
    const slotRowW  = 10 * slotSize + 9 * slotGap;                 // 256
    const slotStart = BAR_X + Math.round((BAR_W - slotRowW) / 2);  // 272 (2px in from bar edge)
    const slotY     = panelY + 65;
    for (let i = 0; i < 10; i++) {
      const sx = slotStart + i * (slotSize + slotGap);
      this.add.rectangle(sx, slotY, slotSize, slotSize, 0x8b98a7)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, 0x000000)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => { /* TODO: elements */ });
    }

    // ── Effects placeholder area (right side) ─────
    // (Empty for now — per spec, irrelevant until status effects are added.)

    // ── PAUSED overlay (hidden by default) ────────
    this.pausedText = this.add.text(W / 2, H / 2, 'PAUSED', {
      fontSize: '48px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setVisible(false);
  }

  _togglePause() {
    this._gs.togglePause();
    const paused = this._gs._paused;
    this.pauseIcon.setText(paused ? '▶' : '⏸');
    this.pausedText.setVisible(paused);
  }

  _openStatusSheet() {
    if (!window.statusSheet) return;
    const gs = this._gs;
    const wasPaused = gs && gs._paused;
    if (gs && !wasPaused) gs.togglePause();
    // Mirror in-game HP into the sheet so the bar reflects current state.
    if (gs && window.statusSheet.setStat) {
      window.statusSheet.setStat('hp.current', gs._hp);
      window.statusSheet.setStat('hp.max',     gs._maxHp);
      window.statusSheet.setStat('level',      gs._level);
    }
    window.statusSheet.open({
      onClose: () => { if (gs && !wasPaused) gs.togglePause(); },
    });
  }

  update() {
    if (!this._gs || !this._gs.scene.isActive()) return;
    const gs = this._gs;

    // HP bar
    this.hpFill.displayWidth = (gs._hp / gs._maxHp) * this._BAR_W;
    this.hpText.setText(`${gs._hp}/${gs._maxHp}`);

    // XP bar + level
    this.xpFill.displayWidth = (gs._xp / gs._xpToNext) * this._BAR_W;
    this.xpText.setText(`${gs._xp}/${gs._xpToNext}`);
    this.lvlText.setText(`${gs._level}`);

    // Keep pause icon in sync (in case ESC toggled it)
    const paused = gs._paused;
    if (paused && this.pauseIcon.text !== '▶') this.pauseIcon.setText('▶');
    if (!paused && this.pauseIcon.text !== '⏸') this.pauseIcon.setText('⏸');
    this.pausedText.setVisible(paused);
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
